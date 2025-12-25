
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
      TASK: This is a raw 3D render of: ${context}.
      ACTION: Create a FINAL PRODUCTION QUALITY product photo on a pure white background.
      
      CRITICAL INSTRUCTIONS:
      1. SHAPE LOCK: Keep the object's silhouette/outline exactly as it is in the input image.
      2. MATERIALIZATION (IMPORTANT): The input looks like grey clay. YOU MUST PAINT IT.
         - If it's a figurine -> paint it like realistic plastic/resin or metal.
         - If it's a tool -> paint it like plastic/steel.
         - Do not leave it looking like untextured grey geometry.
      3. Background: Hex color #FFFFFF.
      4. Lighting: Soft commercial studio lighting.
    `.trim() }] },
    config: { imageConfig: { aspectRatio: ratio } }
  });
  const part = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
  if (!part?.inlineData) throw new Error("AI nie zwróciło obrazu.");
  const res = await fetch(`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`);
  return await res.blob();
};

const VARIATION_SHOTS = [
  { desc: "Placed on a modern wooden desk. Soft window lighting." },
  { desc: "Minimalist concrete surface. High-end tech vibe." },
  // 3rd Shot: Shelf (Safe)
  { desc: "Sitting on a clean white floating shelf. Defocused living room background." }, 
  // 4th Shot: Dark Tech Studio (Safe)
  { desc: "Professional studio photography. Dark grey matte background. High contrast rim lighting. Tech gadget aesthetic." }
];

const INTENSITY_CONFIG = {
  calm: {
    baseTheme: "Clean, minimalist, professional.",
    lighting: "Soft, diffused."
  },
  normal: {
    baseTheme: "Modern, daily life context.",
    lighting: "Natural."
  },
  crazy: {
    baseTheme: "Dramatic, high contrast, artistic.",
    lighting: "Cinematic."
  }
};

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

    const tasks = Array.from({ length: count }).map(async (_, i) => {
        const sourceBlob = inputs[i % inputs.length];
        const imagePart = await fileToGenerativePart(sourceBlob);
        const ratio = await detectAspectRatio(sourceBlob);
        
        const shotIndex = (startIndex + i) % VARIATION_SHOTS.length;
        const shot = VARIATION_SHOTS[shotIndex];
        
        const fullPrompt = `
          TASK: Create a photorealistic product shot based on this 3D render of: ${auctionTitle}.
          
          RULES:
          1. GEOMETRY (STRICT): The silhouette/shape must NOT change. Do not add limbs, do not distort proportions.
          2. SURFACE (CREATIVE): The input is an untextured model. You MUST apply realistic materials (plastic, metal, resin) appropriate for "${auctionTitle}". 
          3. Do not output the grey "clay" look. Make it look like a finished physical product.
          
          SCENE:
          - Context: ${userStylePrompt || config.baseTheme}
          - Specific Setting: ${shot.desc}
          - Lighting: ${config.lighting} (Apply to environment)
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
                return { name: `gen_${intensity}_${shotIndex + 1}_${Date.now()}.png`, blob };
            }
        } catch (error) { console.error(error); }
        return null;
    });

    const results = await Promise.all(tasks);
    return results.filter((r): r is { name: string; blob: Blob } => r !== null);
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

    // Generate multiple variations in parallel with FORCED ANGLES
    const tasks = Array.from({ length: count }).map(async (_, i) => {
        
        // Define distinct angles for each variation to avoid "flat" look
        const angleStrategies = [
            "CAMERA: 3/4 Isometric View (approx 30 degrees elevation). Show top and front-side clearly. Avoid flat front view.",
            "CAMERA: Dynamic Low Angle (Hero Shot). Look slightly up at the object to give it presence.",
            "CAMERA: Side Profile 45 degrees. Shallow depth of field (blurred background) to emphasize the object."
        ];
        
        const selectedAngle = angleStrategies[i % angleStrategies.length];

        const prompt = `
            Professional product photography. High-end e-commerce commercial shot.
            TASK: Place the product in the input image into a new environment.
            STYLE: ${stylePrompt}
            
            ${selectedAngle}
            
            REQUIREMENTS:
            1. PERSPECTIVE: You MUST adapt the object perspective to match the requested camera angle. It should look like a 3D object sitting in a 3D space, not a flat 2D cutout.
            2. IDENTITY: Preserve the core visual features (colors, logos, texture) of the product, but you are allowed to slightly rotate the perspective to achieve the 3/4 view.
            3. LIGHTING: Use professional studio lighting (softbox, rim light) to highlight the product's texture.
            4. QUALITY: 8k resolution, crisp focus on the product, bokeh/blurred background if appropriate.
            
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
                return { name: `studio_pro_${i + 1}_${Date.now()}.png`, blob };
            }
        } catch (e) { console.error("Studio gen error", e); }
        return null;
    });

    const results = await Promise.all(tasks);
    return results.filter((r): r is { name: string; blob: Blob } => r !== null);
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
