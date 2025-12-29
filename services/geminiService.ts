
import { GoogleGenAI, Type, GenerateContentParameters } from "@google/genai";
import { BackgroundIntensity, PersonalityType } from "../App";

const parseJsonResponse = (responseText: string) => {
  try {
    const jsonStartIndex = responseText.indexOf('{');
    if (jsonStartIndex === -1) return null;
    const jsonEndIndex = responseText.lastIndexOf('}');
    const jsonStr = responseText.substring(jsonStartIndex, jsonEndIndex + 1);
    return JSON.parse(jsonStr);
  } catch (e) {
    // Fallback v71: Ekstrakcja danych z uszkodzonego tekstu (regex)
    const titleMatch = responseText.match(/(?:title|name|nazwa)":\s*"([^"]+)"/i);
    const urls = responseText.match(/https?:\/\/[^"'\s<>]+?\.(?:jpg|jpeg|png|webp|avif)/gi) || [];
    if (titleMatch || urls.length > 0) {
        return {
            auction_title: titleMatch ? titleMatch[1] : "Produkt",
            visual_description: "Automatyczna analiza Titan v71",
            description_parts: [],
            image_urls: Array.from(new Set(urls)),
            sku: ""
        };
    }
    return null;
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

export const fetchImageFromUrl = async (url: string): Promise<Blob> => {
    if (!url || !url.startsWith('http')) throw new Error("Invalid URL");
    const proxyUrls = [
        `https://wsrv.nl/?url=${encodeURIComponent(url)}&n=-1&output=png`,
        `https://images.weserv.nl/?url=${encodeURIComponent(url)}&n=-1`,
        `https://corsproxy.io/?${encodeURIComponent(url)}`,
        `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
        url 
    ];

    for (const pUrl of proxyUrls) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 12000);
            const res = await fetch(pUrl, { 
                cache: 'no-store', 
                signal: controller.signal,
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36' }
            });
            clearTimeout(timeoutId);
            if (res.ok) {
                const blob = await res.blob();
                if (blob.size > 1000 && blob.type.startsWith('image/')) return blob; 
            }
        } catch (e) { continue; }
    }
    throw new Error("UNREACHABLE");
};

export const verifyVisualIdentity = async (blob: Blob, title: string, url?: string): Promise<boolean> => {
    // v71: Uproszczona heurystyka dla zaufanych domen + fallback logic
    const trusted = ['amazon', 'allegro', 'ebay', 'skullcandy', 'apple', 'samsung', 'xiaomi', 'media-amazon', 'gstatic'];
    if (url && trusted.some(t => url.toLowerCase().includes(t))) return true;

    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const imagePart = await fileToGenerativePart(blob);
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: {
                parts: [
                    imagePart,
                    { text: `Is this a photo of the product: "${title}"? Answer ONLY "YES" or "NO". Discard if it's lighting equipment and the product is NOT lighting equipment.` }
                ]
            }
        });
        return response.text?.trim().toUpperCase().includes('YES') || false;
    } catch (e) { return true; } 
};

export const generateAdditionalImages = async (
    sourceBlob: Blob | Blob[], 
    title: string, 
    count: number, 
    style: string = "", 
    offset: number = 0,
    backgroundIntensity: BackgroundIntensity = 'normal'
): Promise<{ name: string; blob: Blob; isAi: boolean }[]> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const sourceBlobs = Array.isArray(sourceBlob) ? sourceBlob : [sourceBlob];
    
    const tasks = Array.from({ length: count }).map(async (_, i) => {
        try {
            const currentBlob = sourceBlobs[i % sourceBlobs.length];
            const imagePart = await fileToGenerativePart(currentBlob);
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash-image',
                contents: { 
                    parts: [imagePart, { text: `Professional studio catalog photo of ${title}. Commercial quality, white background.` }] 
                }
            });
            const part = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
            if (part?.inlineData) {
                const res = await fetch(`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`);
                return { name: `v71_ai_${i + offset + 1}.png`, blob: await res.blob(), isAi: true };
            }
            return null;
        } catch (e) { return null; }
    });

    const results = await Promise.all(tasks);
    return results.filter((r): r is { name: string; blob: Blob; isAi: boolean } => r !== null);
};

