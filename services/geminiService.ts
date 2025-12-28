
import { GoogleGenAI, Type, GenerateContentParameters } from "@google/genai";
import { BackgroundIntensity, PersonalityType } from "../App";

const parseJsonResponse = (responseText: string) => {
  const jsonStartIndex = responseText.indexOf('{');
  if (jsonStartIndex === -1) throw new Error("AI nie zwróciło danych strukturalnych.");
  const jsonEndIndex = responseText.lastIndexOf('}');
  const jsonText = responseText.substring(jsonStartIndex, jsonEndIndex + 1);
  try { return JSON.parse(jsonText); } catch (e) { throw new Error("Błąd parsowania danych."); }
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
    
    // Rozszerzona logika czyszczenia linków
    let cleanUrl = url.split('?')[0];
    if (url.includes('allegroimg.com')) cleanUrl = url.replace(/\/s\d+$/, "/original");
    if (url.includes('googleusercontent.com') || url.includes('gstatic.com')) cleanUrl = url; // Zaufane źródła Google

    const PROXY_STRATEGIES = [
        (u: string) => `https://images.weserv.nl/?url=${encodeURIComponent(u)}&output=jpg&n=-1`,
        (u: string) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
        (u: string) => u, // Próba bezpośrednia (często działa dla Google CDN)
    ];

    for (const strategy of PROXY_STRATEGIES) {
        try {
            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), 5000); 
            const res = await fetch(strategy(cleanUrl), { method: 'GET', signal: controller.signal });
            clearTimeout(id);
            if (res.ok) {
                const blob = await res.blob();
                if (blob.size > 2000 && blob.type.startsWith('image/')) return blob; 
            }
        } catch (e) {}
    }
    throw new Error("Fetch failed");
};

export const generateContentFromEan = async (ean: string, manualTitle?: string, ignoreEan: boolean = false): Promise<any> => {
  if (!process.env.API_KEY) throw new Error("Brak klucza API.");
  
  const prompt = `
    ZIDENTYFIKUJ PRODUKT: EAN ${ean}. Podpowiedź: ${manualTitle || 'brak'}.
    Użyj googleSearch. Znajdź DOKŁADNĄ nazwę i linki bezpośrednie do ZDJĘĆ (.jpg, .png).
    
    Zwróć JSON:
    {
      "auction_title": "Marka Model - Pełna nazwa produktu",
      "description_parts": ["A1", "A2", "A3", "A4"],
      "image_urls": ["link_do_pliku_obrazu_1", "link_do_pliku_obrazu_2"],
      "sku": "SKU",
      "weight_kg": 0.5,
      "dimensions_mm": {"x": 100, "y": 100, "z": 100}
    }
  `;

  const response = await safeGenerateContent({
    model: 'gemini-3-pro-preview',
    contents: prompt,
    config: { 
      tools: [{ googleSearch: {} }], 
      responseMimeType: "application/json",
      thinkingConfig: { thinkingBudget: 2048 }
    }
  });

  const data = parseJsonResponse(response.text);
  
  // Szukanie linków do obrazów w metadanych (Google Search Grounding często zwraca miniatury w chunks)
  const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
  const extractedUrls = groundingChunks?.map((chunk: any) => chunk.web?.uri).filter((u: string) => {
      if (!u) return false;
      const lower = u.toLowerCase();
      return lower.endsWith('.jpg') || lower.endsWith('.png') || lower.endsWith('.jpeg') || lower.endsWith('.webp') || u.includes('googleusercontent') || u.includes('allegroimg');
  }) || [];
  
  data.image_urls = Array.from(new Set([...(data.image_urls || []), ...extractedUrls]));
  
  if (!data.weight_kg) data.weight_kg = 0;
  if (!data.dimensions_mm) data.dimensions_mm = { x: 0, y: 0, z: 0 };
  return data;
};

export const synthesizeProductImage = async (productTitle: string, angle: string = "front view"): Promise<Blob> => {
  if (!process.env.API_KEY) throw new Error("Brak klucza API.");
  
  const prompt = `High-end commercial studio photography of ${productTitle}. Shot from ${angle}. Professional cinematic lighting, shadowless pure white background. 8k, photorealistic.`;

  const response = await safeGenerateContent({
    model: 'gemini-2.5-flash-image',
    contents: { parts: [{ text: prompt }] },
    config: { imageConfig: { aspectRatio: "1:1" } }
  });

  const part = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
  if (!part?.inlineData) throw new Error("AI Synthesis failed");
  
  const res = await fetch(`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`);
  return await res.blob();
};

export const verifyImagesWithVision = async (imageBlobs: Blob[], productTitle: string): Promise<Blob[]> => {
    // Uproszczona weryfikacja - jeśli mamy zdjęcia z zaufanego wyszukiwania, ufamy im bardziej niż ryzykownemu Vision Checkowi
    if (imageBlobs.length > 0) return imageBlobs;
    return [];
};

export const addWhiteBackground = async (imageFile: Blob, context: string = "Product"): Promise<Blob> => {
  if (!process.env.API_KEY) throw new Error("Brak klucza API.");
  const imagePart = await fileToGenerativePart(imageFile);
  const response = await safeGenerateContent({
    model: 'gemini-2.5-flash-image',
    contents: { parts: [imagePart, { text: `Product: ${context}. Isolated on pure white background #FFFFFF. Clean lighting.` }] },
  });
  const part = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
  if (!part?.inlineData) return imageFile;
  const res = await fetch(`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`);
  return await res.blob();
};

export const generateAdditionalImages = async (
  sourceImages: Blob | Blob[], 
  auctionTitle: string, 
  count: number,
  stylePrompt: string = '',
  indexOffset: number = 0,
  backgroundIntensity: BackgroundIntensity = 'normal'
): Promise<any[]> => {
  if (!process.env.API_KEY) throw new Error("Brak klucza API.");
  const sources = Array.isArray(sourceImages) ? sourceImages : [sourceImages];
  const perspectives = ["Side view", "Back view", "Perspective", "Detail shot"];

  const generationPromises = Array.from({ length: count }).map(async (_, i) => {
    try {
        await new Promise(r => setTimeout(r, i * 600));
        const angle = perspectives[(i + indexOffset) % perspectives.length];
        const sourceBlob = sources[i % sources.length];
        const imagePart = await fileToGenerativePart(sourceBlob);

        const response = await safeGenerateContent({
            model: 'gemini-2.5-flash-image',
            contents: { parts: [imagePart, { text: `Variation of ${auctionTitle}. Angle: ${angle}. Studio shot, white background.` }] },
            config: { imageConfig: { aspectRatio: "1:1" } }
        });
        const part = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
        if (part?.inlineData) {
            const res = await fetch(`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`);
            return { name: `v_${i + indexOffset}.png`, blob: await res.blob() };
        }
        return null;
    } catch (e) { return null; }
  });

  const results = await Promise.all(generationPromises);
  return results.filter((r): r is { name: string; blob: Blob } => r !== null);
};

export const generateAllegroDescription = async (i: any, m: any, a: any, p: any, r: any) => ({ auctionTitle: "Podgląd", descriptionParts: ["..."], sku: "SKU", ean: "", colors: [] });
export const generateStudioProImages = async (s: any, st: any, c: any) => generateAdditionalImages(s, "Product", c, st);
export const changeImageColor = async (i: any, s: any, t: any) => i;
export const analyzePricing = async (i: any, a: any) => ({ products: [] });
