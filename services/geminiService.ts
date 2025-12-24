
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

export const addWhiteBackground = async (imageFile: Blob): Promise<Blob> => {
  if (!process.env.API_KEY) throw new Error("Brak klucza API.");
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const imagePart = await fileToGenerativePart(imageFile);
  const ratio = await detectAspectRatio(imageFile);
  
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: { parts: [imagePart, { text: "FULL FRAME PRESERVATION: Subject isolated on perfect white background (#FFFFFF). Keep original framing and edges. Do not crop. High contrast, sharp edges. No text, no extra objects." }] },
    config: { imageConfig: { aspectRatio: ratio } }
  });
  const part = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
  if (!part?.inlineData) throw new Error("AI nie zwróciło obrazu.");
  const res = await fetch(`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`);
  return await res.blob();
};

const VARIATION_SHOTS = [
  { type: "HERO SHOT", desc: "Eye-level perspective. Showcase the whole product clearly." },
  { type: "DETAIL SHOT", desc: "Macro-style, focus on texture and quality." },
  { type: "3/4 ANGLE", desc: "Slightly high angle showing depth." },
  { type: "DRAMATIC VIEW", desc: "Dynamic angle with unique lighting." }
];

const INTENSITY_CONFIG = {
  calm: {
    baseTheme: "Clean professional studio setting with neutral minimal background.",
    lighting: "Soft, uniform morning light, very gentle shadows.",
    vibe: "Clean, corporate, technical, minimalist."
  },
  normal: {
    baseTheme: "Modern living room or office interior context.",
    lighting: "Natural daylight with realistic reflections.",
    vibe: "Professional, cozy, lifestyle photography."
  },
  crazy: {
    baseTheme: "Epic cinematic environment like futuristic lab, mystical neon forest, or outer space nebula.",
    lighting: "Dramatic rim lighting, vibrant neon colors, volumetric fog, high contrast.",
    vibe: "Surreal, imaginative, artistic, high-energy."
  }
};

export const generateAdditionalImages = async (
  mainImageBlob: Blob,
  auctionTitle: string,
  count: number,
  userStylePrompt: string = "",
  startIndex: number = 0,
  intensity: BackgroundIntensity = 'normal'
): Promise<{ name: string; blob: Blob }[]> => {
    if (!process.env.API_KEY || count <= 0) return [];
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const imagePart = await fileToGenerativePart(mainImageBlob);
    const ratio = await detectAspectRatio(mainImageBlob);
    const config = INTENSITY_CONFIG[intensity];

    const tasks = Array.from({ length: count }).map(async (_, i) => {
        const shotIndex = (startIndex + i) % VARIATION_SHOTS.length;
        const shot = VARIATION_SHOTS[shotIndex];
        
        const fullPrompt = `
          OBJECTIVE: Generate a ${shot.type} for the product: ${auctionTitle}.
          
          STRICT PRODUCT INTEGRITY RULES:
          1. DO NOT add any text, labels, nameplates, or stickers to the product.
          2. DO NOT change the product's geometry, shape, or surface details.
          3. DO NOT cut off any parts of the product. Keep original framing boundaries.
          4. The product MUST look exactly like a real 3D printed object from the reference.
          
          ENVIRONMENT (BACKGROUND) RULES:
          1. TRANSFORM ONLY THE BACKGROUND AND LIGHTING.
          2. THEME: ${userStylePrompt || config.baseTheme}
          3. LIGHTING: ${config.lighting}
          4. PERSPECTIVE: ${shot.desc}
          5. VIBE: ${config.vibe}
          
          Technical: 8k photorealistic, professional e-commerce quality.
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

export const changeImageColor = async (imageFile: Blob, sourceColorHex: string, targetColorHex: string): Promise<Blob> => {
    if (!process.env.API_KEY) throw new Error("Brak klucza API.");
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const imagePart = await fileToGenerativePart(imageFile);
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts: [imagePart, { text: `Change color of the object from ${sourceColorHex} to ${targetColorHex}. Maintain texture and shading exactly.` }] },
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