export const processRealPhoto = async (photoBlob: Blob, title: string): Promise<Blob> => {
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const imagePart = await fileToGenerativePart(photoBlob);
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: { parts: [imagePart, { text: `Place product ${title} on pure white background #FFFFFF.` }] }
        });
        const part = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
        if (!part?.inlineData) return photoBlob;
        const res = await fetch(`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`);
        return await res.blob();
    } catch (error) { return photoBlob; }
};

export const generateContentFromEan = async (ean: string, manualTitle?: string): Promise<any> => {
  const fallback = { 
      auction_title: manualTitle || `Produkt ${ean}`, 
      description_parts: [], 
      image_urls: [], 
      sku: ean, 
      visual_description: "" 
  };
  
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const query = manualTitle || `EAN ${ean} product identity`;
    
    const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview', // Pro jest bardziej stabilny przy tool-callingu
        contents: `TITAN-ENGINE v71: Identify product for ${query}. 
                   Return JSON ONLY: { "auction_title": "Full product name", "visual_description": "color/type", "description_parts": ["p1", "p2", "p3", "p4"], "image_urls": [], "sku": "${ean}" }`,
        config: { tools: [{ googleSearch: {} }] }
    });

    const text = response.text || "";
    let data = parseJsonResponse(text) || fallback;

    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const groundingLinks = chunks.map((c: any) => c.web?.uri).filter((u: string) => u && u.startsWith('http'));
    const textLinks = text.match(/https?:\/\/[^"'\s<>]+?\.(?:jpg|jpeg|png|webp|avif)/gi) || [];
    
    data.image_urls = Array.from(new Set([...groundingLinks, ...(data.image_urls || []), ...textLinks]))
        .filter(l => typeof l === 'string' && (l.includes('amazon') || l.includes('allegro') || l.includes('ebay') || l.includes('gstatic') || l.includes('xiaomi')));
    
    if ((!data.auction_title || data.auction_title === ean) && chunks.length > 0) {
        data.auction_title = chunks[0].web?.title?.split('|')[0]?.split('-')[0]?.trim() || data.auction_title;
    }

    return data;
  } catch (err) {
      console.error("Titan-Engine Grounding Failure:", err);
      return fallback; // Nigdy nie rzucaj błędu, zawsze zwracaj dane (choćby szkielet)
  }
};

export const generateNeuralSeed = async (productTitle: string, visualDescription?: string): Promise<Blob> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: `Official catalog photography of ${productTitle}. Highly detailed, white background.`
    });
    const part = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
    if (!part?.inlineData) throw new Error("Seed Failure");
    const res = await fetch(`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`);
    return await res.blob();
};

export const addWhiteBackground = async (i: Blob, title?: string): Promise<Blob> => {
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const imagePart = await fileToGenerativePart(i);
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: { parts: [imagePart, { text: `Product on pure white background.` }] }
        });
        const part = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
        if (!part?.inlineData) return i;
        const res = await fetch(`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`);
        return await res.blob();
    } catch (e) { return i; }
};

export const changeImageColor = async (i: any, s: string, t: string) => i;
export const generateAllegroDescription = async (f: File[], m: any, info: string, p: any, r: any) => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const parts = await Promise.all(f.map(fileToGenerativePart));
    const resp = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: { parts: [...parts, { text: `JSON: { auctionTitle, descriptionParts: [4 PARAGRAPHS], sku, ean, colors }` }] },
        config: { responseMimeType: "application/json" }
    });
    return parseJsonResponse(resp.text) || { auctionTitle: '', descriptionParts: [], sku: '', ean: '', colors: [] };
};

export const analyzePricing = async (i: Blob, title: string): Promise<{ products: any[] }> => {
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: `Pricing for ${title}. JSON: { products: [{productTitle, pricePln, productUrl}] }`,
            config: { tools: [{ googleSearch: {} }], responseMimeType: "application/json" }
        });
        return parseJsonResponse(response.text) || { products: [] };
    } catch (e) { return { products: [] }; }
};

export const verifyAndFilterImages = async (i: any, t: string, v: string) => [];
export const generateStudioProImages = async (f: File, p: string, c: number) => [];
export const synthesizeFromBlueprint = async () => null;
export const synthesizeFromReference = async () => null;
export const synthesizeProductImage = async () => null;
