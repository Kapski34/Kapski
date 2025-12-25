
import { GoogleGenAI, Type } from "@google/genai";
import { BackgroundIntensity } from "../App";

const parseJsonResponse = (responseText: string) => {
  const jsonStartIndex = responseText.indexOf('{');
  if (jsonStartIndex === -1) throw new Error(`Błąd odpowiedzi.`);
  const jsonEndIndex = responseText.lastIndexOf('}');
  const jsonText = responseText.substring(jsonStartIndex, jsonEndIndex + 1);
  try { return JSON.parse(jsonText); } catch (e) { throw new Error(`Błąd JSON.`); }
};

const fileToGenerativePart = async (file: Blob): Promise<{ inlineData: { data: string; mimeType: string } }> => {
  const base64EncodedDataPromise = new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => { resolve(typeof reader.result === 'string' ? reader.result.split(',')[1] : ''); };
    reader.readAsDataURL(file);
  });
  const base64EncodedData = await base64EncodedDataPromise;
  return { inlineData: { data: base64EncodedData, mimeType: file.type || 'image/png' } };
};

const detectAspectRatio = (blob: Blob): Promise<"1:1" | "3:4" | "4:3" | "9:16" | "16:9"> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const ratio = img.width / img.height;
      URL.revokeObjectURL(img.src);
      if (ratio > 1.5) resolve("16:9");
      else if (ratio > 1.2) resolve("4:3");
      else if (ratio < 0.6) resolve("9:16");
      else if (ratio < 0.8) resolve("3:4");
      else resolve("1:1");
    };
    img.src = URL.createObjectURL(blob);
  });
};

export const generateAllegroDescription = async (
  imageFiles: File[],
  modelFile: File | null,
  additionalInfo: string
): Promise<{ auctionTitle: string; descriptionParts: string[]; selectedImageNames: string[], sku: string; ean: string; colors: string[] }> => {
  if (!process.env.API_KEY) throw new Error("Brak klucza API.");
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const modelFileName = modelFile?.name || null;
  const textPrompt = `Jesteś copywriterem e-commerce. Stwórz wysokokonwersyjny opis na Allegro (4 akapity: Haczyk, Technologia, Styl, CTA) na podstawie zdjęć i nazwy pliku "${modelFileName}". Info: ${additionalInfo}. Zwróć JSON {auction_title, description_parts, sku, ean, colors}.`;
  const imageContentParts = await Promise.all(imageFiles.slice(0, 3).map(file => fileToGenerativePart(file)));
  
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: { parts: [...imageContentParts, { text: textPrompt }] },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          auction_title: { type: Type.STRING },
          description_parts: { type: Type.ARRAY, items: { type: Type.STRING } },
          sku: { type: Type.STRING },
          ean: { type: Type.STRING },
          colors: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
      },
    },
  });
  const jsonResponse = parseJsonResponse(response.text);
  return {
    auctionTitle: jsonResponse.auction_title,
    descriptionParts: jsonResponse.description_parts,
    selectedImageNames: [],
    sku: jsonResponse.sku || '',
    ean: jsonResponse.ean || '',
    colors: jsonResponse.colors || [],
  };
};

export const addWhiteBackground = async (imageFile: Blob, context: string = "Product"): Promise<Blob> => {
  if (!process.env.API_KEY) throw new Error("Brak klucza API.");
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const imagePart = await fileToGenerativePart(imageFile);
  const ratio = await detectAspectRatio(imageFile);
  
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: { parts: [imagePart, { text: `
      TASK: Enhance this image of a "${context}" into a FINAL PRODUCT PHOTO.
      
      INSTRUCTIONS:
      1. BACKGROUND: Pure White (#FFFFFF).
      2. GEOMETRY: LOCK THE SHAPE. Do not change the outline/silhouette at all.
      3. COLOR & MATERIAL: 
         - IF the input object has clear colors (e.g. brown, red, blue), KEEP THEM EXACTLY AS IS. Do not change the object's color.
         - ONLY IF the input is a solid grey untextured 3D render, then apply realistic materials (Metal/Plastic/Resin).
      4. LIGHTING: Studio lighting, soft shadows.
      5. NEGATIVE: NO TEXT, NO LABELS, NO SIGNS, NO WATERMARKS, NO STANDS WITH TEXT.
    `.trim() }] },
    config: { imageConfig: { aspectRatio: ratio } }
  });
  const part = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
  if (!part?.inlineData) throw new Error("AI nie zwróciło obrazu.");
  const res = await fetch(`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`);
  return await res.blob();
};

