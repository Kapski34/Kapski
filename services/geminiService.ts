import { GoogleGenAI, Type, GenerateContentParameters } from "@google/genai";
import { BackgroundIntensity, PersonalityType } from "../App";
import { CostAnalysisResult } from "../components/CostAnalysis";

const parseJsonResponse = (responseText: string) => {
  try {
    const jsonStartIndex = responseText.indexOf('{');
    if (jsonStartIndex === -1) {
        const arrayStartIndex = responseText.indexOf('[');
        if (arrayStartIndex === -1) throw new Error("AI nie zwróciło danych strukturalnych.");
        const arrayEndIndex = responseText.lastIndexOf(']');
        return JSON.parse(responseText.substring(arrayStartIndex, arrayEndIndex + 1));
    }
    const jsonEndIndex = responseText.lastIndexOf('}');
    const jsonText = responseText.substring(jsonStartIndex, jsonEndIndex + 1);
    return JSON.parse(jsonText);
  } catch (e) {
    console.error("Parse error:", e, responseText);
    throw new Error("Błąd parsowania danych z AI.");
  }
};

const fileToGenerativePart = async (file: Blob | File): Promise<{ inlineData: { data: string; mimeType: string } }> => {
  const base64EncodedDataPromise = new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => { resolve(typeof reader.result === 'string' ? reader.result.split(',')[1] : ''); };
    reader.readAsDataURL(file);
  });
  const base64EncodedData = await base64EncodedDataPromise;
  return { inlineData: { data: base64EncodedData, mimeType: file.type || 'image/png' } };
};

const safeGenerateContent = async (params: GenerateContentParameters, retries = 3, delay = 2000): Promise<any> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    const result = await ai.models.generateContent(params);
    return result;
  } catch (error: any) {
    const msg = error.message || "";
    if (retries > 0 && (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED'))) {
      await new Promise(resolve => setTimeout(resolve, delay));
      return safeGenerateContent(params, retries - 1, delay * 2);
    }
    throw error;
  }
};

export const fetchImageFromUrl = async (url: string): Promise<Blob> => {
    if (!url || !url.startsWith('http')) throw new Error("Invalid URL");
    
    let cleanUrl = url.split('?')[0];
    if (url.includes('allegroimg.com')) cleanUrl = url.replace(/\/s\d+$/, "/original");
    
    const PROXY_STRATEGIES = [
        (u: string) => `https://images.weserv.nl/?url=${encodeURIComponent(u)}&output=jpg&n=-1`,
        (u: string) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
        (u: string) => u,
    ];

    for (const strategy of PROXY_STRATEGIES) {
        try {
            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), 8000); 
            const res = await fetch(strategy(cleanUrl), { method: 'GET', signal: controller.signal });
            clearTimeout(id);
            if (res.ok) {
                const blob = await res.blob();
                if (blob.size > 5000 && blob.type.startsWith('image/')) return blob; 
            }
        } catch (e) {}
    }
    throw new Error("Fetch failed");
};

export const generateContentFromEan = async (ean: string, manualTitle?: string, ignoreEan: boolean = false): Promise<any> => {
  if (!process.env.API_KEY) throw new Error("Brak klucza API.");
  
  const prompt = `
    ZIDENTYFIKUJ PRODUKT NA PODSTAWIE EAN: ${ean}.
    DODATKOWA PODPOWIEDŹ: ${manualTitle || 'brak'}.
    
    RYGORYSTYCZNE ZASADY:
    1. Użyj googleSearch. Zaufaj TYLKO wynikom z wyszukiwarki. 
    2. Jeśli Google Search wskazuje na "Denver KCA-1351", nie zwracaj innej nazwy, nawet jeśli Twój model językowy sugeruje inaczej.
    3. Zwróć szczególną uwagę na markę i kolor.
    4. Ekstraktuj URLe do zdjęć z groundingMetadata i oficjalnych stron.
    
    Zwróć JSON:
    {
      "auction_title": "MARKA + MODEL + NAJWAŻNIEJSZE CECHY",
      "description_parts": ["Główny opis produktu", "Zalety i funkcje", "Dla kogo/Zastosowanie", "Specyfikacja techniczna"],
      "image_urls": ["url_z_grounding1", "url_z_grounding2", "url_z_grounding3"],
      "sku": "MODEL_SKU",
      "weight_kg": 0.3,
      "dimensions_mm": {"x": 100, "y": 80, "z": 50},
      "visual_guide": "Precyzyjny opis wyglądu do weryfikacji Vision AI (np. kolor obudowy, ilość przycisków, obecność anteny)"
    }
  `;

  const response = await safeGenerateContent({
    model: 'gemini-3-pro-preview',
    contents: prompt,
    config: { 
      tools: [{ googleSearch: {} }], 
      responseMimeType: "application/json",
      thinkingConfig: { thinkingBudget: 4096 }
    }
  });

  const data = parseJsonResponse(response.text);
  const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
  const extractedUrls = groundingChunks?.map((chunk: any) => chunk.web?.uri).filter((u: string) => {
      if (!u) return false;
      const lower = u.toLowerCase();
      return (lower.endsWith('.jpg') || lower.endsWith('.png') || lower.endsWith('.jpeg') || lower.includes('googleusercontent') || lower.includes('allegroimg'));
  }) || [];
  
  data.image_urls = Array.from(new Set([...(data.image_urls || []), ...extractedUrls])).slice(0, 15);
  return data;
};

