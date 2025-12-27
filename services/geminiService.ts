
import { GoogleGenAI, Type } from "@google/genai";
import { BackgroundIntensity, PersonalityType } from "../App";

const callWithRetry = async <T>(fn: () => Promise<T>, retries = 3, baseDelay = 5000): Promise<T> => {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (error: any) {
            const isRateLimit = error?.status === 429 || error?.message?.includes('429') || error?.message?.includes('quota') || error?.message?.includes('RESOURCE_EXHAUSTED');
            if (isRateLimit && i < retries - 1) {
                const waitTime = baseDelay * Math.pow(2, i);
                await new Promise(resolve => setTimeout(resolve, waitTime));
                continue;
            }
            throw error;
        }
    }
    throw new Error("Maksymalna liczba prób przekroczona.");
};

const parseJsonResponse = (responseText: string) => {
  const jsonStartIndex = responseText.indexOf('{');
  if (jsonStartIndex === -1) throw new Error("Błąd formatu danych AI.");
  const jsonEndIndex = responseText.lastIndexOf('}');
  const jsonText = responseText.substring(jsonStartIndex, jsonEndIndex + 1);
  try { return JSON.parse(jsonText); } catch (e) { throw new Error("Błąd struktury JSON."); }
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

export const fetchImageFromUrl = async (url: string): Promise<Blob> => {
    if (!url) throw new Error("Brak URL");
    const PROXY_STRATEGIES = [
        (u: string) => `https://images.weserv.nl/?url=${encodeURIComponent(u)}&output=jpg&n=-1`,
        (u: string) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
    ];
    for (const strategy of PROXY_STRATEGIES) {
        try {
            const res = await fetch(strategy(url), { method: 'GET' });
            if (res.ok) {
                const blob = await res.blob();
                if (blob.size > 15000) return blob;
            }
        } catch (e) {}
    }
    throw new Error("Nie udało się pobrać zdjęcia.");
};

export const verifyImagesWithVision = async (imageBlobs: Blob[], productTitle: string): Promise<Blob[]> => {
    if (!process.env.API_KEY || imageBlobs.length === 0) return imageBlobs;
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const verifiedBlobs: Blob[] = [];

    for (const blob of imageBlobs) {
        try {
            const imagePart = await fileToGenerativePart(blob);
            const response = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: {
                    parts: [
                        imagePart,
                        { text: `Verify if this EXACT product is: "${productTitle}". 
                                 Check camera placement, branding, and shape. 
                                 If it is a generic object or different model, answer NO.
                                 Respond ONLY "YES" or "NO".` }
                    ]
                }
            });
            if (response.text?.toUpperCase().includes('YES')) verifiedBlobs.push(blob);
        } catch (e) {}
    }
    return verifiedBlobs;
};

// Generowanie opisów - NAPRAWIONA IMPLEMENTACJA
export const generateAllegroDescription = async (
    imageFiles: File[],
    modelFile: File | null,
    additionalInfo: string,
    personality: PersonalityType | string,
    referenceLinks: string = ''
): Promise<{
    auctionTitle: string;
    descriptionParts: string[];
    sku: string;
    ean: string;
    colors: string[];
}> => {
    if (!process.env.API_KEY) throw new Error("Brak klucza API.");
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    const parts: any[] = [];
    for (const file of imageFiles.slice(0, 3)) {
        parts.push(await fileToGenerativePart(file));
    }

    const prompt = `
        ZADANIE: Wygeneruj opis aukcji Allegro na podstawie zdjęć.
        JĘZYK: WYŁĄCZNIE POLSKI. Zakaz używania angielskiego.
        STYL: ${personality}.
        INFORMACJE: ${additionalInfo}.
        REFERENCJE: ${referenceLinks}.

        ZWRÓĆ RAW JSON:
        {
          "auctionTitle": "Chwytliwy tytuł (max 50 znaków)",
          "descriptionParts": ["Część 1: Cechy", "Część 2: Zalety", "Część 3: Zastosowanie", "Część 4: Dlaczego warto"],
          "sku": "unique-sku",
          "ean": "ean-code",
          "colors": ["lista kolorów"]
        }
    `;

    const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: { parts: [...parts, { text: prompt }] },
        config: { responseMimeType: "application/json" }
    });

    return parseJsonResponse(response.text);
};

export const addWhiteBackground = async (imageFile: Blob, context: string = "Product"): Promise<Blob> => {
  if (!process.env.API_KEY) throw new Error("Brak klucza API.");
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const imagePart = await fileToGenerativePart(imageFile);
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: { parts: [imagePart, { text: `Clean white e-commerce background for ${context}. Soft shadow.` }] },
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
  offset: number = 0,
  intensity: BackgroundIntensity = 'normal'
): Promise<{ name: string; blob: Blob }[]> => {
  if (!process.env.API_KEY) throw new Error("Brak klucza API.");
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const results: { name: string; blob: Blob }[] = [];
  const sources = Array.isArray(sourceImages) ? sourceImages : [sourceImages];

  for (let i = 0; i < count; i++) {
    const sourceBlob = sources[i % sources.length];
    const imagePart = await fileToGenerativePart(sourceBlob);
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [imagePart, { text: `Professional e-commerce angle for ${auctionTitle}. Style: ${stylePrompt}. Background: ${intensity}.` }]
        },
        config: { imageConfig: { aspectRatio: "1:1" } }
    });
    const part = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
    if (part?.inlineData) {
      const res = await fetch(`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`);
      results.push({ name: `gen_${offset + i}.png`, blob: await res.blob() });
    }
  }
  return results;
};

export const generateContentFromEan = async (ean: string, manualTitle?: string, ignoreEan: boolean = false): Promise<any> => {
  if (!process.env.API_KEY) throw new Error("Brak klucza API.");
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `
    IDENTYFIKACJA PRODUKTU: EAN ${ean}. ${manualTitle ? `Sugerowana nazwa: ${manualTitle}` : ''}
    JĘZYK: Kategoryczny zakaz używania angielskiego w opisie. Wszystko w języku polskim.
    ZWRÓĆ JSON: auction_title, description_parts (4 akapity po polsku), sku, colors, image_urls, dimensions_mm, weight_kg.
  `;
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: prompt,
    config: { tools: [{ googleSearch: {} }], temperature: 0 }
  });
  return parseJsonResponse(response.text);
};

export const generateStudioProImages = async (s: any, st: any, c: any) => generateAdditionalImages(s, "Studio Product", c, st);
export const changeImageColor = async (i: any, s: any, t: any) => i;
export const analyzePricing = async (i: any, a: any) => ({ products: [] });