const VARIATION_SHOTS = [
  // Shot 1: Office/Desk (Lifestyle)
  { desc: "Setting: Premium wooden desk. Lighting: Cinematic natural daylight. Camera: Eye-level product shot." },
  
  // Shot 2: Dark Studio
  { desc: "Setting: Dark elegant studio surface. Lighting: Dramatic rim lighting (blue/orange). Camera: Slightly low angle hero shot." },
  
  // Shot 3: Interior/Living Room
  { desc: "Setting: Modern bright living room coffee table. Lighting: Soft ambient cozy light. Camera: 3/4 angle view." },
  
  // Shot 4: Macro/Detail
  { desc: "Setting: Neutral professional surface. Lighting: Softbox studio light. Camera: Macro close-up, shallow depth of field." }
];

const INTENSITY_CONFIG = {
  calm: {
    baseTheme: "Clean, minimalist.",
    lighting: "Soft, diffused."
  },
  normal: {
    baseTheme: "Modern, realistic.",
    lighting: "Cinematic, volumetric."
  },
  crazy: {
    baseTheme: "Dramatic, high contrast, artistic.",
    lighting: "Dynamic, colorful."
  }
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const generateAdditionalImages = async (
  sourceImages: Blob | Blob[],
  auctionTitle: string,
  count: number,
  userStylePrompt: string = "",
  startIndex: number = 0,
  intensity: BackgroundIntensity = 'normal'
): Promise<{ name: string; blob: Blob }[]> => {
    if (!process.env.API_KEY || count <= 0) return [];
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    // Normalize input to array
    const inputs = Array.isArray(sourceImages) ? sourceImages : [sourceImages];
    const config = INTENSITY_CONFIG[intensity];

    const results: { name: string; blob: Blob }[] = [];

    // EXECUTE SEQUENTIALLY TO AVOID 429 RATE LIMITS
    for (let i = 0; i < count; i++) {
        const sourceBlob = inputs[i % inputs.length];
        const imagePart = await fileToGenerativePart(sourceBlob);
        const ratio = await detectAspectRatio(sourceBlob);
        
        const shotIndex = (startIndex + i) % VARIATION_SHOTS.length;
        const shot = VARIATION_SHOTS[shotIndex];
        
        let sceneDescription = "";
        
        if (userStylePrompt && userStylePrompt.length > 2) {
            sceneDescription = `
                THEME: ${userStylePrompt}.
                COMPOSITION: Integrate the product into this theme, but strictly follow this camera setup: ${shot.desc}
            `;
        } else {
            sceneDescription = `
                THEME: ${config.baseTheme}
                SCENARIO: ${shot.desc}
            `;
        }

        const fullPrompt = `
          TASK: Create a photorealistic product shot of: ${auctionTitle}.
          
          RULES:
          1. GEOMETRY (STRICT): The silhouette/shape must NOT change.
          2. COLOR (CRITICAL):
             - IF the input object is COLORED (e.g. brown reindeer, red handle): YOU MUST PRESERVE THE ORIGINAL OBJECT COLORS. Do not camouflage it.
             - IF the input is GREY CLAY: Apply realistic materials.
          3. CLEANLINESS: NO TEXT, NO LABELS, NO SIGNS, NO PRICE TAGS, NO WATERMARKS. The surface/background must be clean.
          
          SCENE:
          ${sceneDescription}
          
          Lighting Style: ${config.lighting}
          Quality: 8k, Unreal Engine 5 Render, highly detailed.
          Variation Seed: ${Date.now() + i}
        `.trim();

        try {
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash-image',
                contents: { parts: [imagePart, { text: fullPrompt }] },
                config: { imageConfig: { aspectRatio: ratio } }
            });
            const part = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
            if (part?.inlineData) {
                const res = await fetch(`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`);
                const blob = await res.blob();
                results.push({ name: `gen_${intensity}_${shotIndex + 1}_${Date.now()}.png`, blob });
            }
        } catch (error) { 
            console.error("Gemini Gen Error:", error); 
            // Continue to next image even if one fails
        }
        
        // Add 2s delay between requests to respect rate limits
        if (i < count - 1) await delay(2000);
    }

    return results;
};