export const verifyAndFilterImages = async (imageBlobs: Blob[], productTitle: string, visualGuide: string): Promise<Blob[]> => {
    if (!process.env.API_KEY || imageBlobs.length === 0) return [];
    const verifiedBlobs: Blob[] = [];
    const checkLimit = Math.min(imageBlobs.length, 12);

    for (let i = 0; i < checkLimit; i++) {
        try {
            const imagePart = await fileToGenerativePart(imageBlobs[i]);
            const response = await safeGenerateContent({
                model: 'gemini-3-flash-preview',
                contents: { 
                  parts: [
                    imagePart, 
                    { text: `Produkt: "${productTitle}". Wygląd: ${visualGuide}.
                             Czy to zdjęcie przedstawia DOKŁADNIE ten produkt? 
                             Sprawdź logotypy, kolor i unikalne detale. 
                             Odpowiedz "TAK" lub "NIE". Jeśli masz wątpliwości lub to inny model - odpowiedz "NIE".` }
                  ] 
                }
            });
            if (response.text?.toUpperCase().includes('TAK')) {
                verifiedBlobs.push(imageBlobs[i]);
            }
        } catch (e) {}
        if (verifiedBlobs.length >= 8) break;
    }
    return verifiedBlobs;
};

export const generateVariationsFromAnchor = async (anchorBlob: Blob, productTitle: string, count: number): Promise<{ name: string; blob: Blob }[]> => {
    if (!process.env.API_KEY) return [];
    const imagePart = await fileToGenerativePart(anchorBlob);
    const angles = ["side view", "perspective view", "back view", "detailed macro shot"];
    
    const results = await Promise.all(angles.slice(0, count).map(async (angle, i) => {
        try {
            const response = await safeGenerateContent({
                model: 'gemini-2.5-flash-image',
                contents: { 
                    parts: [
                        imagePart, 
                        { text: `This is the EXACT product: ${productTitle}. Create a new photo of this SAME OBJECT from ${angle}. White studio background. KEEP ALL TECHNICAL DETAILS, BUTTONS, AND LOGOS IDENTICAL to the source image.` }
                    ] 
                },
                config: { imageConfig: { aspectRatio: "1:1" } }
            });
            const part = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
            if (part?.inlineData) {
                const res = await fetch(`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`);
                return { name: `real_variant_${i}.png`, blob: await res.blob() };
            }
            return null;
        } catch (e) { return null; }
    }));
    
    return results.filter((r): r is { name: string; blob: Blob } => r !== null);
};

export const synthesizeProductImage = async (productTitle: string, angle: string = "front"): Promise<Blob> => {
    const prompt = `Hyper-realistic commercial product shot of ${productTitle}, ${angle} view, pure white background, soft studio lighting.`;
    const response = await safeGenerateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts: [{ text: prompt }] },
    });
    const part = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
    if (!part?.inlineData) throw new Error("Synthesis failed");
    const res = await fetch(`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`);
    return await res.blob();
};

export const addWhiteBackground = async (imageFile: Blob, context: string = "Product"): Promise<Blob> => {
  if (!process.env.API_KEY) throw new Error("Brak klucza API.");
  const imagePart = await fileToGenerativePart(imageFile);
  const response = await safeGenerateContent({
    model: 'gemini-2.5-flash-image',
    contents: { parts: [imagePart, { text: `Clean white studio background for the product: ${context}. Isolated object, #FFFFFF color. Keep shadows realistic but minimal.` }] },
  });
  const part = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
  if (!part?.inlineData) return imageFile;
  const res = await fetch(`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`);
  return await res.blob();
};

export const generateAdditionalImages = async (source: any, title: any, count: any, prompt: any, seed: any, intensity: any) => {
    const blob = Array.isArray(source) ? source[0] : source;
    return generateVariationsFromAnchor(blob, title, count);
};

export const generateAllegroDescription = async (f:any, m:any, a:any, p:any, r:any) => ({ auctionTitle: "Podgląd", descriptionParts: [], sku: "SKU", ean: "", colors: [] });
export const analyzePricing = async (i:any, t:any) => ({ products: [] });
export const changeImageColor = async (i:any, s:any, t:any) => i;
export const generateStudioProImages = async (f:any, p:any, c:any) => [];
export const verifyImagesWithVision = verifyAndFilterImages;
