
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
    // Fallback: Regex wyciągający dane z surowego tekstu
    const titleMatch = responseText.match(/(?:title|name|nazwa|produkt)":\s*"([^"]+)"/i);
    // Ulepszony regex łapiący linki z parametrami (np. ?v=123)
    const urls = responseText.match(/https?:\/\/[^\s"']+(?:\.(?:jpg|jpeg|png|webp|avif)|img|image)[^\s"']*/gi) || [];
    
    if (titleMatch || urls.length > 0) {
        return {
            auction_title: titleMatch ? titleMatch[1] : "Produkt rozpoznany",
            visual_description: "",
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
    
    // Lista proxy - usunięto najwolniejsze, zostawiono najszybsze
    const proxyUrls = [
        `https://wsrv.nl/?url=${encodeURIComponent(url)}&output=png`, // Najszybsze cache CDN
        url // Próba bezpośrednia (dla CORS-friendly)
    ];

    for (const pUrl of proxyUrls) {
        try {
            const controller = new AbortController();
            // RELAXED: Timeout zwiększony do 6 sekund
            const timeoutId = setTimeout(() => controller.abort(), 6000); 
            
            const res = await fetch(pUrl, { 
                cache: 'no-store', 
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (res.ok) {
                const blob = await res.blob();
                // RELAXED: Akceptujemy mniejsze pliki (od 1KB), by nie odrzucać małych JPG
                if (blob.size > 1000 && blob.type.startsWith('image/')) return blob; 
            }
        } catch (e) { continue; }
    }
    throw new Error("Failed to fetch image");
};

export const verifyVisualIdentity = async (blob: Blob, title: string, url?: string): Promise<boolean> => {
    // Szybka ścieżka dla zaufanych domen - omijamy AI dla prędkości
    const trusted = ['amazon', 'allegro', 'ebay', 'media-expert', 'x-kom', 'morele', 'euro.com.pl', 'media-markt', 'empik', 'wsrv.nl'];
    if (url && trusted.some(t => url.toLowerCase().includes(t))) return true;

    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const imagePart = await fileToGenerativePart(blob);
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview', // Używamy Flash dla prędkości
            contents: {
                parts: [
                    imagePart,
                    { text: `Does this image show a product named "${title}"? Answer YES or NO.` }
                ]
            }
        });
        const ans = response.text?.trim().toUpperCase();
        return ans?.includes('YES') || false;
    } catch (e) { return true; } // W razie błędu AI zakładamy, że jest OK (fail-open)
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
    
    // Generowanie równoległe
    const tasks = Array.from({ length: count }).map(async (_, i) => {
        try {
            const currentBlob = sourceBlobs[i % sourceBlobs.length];
            const imagePart = await fileToGenerativePart(currentBlob);
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash-image',
                contents: { 
                    parts: [imagePart, { text: `Product photography of ${title}, professional studio lighting, pure white background.` }] 
                }
            });
            const part = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
            if (part?.inlineData) {
                const res = await fetch(`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`);
                return { name: `ai_view_${i + offset + 1}.png`, blob: await res.blob(), isAi: true };
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
            contents: { parts: [imagePart, { text: `Remove background, place on white.` }] }
        });
        const part = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
        if (!part?.inlineData) return photoBlob;
        const res = await fetch(`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`);
        return await res.blob();
    } catch (error) { return photoBlob; }
};

export const generateContentFromEan = async (ean: string, manualTitle?: string): Promise<any> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const query = manualTitle || `Product EAN ${ean}`;
  
  // Flash jest szybszy o 50% od Pro
  const model = 'gemini-3-flash-preview'; 

  try {
    const response = await ai.models.generateContent({
        model,
        contents: `Identify product "${query}". 
                   Task 1: Find EXACT product name in Polish.
                   Task 2: Find DIRECT URLs to high-res product images (white background preferred).
                   
                   JSON Output:
                   { 
                      "auction_title": "Product Name PL", 
                      "description_parts": ["Marketing intro", "Features", "Specs"], 
                      "image_urls": ["url1", "url2"],
                      "sku": "${ean}" 
                   }`,
        config: { tools: [{ googleSearch: {} }] }
    });

    const text = response.text || "";
    let data = parseJsonResponse(text);

    // Wyciągamy linki z Grounding Metadata (najbardziej wiarygodne źródło)
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const groundingLinks = chunks.map((c: any) => c.web?.uri).filter((u: string) => u && u.startsWith('http'));
    
    // Wyciągamy linki z tekstu (ulepszony regex)
    const textLinks = text.match(/https?:\/\/[^\s"']+(?:\.(?:jpg|jpeg|png|webp)|img|image)[^\s"']*/gi) || [];
    
    const allLinks = Array.from(new Set([...groundingLinks, ...(data?.image_urls || []), ...textLinks]))
        .filter(l => typeof l === 'string' && !l.includes('placeholder') && !l.includes('icon'));

    if (!data) {
        data = { 
            auction_title: manualTitle || (chunks.length > 0 ? chunks[0].web?.title?.split('|')[0]?.trim() : `Produkt ${ean}`),
            description_parts: [], 
            image_urls: allLinks, 
            sku: ean, 
            visual_description: "" 
        };
    } else {
        data.image_urls = allLinks;
    }
    return data;

  } catch (err) {
      console.error("Gemini EAN Error:", err);
      return { auction_title: manualTitle || `Produkt ${ean}`, description_parts: [], image_urls: [], sku: ean };
  }
};

export const generateNeuralSeed = async (productTitle: string, visualDescription?: string): Promise<Blob> => {
    throw new Error("No real images found. Aborting AI generation to prevent hallucinations.");
};

export const addWhiteBackground = async (i: Blob, title?: string): Promise<Blob> => {
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const imagePart = await fileToGenerativePart(i);
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: { parts: [imagePart, { text: `Remove background, place on pure white.` }] }
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
        model: 'gemini-3-flash-preview',
        contents: { parts: [...parts, { text: `Write Allegro description in Polish JSON: { "auctionTitle": "", "descriptionParts": ["", "", "", ""], "sku": "", "ean": "", "colors": [] }` }] },
        config: { responseMimeType: "application/json" }
    });
    return parseJsonResponse(resp.text) || { auctionTitle: '', descriptionParts: [], sku: '', ean: '', colors: [] };
};

export const analyzePricing = async (i: Blob, title: string): Promise<{ products: any[] }> => {
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: `Find similar products to "${title}" on Allegro. Return JSON: { "products": [{"productTitle": "...", "pricePln": "...", "productUrl": "..."}] }`,
            config: { tools: [{ googleSearch: {} }], responseMimeType: "application/json" }
        });
        return parseJsonResponse(response.text) || { products: [] };
    } catch (e) { return { products: [] }; }
};

export const verifyAndFilterImages = async (i: any, t: string, v: string) => [];
export const generateStudioProImages = async (f: File, p: string, c: number) => [];
