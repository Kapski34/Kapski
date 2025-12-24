
import { GoogleGenAI, Type } from "@google/genai";

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

export const addWhiteBackground = async (imageFile: Blob): Promise<Blob> => {
  if (!process.env.API_KEY) throw new Error("Brak klucza API.");
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const imagePart = await fileToGenerativePart(imageFile);
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: { parts: [imagePart, { text: "Professional product photography, subject isolated on perfect white background (#FFFFFF). High contrast, sharp edges. No text." }] },
  });
  const part = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
  if (!part?.inlineData) throw new Error("AI nie zwróciło obrazu.");
  const res = await fetch(`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`);
  return await res.blob();
};

// Zdefiniowane unikalne style i PERSPEKTYWY, aby uniknąć klonowania zdjęć
const VARIATION_SHOTS = [
  {
    type: "HERO SHOT",
    desc: "Eye-level perspective, similar to original but with professional studio lighting. Showcase the whole product clearly.",
    theme: "Soft natural morning light with gentle shadows, bokeh background."
  },
  {
    type: "CLOSE-UP DETAIL",
    desc: "Macro-style perspective, zoomed in on the object's texture and details. Dramatic side lighting.",
    theme: "High contrast lighting, focusing on the quality of 3D print layers and material finish."
  },
  {
    type: "THREE-QUARTER VIEW",
    desc: "Slightly high angle and rotated perspective (3/4 view). Show the depth and 3D volume of the product.",
    theme: "Golden hour warm glow, cozy lifestyle atmosphere in a living room context."
  },
  {
    type: "LOW ANGLE ACTION SHOT",
    desc: "Low-angle heroic perspective, looking up at the product to make it look grand and premium.",
    theme: "Vibrant cinematic colors, dynamic shadows, modern architectural interior background."
  }
];

export const generateAdditionalImages = async (
  mainImageBlob: Blob,
  auctionTitle: string,
  count: number,
  stylePrompt: string = "Professional studio setting"
): Promise<{ name: string; blob: Blob }[]> => {
    if (!process.env.API_KEY || count <= 0) return [];
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const imagePart = await fileToGenerativePart(mainImageBlob);

    const tasks = Array.from({ length: count }).map(async (_, i) => {
        const shot = VARIATION_SHOTS[i % VARIATION_SHOTS.length];
        
        const fullPrompt = `
          OBJECTIVE: Generate a ${shot.type} for the product: ${auctionTitle}.
          
          VISUAL RULES:
          1. PERSPECTIVE: ${shot.desc} Change the camera angle relative to the original image to provide a new view.
          2. CONSISTENCY: Maintain the identity of the product (color, shape, design). If there is a bottle, it must stay in the holder.
          3. ENVIRONMENT: Transform the background to: ${stylePrompt}.
          4. STYLE: ${shot.theme}
          
          TECHNICAL: 8k resolution, photorealistic, professional e-commerce quality. No text, no watermarks.
          VARIATION UNIQUE ID: ${i}-${Date.now()}
        `.trim();

        try {
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash-image',
                contents: { parts: [imagePart, { text: fullPrompt }] },
            });
            const part = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
            if (part?.inlineData) {
                const res = await fetch(`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`);
                const blob = await res.blob();
                return { name: `gen_styled_${i + 1}_${Date.now()}.png`, blob };
            }
        } catch (error) {
            console.error(`Błąd generowania wariacji ${i}:`, error);
        }
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
        contents: { parts: [imagePart, { text: `Change color of the object from ${sourceColorHex} to ${targetColorHex}. Maintain texture and shading.` }] },
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