// --- NEW FUNCTION FOR VIRTUAL STUDIO ---
export const generateStudioProImages = async (
    sourceImage: Blob,
    stylePrompt: string,
    count: number
): Promise<{ name: string; blob: Blob }[]> => {
    if (!process.env.API_KEY || count <= 0) return [];
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const imagePart = await fileToGenerativePart(sourceImage);
    const ratio = await detectAspectRatio(sourceImage);

    const results: { name: string; blob: Blob }[] = [];

    // EXECUTE SEQUENTIALLY TO AVOID 429 RATE LIMITS
    for (let i = 0; i < count; i++) {
        const angleStrategies = [
            "CAMERA: 3/4 Isometric View (approx 30 degrees elevation).",
            "CAMERA: Dynamic Low Angle (Hero Shot).",
            "CAMERA: Side Profile 45 degrees."
        ];
        
        const selectedAngle = angleStrategies[i % angleStrategies.length];

        const prompt = `
            Professional product photography.
            TASK: Place the product in the input image into a new environment.
            STYLE/THEME: ${stylePrompt}
            
            ${selectedAngle}
            
            REQUIREMENTS:
            1. IDENTITY: Preserve the core visual features (COLORS, logos, texture) of the product. If the input is brown, the output must be brown.
            2. PERSPECTIVE: Adapt the object perspective to match the requested camera angle.
            3. LIGHTING: Use professional studio lighting.
            4. NEGATIVE: DO NOT GENERATE ANY TEXT, LABELS, SIGNS, OR PLACARDS.
            
            Variation seed: ${Date.now() + i}
        `;

        try {
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash-image',
                contents: { parts: [imagePart, { text: prompt }] },
                config: { imageConfig: { aspectRatio: ratio } }
            });
            const part = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
            if (part?.inlineData) {
                const res = await fetch(`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`);
                const blob = await res.blob();
                results.push({ name: `studio_pro_${i + 1}_${Date.now()}.png`, blob });
            }
        } catch (e) { 
            console.error("Studio gen error", e); 
            // If quota exhausted, we might want to throw to inform UI, or just return partial results.
            // Throwing makes more sense if 0 images are generated.
            if ((e as any)?.status === 429 || (e as any)?.message?.includes('429')) {
                // Wait longer if we hit rate limit inside loop, although typically the API throws immediately
                await delay(5000);
            }
        }
        
        // Add 2s delay between requests
        if (i < count - 1) await delay(2000);
    }

    return results;
};


export const changeImageColor = async (imageFile: Blob, sourceColorHex: string, targetColorHex: string): Promise<Blob> => {
    if (!process.env.API_KEY) throw new Error("Brak klucza API.");
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const imagePart = await fileToGenerativePart(imageFile);
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts: [imagePart, { text: `Change the color of this object to ${targetColorHex}. Keep all embossed details, logos, and shadows exactly as they are. Do not add text.` }] },
    });
    const part = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
    if (!part?.inlineData) throw new Error("Błąd.");
    const res = await fetch(`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`);
    return await res.blob();
};

export const analyzePricing = async (imageFile: Blob, auctionTitle: string): Promise<{ products: { productTitle: string; pricePln: string; productUrl: string; }[] }> => {
  if (!process.env.API_KEY) throw new Error("Brak klucza.");
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const imagePart = await fileToGenerativePart(imageFile);
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: { parts: [imagePart, { text: `Search Google for current prices of: ${auctionTitle}. Return JSON {products: [{product_title, price_pln, product_url}]}.` }] },
    config: { tools: [{googleSearch: {}}] },
  });
  try {
    const json = parseJsonResponse(response.text);
    return { products: (json.products || []).map((p:any) => ({ productTitle: p.product_title, pricePln: p.price_pln, productUrl: p.product_url })) };
  } catch (e) { return { products: [] }; }
};
