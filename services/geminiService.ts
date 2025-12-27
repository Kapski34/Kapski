
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

/**
 * Wraps Gemini API calls with retry logic for 429 (Rate Limit) errors.
 */
const safeGenerateContent = async (params: GenerateContentParameters, retries = 3, delay = 2000): Promise<any> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    const result = await ai.models.generateContent(params);
    return result;
  } catch (error: any) {
    if (retries > 0 && (error.message?.includes('429') || error.message?.includes('RESOURCE_EXHAUSTED'))) {
      console.warn(`Rate limit hit, retrying in ${delay}ms... (${retries} attempts left)`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return safeGenerateContent(params, retries - 1, delay * 2);
    }
    throw error;
  }
};

export const fetchImageFromUrl = async (url: string): Promise<Blob> => {
    if (!url || !url.startsWith('http')) throw new Error("Nieprawidłowy URL");
    let cleanUrl = url.split('?')[0];
    if (url.includes('allegroimg.com')) cleanUrl = url.replace(/\/s\d+$/, "/original");

    const PROXY_STRATEGIES = [
        (u: string) => `https://images.weserv.nl/?url=${encodeURIComponent(u)}&output=jpg&n=-1`,
        (u: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
    ];

    for (const strategy of PROXY_STRATEGIES) {
        try {
            const res = await fetch(strategy(cleanUrl), { method: 'GET' });
            if (res.ok) {
                const blob = await res.blob();
                if (blob.size > 5000) return blob; 
            }
        } catch (e) {}
    }
    throw new Error("Błąd pobierania");
};

export const generateContentFromEan = async (ean: string, manualTitle?: string, ignoreEan: boolean = false): Promise<any> => {
  if (!process.env.API_KEY) throw new Error("Brak klucza API.");
  
  const searchPrompt = ignoreEan && manualTitle 
    ? `DOKŁADNY PRODUKT: "${manualTitle}"` 
    : `ZWERYFIKUJ EAN: ${ean}. Podpowiedź od użytkownika: ${manualTitle || 'brak'}. Użyj googleSearch, aby znaleźć dokładną nazwę i specyfikację tego konkretnego kodu EAN.`;

  const prompt = `
    ZADANIE: Zidentyfikuj produkt na podstawie kodu EAN: ${ean}.
    KROKI:
    1. Użyj narzędzia googleSearch.
    2. Znajdź dokładną nazwę handlową, markę i model.
    3. Wyodrębnij parametry techniczne (waga, wymiary, kolor).
    4. Znajdź bezpośrednie linki do zdjęć produktu (.jpg, .png).
    
    WAŻNE: Nie zgaduj. Jeśli EAN wskazuje na inny produkt niż podpowiedź użytkownika, zaufaj wynikom wyszukiwania EAN.
    
    ZWROT JSON:
    {
      "auction_title": "Marka Model - Pełna nazwa produktu",
      "description_parts": ["Akapit 1 - opis ogólny", "Akapit 2 - cechy", "Akapit 3 - specyfikacja", "Akapit 4 - dlaczego warto"],
      "image_urls": ["link1", "link2", "link3"],
      "sku": "SKU-PROD",
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
  if (!data.weight_kg) data.weight_kg = 0;
  if (!data.dimensions_mm) data.dimensions_mm = { x: 0, y: 0, z: 0 };
  return data;
};

export const synthesizeProductImage = async (productTitle: string, angle: string = "front view"): Promise<Blob> => {
  if (!process.env.API_KEY) throw new Error("Brak klucza API.");
  
  const prompt = `High-quality commercial e-commerce photography of ${productTitle}. 
  Angle: ${angle}. 
  Environment: Professional photo studio, soft cinematic lighting, shadowless, isolated on pure #FFFFFF white background. 
  Details: Ultra-sharp focus, 8k resolution, photorealistic, premium feel.`;

  const response = await safeGenerateContent({
    model: 'gemini-2.5-flash-image',
    contents: { parts: [{ text: prompt }] },
    config: { imageConfig: { aspectRatio: "1:1" } }
  });

  const part = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
  if (!part?.inlineData) throw new Error(`Nie udało się wygenerować obrazu dla kąta: ${angle}`);
  
  const res = await fetch(`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`);
  return await res.blob();
};

export const verifyImagesWithVision = async (imageBlobs: Blob[], productTitle: string): Promise<Blob[]> => {
    if (!process.env.API_KEY || imageBlobs.length === 0) return imageBlobs;
    
    const verificationPromises = imageBlobs.map(async (blob) => {
        try {
            const imagePart = await fileToGenerativePart(blob);
            const response = await safeGenerateContent({
                model: 'gemini-3-flash-preview',
                contents: { parts: [imagePart, { text: `Visual check: Is this exact product shown: "${productTitle}"? Be strict. Answer YES or NO.` }] }
            });
            return response.text?.toUpperCase().includes('YES') ? blob : null;
        } catch (e) { return null; }
    });

    const results = await Promise.all(verificationPromises);
    return results.filter((b): b is Blob => b !== null);
};

export const addWhiteBackground = async (imageFile: Blob, context: string = "Product"): Promise<Blob> => {
  if (!process.env.API_KEY) throw new Error("Brak klucza API.");
  const imagePart = await fileToGenerativePart(imageFile);
  const response = await safeGenerateContent({
    model: 'gemini-2.5-flash-image',
    contents: { parts: [imagePart, { text: `Extract the product "${context}" and place it on a perfectly clean, shadow-balanced #FFFFFF pure white background. Keep original lighting on the product.` }] },
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
  
  const perspectives = [
    "Side profile view, high detail", 
    "Rear angle view showing connectors and back details", 
    "Macro close-up on textures and buttons", 
    "Wide 45-degree isometric perspective"
  ];

  const generationPromises = Array.from({ length: count }).map(async (_, i) => {
    try {
        const currentIndex = (i + indexOffset) % perspectives.length;
        const sourceBlob = sources[i % sources.length];
        const imagePart = await fileToGenerativePart(sourceBlob);
        const perspective = perspectives[currentIndex];

        const promptText = `Professional product variation based on the reference image. 
        Product: ${auctionTitle}. 
        Shot type: ${perspective}. 
        Keep consistent with reference: product design, color, materials. 
        Style: Studio commercial photo, sharp focus, pure white background. 
        ${stylePrompt ? `Additional context: ${stylePrompt}` : ''}`;

        const response = await safeGenerateContent({
            model: 'gemini-2.5-flash-image',
            contents: { parts: [imagePart, { text: promptText }] },
            config: { imageConfig: { aspectRatio: "1:1" } }
        });
        const part = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
        if (part?.inlineData) {
            const res = await fetch(`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`);
            return { name: `gen_${i + indexOffset}.png`, blob: await res.blob() };
        }
        return null;
    } catch (e) { 
        console.error("Single gen failed", e);
        return null; 
    }
  });

  const results = await Promise.all(generationPromises);
  return results.filter((r): r is { name: string; blob: Blob } => r !== null);
};

export const generateAllegroDescription = async (i: any, m: any, a: any, p: any, r: any) => ({ auctionTitle: "Podgląd", descriptionParts: ["..."], sku: "SKU", ean: "", colors: [] });
export const generateStudioProImages = async (s: any, st: any, c: any) => generateAdditionalImages(s, "Product", c, st);
export const changeImageColor = async (i: any, s: any, t: any) => i;
export const analyzePricing = async (i: any, a: any) => ({ products: [] });
