import { GoogleGenAI, Type } from "@google/genai";
import { BackgroundIntensity } from "../App";

// Helper for delays
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Standard retry wrapper for API calls (Fast retry for Paid Tier)
async function retryOperation<T>(operation: () => Promise<T>, defaultDelay: number = 1000, retries: number = 3): Promise<T> {
    try {
        return await operation();
    } catch (error: any) {
        // Check for Rate Limit (429) or Quota Exceeded
        const isRateLimit = error?.status === 429 || error?.message?.includes('429') || error?.message?.includes('Quota') || error?.message?.includes('RESOURCE_EXHAUSTED');
        
        if (retries > 0 && isRateLimit) {
            console.warn(`Rate limit hit (429). Retrying in ${defaultDelay}ms... (${retries} retries left)`);
            await delay(defaultDelay);
            // Exponential backoff: 1s -> 2s -> 4s
            return retryOperation(operation, defaultDelay * 2, retries - 1);
        }
        throw error;
    }
}

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
    img.onerror = () => resolve("1:1"); // Fallback
    img.src = URL.createObjectURL(blob);
  });
};

export const generateAllegroDescription = async (
  imageFiles: File[],
  modelFile: File | null,
  additionalInfo: string
): Promise<{ auctionTitle: string; descriptionParts: string[]; selectedImageNames: string[], sku: string; ean: string; colors: string[] }> => {
  if (!process.env.API_KEY) throw new Error("Brak klucza API.");
  
  return retryOperation(async () => {
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
      
      const responseText = response.text;
      if (!responseText) throw new Error("Błąd generowania: AI nie zwróciło tekstu.");
      
      const jsonResponse = parseJsonResponse(responseText);
      return {
        auctionTitle: jsonResponse.auction_title,
        descriptionParts: jsonResponse.description_parts,
        selectedImageNames: [],
        sku: jsonResponse.sku || '',
        ean: jsonResponse.ean || '',
        colors: jsonResponse.colors || [],
      };
  });
};

export const addWhiteBackground = async (imageFile: Blob): Promise<Blob> => {
  if (!process.env.API_KEY) throw new Error("Brak klucza API.");
  console.log("Generowanie białego tła...");
  
  return retryOperation(async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const imagePart = await fileToGenerativePart(imageFile);
    const ratio = await detectAspectRatio(imageFile);
    
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: { parts: [imagePart, { text: `
        TASK: Create a pure white background product shot for e-commerce.
        
        RULES:
        1. PRESERVE THE OBJECT EXACTLY. Do not change its shape, color, or texture. The input image may have specific 3D print colors - keep them.
        2. If the input image has transparency, fill the transparent area with #FFFFFF.
        3. If the input has a background, replace it with #FFFFFF.
        4. KEEP SHADOWS if they look natural, otherwise generate a soft contact shadow.
        5. Output high resolution, photorealistic image.
      `.trim() }] },
      config: { imageConfig: { aspectRatio: ratio } }
    });
    const part = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
    if (!part?.inlineData) throw new Error("AI nie zwróciło obrazu.");
    const res = await fetch(`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`);
    return await res.blob();
  });
};

const VARIATION_SHOTS = [
  { desc: "Placed on a modern wooden desk. Soft window lighting." },
  { desc: "Minimalist concrete surface. High-end tech vibe." },
  { desc: "Held in a hand (blurred background). Lifestyle context." },
  { desc: "Creative colorful studio background." }
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
    console.log(`Generowanie ${count} dodatkowych zdjęć (tryb szybki)...`);
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const inputs = Array.isArray(sourceImages) ? sourceImages : [sourceImages];
    if (inputs.length === 0) return [];

    const config = INTENSITY_CONFIG[intensity];

    // EXECUTE IN PARALLEL for Paid Tier Speed
    const promises = Array.from({ length: count }).map(async (_, i) => {
        const sourceBlob = inputs[i % inputs.length];
        if (!sourceBlob) return null;

        const shotIndex = (startIndex + i) % VARIATION_SHOTS.length;
        const shot = VARIATION_SHOTS[shotIndex];
        
        const fullPrompt = `
          TASK: Place this 3D printed object into a realistic scene.
          
          STRICT GEOMETRY LOCK:
          - The input image contains the EXACT product. DO NOT CHANGE ITS SHAPE OR DETAILS.
          - If the input is a 3D render with specific colors, PRESERVE THEM.
          
          SCENE:
          - Context: ${userStylePrompt || config.baseTheme}
          - Specific Setting: ${shot.desc}
          - Lighting: ${config.lighting} (match product lighting to background)
          
          QUALITY: 8k resolution, highly detailed, photorealistic.
        `.trim();

        try {
            const resultBlob = await retryOperation(async () => {
                const imagePart = await fileToGenerativePart(sourceBlob);
                const ratio = await detectAspectRatio(sourceBlob);

                const response = await ai.models.generateContent({
                    model: 'gemini-2.5-flash-image',
                    contents: { parts: [imagePart, { text: fullPrompt }] },
                    config: { imageConfig: { aspectRatio: ratio } }
                });
                const part = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
                if (part?.inlineData) {
                    const res = await fetch(`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`);
                    return await res.blob();
                }
                throw new Error("No image data returned");
            });

            return { name: `gen_${intensity}_${shotIndex + 1}_${Date.now()}.png`, blob: resultBlob };
            
        } catch (error) { 
            console.error(`Błąd generowania zdjęcia ${i+1}/${count}:`, error);
            return null; 
        }
    });

    const results = await Promise.all(promises);
    return results.filter((r): r is { name: string; blob: Blob } => r !== null);
};

export const changeImageColor = async (imageFile: Blob, sourceColorHex: string, targetColorHex: string): Promise<Blob> => {
    if (!process.env.API_KEY) throw new Error("Brak klucza API.");
    
    return retryOperation(async () => {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const imagePart = await fileToGenerativePart(imageFile);
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: { parts: [imagePart, { text: `Change the color of this object to ${targetColorHex}. Keep all embossed details, logos, and shadows exactly as they are. Do not add text. High resolution.` }] },
        });
        const part = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
        if (!part?.inlineData) throw new Error("Błąd.");
        const res = await fetch(`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`);
        return await res.blob();
    });
};

export const analyzePricing = async (imageFile: Blob, auctionTitle: string): Promise<{ products: { productTitle: string; pricePln: string; productUrl: string; }[] }> => {
  if (!process.env.API_KEY) throw new Error("Brak klucza.");
  
  return retryOperation(async () => {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const imagePart = await fileToGenerativePart(imageFile);
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: { parts: [imagePart, { text: `Search Google for current prices of: ${auctionTitle}. Return JSON {products: [{product_title, price_pln, product_url}]}.` }] },
        config: { tools: [{googleSearch: {}}] },
      });
      const responseText = response.text;
      if (!responseText) throw new Error("Brak odpowiedzi tekstowej.");
      
      const json = parseJsonResponse(responseText);
      return { products: (json.products || []).map((p:any) => ({ productTitle: p.product_title, pricePln: p.price_pln, productUrl: p.product_url })) };
  });
};