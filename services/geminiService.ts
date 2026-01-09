
import { GoogleGenAI, Type, GenerateContentParameters } from "@google/genai";
import { BackgroundIntensity, PersonalityType } from "../App";

// --- UTILITY: Retry Logic for 429 Errors ---
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function retryWithBackoff<T>(operation: () => Promise<T>, retries = 3, delay = 2000, factor = 2): Promise<T> {
    try {
        return await operation();
    } catch (error: any) {
        const isRateLimit = error?.status === 429 || error?.code === 429 || error?.message?.includes('429') || error?.message?.includes('RESOURCE_EXHAUSTED');
        
        if (retries > 0 && isRateLimit) {
            console.warn(`API Rate Limit hit. Retrying in ${delay}ms... (${retries} attempts left)`);
            await wait(delay);
            return retryWithBackoff(operation, retries - 1, delay * factor, factor);
        }
        throw error;
    }
}

// Helper to check if a URL is likely an image and NOT a web page
const isLikelyImage = (url: string) => {
    if (!url || typeof url !== 'string') return false;
    const u = url.toLowerCase();
    
    // Explicitly ban known product page patterns that are NOT images
    if (u.includes('allegro.pl/oferta')) return false;
    if (u.includes('ceneo.pl')) return false;
    if (u.includes('amazon.com/dp')) return false;
    if (u.includes('google.com/search')) return false;
    if (u.includes('html')) return false;

    // Accept known image extensions
    if (u.match(/\.(jpeg|jpg|png|webp|avif|gif|svg|bmp|tiff)($|\?)/)) return true;
    
    // Accept known image path keywords
    if (u.includes('allegroimg')) return true;
    if (u.includes('images-na.ssl-images-amazon')) return true;
    if (u.includes('media/')) return true;
    if (u.includes('/upload')) return true;
    if (u.includes('/photos')) return true;
    if (u.includes('/img')) return true;
    if (u.includes('/images')) return true;
    if (u.includes('cdn')) return true;
    if (u.includes('content')) return true; // CMS content
    
    // Allow Google Images thumbnails and content (reliable fallback)
    if (u.includes('encrypted-tbn')) return true;
    if (u.includes('gstatic.com')) return true;
    if (u.includes('googleusercontent.com')) return true;
    
    return false;
};

const parseJsonResponse = (responseText: string) => {
  try {
    const jsonStartIndex = responseText.indexOf('{');
    if (jsonStartIndex === -1) return null;
    const jsonEndIndex = responseText.lastIndexOf('}');
    const jsonStr = responseText.substring(jsonStartIndex, jsonEndIndex + 1);
    return JSON.parse(jsonStr);
  } catch (e) {
    const titleMatch = responseText.match(/(?:title|name|nazwa|produkt)":\s*"([^"]+)"/i);
    
    // Clean escaped slashes in the whole text before regex matching to catch https:\/\/ URLs
    const cleanText = responseText.replace(/\\/g, '');
    const urls: string[] = cleanText.match(/https?:\/\/[^\s"']+/gi) || [];
    
    // Filter strictly for things that look like images
    const validUrls = urls.filter(isLikelyImage);
    
    if (titleMatch || validUrls.length > 0) {
        return {
            auction_title: titleMatch ? titleMatch[1] : "Produkt rozpoznany",
            visual_description: "",
            description_parts: [],
            image_urls: Array.from(new Set(validUrls)),
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

// Robust Fetcher with Fallbacks
export async function fetchImageFromUrl(url: string, timeoutMs = 12000): Promise<Blob> {
  const fetchWithTimeout = async (targetUrl: string) => {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeoutMs);
      try {
          const res = await fetch(targetUrl, { signal: controller.signal });
          clearTimeout(id);
          if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
          const blob = await res.blob();
          
          // Filter out tiny error images or empty responses (1x1 pixels)
          if (blob.size < 50) throw new Error("File too small/corrupt");
          
          // Relaxed type check - some proxies don't send correct headers
          // We trust the blob if it has size.
          return blob;
      } catch (e) {
          clearTimeout(id);
          throw e;
      }
  };

  // STRATEGY 1: Google Focus Proxy (Extremely reliable for static assets)
  try {
      const target = `https://images1-focus-opensocial.googleusercontent.com/gadgets/proxy?container=focus&refresh=2592000&url=${encodeURIComponent(url)}`;
      return await fetchWithTimeout(target);
  } catch (e) {
      console.warn(`Google Focus proxy failed for ${url}, trying next...`);
  }

  // STRATEGY 2: Wsrv.nl (Best for images - acts as a CDN/Processor)
  try {
      // Pass full URL to wsrv.nl
      const target = `https://wsrv.nl/?url=${encodeURIComponent(url)}&output=jpg`;
      return await fetchWithTimeout(target);
  } catch (e) {
      console.warn(`Wsrv proxy failed for ${url}, trying next...`);
  }

  // STRATEGY 3: CorsProxy.io (Standard transparent proxy)
  try {
      const target = url.includes('corsproxy.io') ? url : `https://corsproxy.io/?${encodeURIComponent(url)}`;
      return await fetchWithTimeout(target);
  } catch (e) {
      console.warn(`Corsproxy failed for ${url}, trying next...`);
  }

  // STRATEGY 4: AllOrigins (Another backup transparent proxy)
  try {
      const target = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
      return await fetchWithTimeout(target);
  } catch (e) {
      console.warn(`AllOrigins proxy failed for ${url}, trying next...`);
  }

  throw new Error("Failed to fetch image from all available proxies.");
}

export const verifyVisualIdentity = async (blob: Blob, title: string, url?: string): Promise<boolean> => {
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const imagePart = await fileToGenerativePart(blob);
        
        // Use retry logic here
        const response = await retryWithBackoff(async () => {
            return await ai.models.generateContent({
                model: 'gemini-3-flash-preview', 
                contents: {
                    parts: [
                        imagePart,
                        { text: `Analyze this image against the product title: "${title}".
                                 
                                 RULES:
                                 1. ACCEPTS: The product itself, its packaging (box), the product inside packaging, or the product in a lifestyle setting.
                                 2. ACCEPTS: Close-ups, different angles, color variations, or if the product is visible but small.
                                 3. REJECTS: Completely unrelated objects (e.g. searching for 'headphones' but seeing a 'toaster', 'car', or 'dress').
                                 4. REJECTS: Clearly broken images, error placeholders, text-only logos, or tiny generic icons.
                                 
                                 Does this image likely represent the product "${title}" or its packaging?
                                 If you are unsure, Answer YES.
                                 Only answer NO if it is definitely a wrong object.` }
                    ]
                }
            });
        }, 2, 1000); // Fewer retries for verification to be fast

        const ans = response.text?.trim().toUpperCase();
        return ans?.includes('YES') || false;
    } catch (e) { 
        // FAIL OPEN: If API is totally dead/exhausted even after retries, 
        // we accept the image rather than showing "No images found".
        console.warn("Visual verification failed (API error), defaulting to ACCEPT.", e);
        return true; 
    } 
};

// Zestaw promptów wymuszających RÓŻNE ujęcia
const VIEW_ANGLES = [
    "side profile view, rotated 90 degrees",
    "back view of the product",
    "top-down view showing the layout",
    "close-up detail shot of the main feature"
];

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
            const anglePrompt = VIEW_ANGLES[(i + offset) % VIEW_ANGLES.length];
            
            const response = await retryWithBackoff(async () => {
                return await ai.models.generateContent({
                    model: 'gemini-2.5-flash-image',
                    contents: { 
                        parts: [imagePart, { text: `Product photography of ${title}. 
                        CRITICAL INSTRUCTION: Generate a NEW view of this product from a ${anglePrompt}.
                        Do not just copy the input image. Rotate the object 3D in space.
                        Professional studio lighting, pure white background.` }] 
                    }
                });
            }, 3, 3000);

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
        
        const response = await retryWithBackoff(async () => {
            return await ai.models.generateContent({
                model: 'gemini-2.5-flash-image',
                contents: { parts: [imagePart, { text: `Remove background, place on pure white hex #FFFFFF.` }] }
            });
        }, 3, 3000);

        const part = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
        if (!part?.inlineData) return photoBlob;
        const res = await fetch(`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`);
        return await res.blob();
    } catch (error) { return photoBlob; }
};

export const generateContentFromEan = async (ean: string, manualTitle?: string): Promise<any> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = 'gemini-3-flash-preview'; 

  // STEP 1: Identification (Strict)
  let identifiedTitle = manualTitle;
  
  if (!manualTitle && ean) {
      try {
          console.log(`Step 1: Identifying EAN ${ean}...`);
          // Retry wrapper for identification
          const idResponse = await retryWithBackoff(async () => {
              return await ai.models.generateContent({
                  model,
                  contents: `Search for EAN/GTIN code "${ean}".
                             What is the EXACT product name? 
                             Look for results from major retailers (Amazon, Allegro, MediaMarkt, Manufacturer sites).
                             
                             Return ONLY the product name as a plain string.
                             Example: "Sony WH-1000XM5 Headphones"
                             
                             If the EAN is ambiguous or you cannot find a specific product, return "UNKNOWN".
                             Do NOT guess.`,
                  config: { tools: [{ googleSearch: {} }] }
              });
          }, 3, 2000); // 3 retries, start with 2s delay
          
          const idText = idResponse.text?.trim() || "";
          if (idText && !idText.includes("UNKNOWN") && idText.length > 3) {
              identifiedTitle = idText.replace(/["']/g, "").split('\n')[0];
              console.log(`Identified: ${identifiedTitle}`);
          }
      } catch (e) {
          console.warn("Identification step failed (possibly rate limit), skipping to general search.", e);
      }
  }

  const querySubject = identifiedTitle || (ean ? `EAN ${ean}` : manualTitle);

  // STEP 2: Content & Image Search (using the identified title)
  try {
    const response = await retryWithBackoff(async () => {
        return await ai.models.generateContent({
            model,
            contents: `
                User Request: Find details and images for: ${querySubject}.
                ${ean ? `(Associated EAN: ${ean})` : ''}
                
                INSTRUCTIONS:
                1. Search for high-quality images of "${identifiedTitle || querySubject}".
                2. Extract DIRECT links to image files (jpg, png, webp).
                3. Generate a sales description in Polish.
                
                JSON Output:
                { 
                    "auction_title": "${identifiedTitle || "Produkt"}", 
                    "description_parts": ["Marketing intro", "Features list", "Tech specs"], 
                    "image_urls": ["url1", "url2", "url3", "url4"],
                    "sku": "${ean}" 
                }
                
                CRITICAL: 
                - Images MUST match the product "${identifiedTitle || querySubject}". 
                - Do not return web page URLs (like allegro.pl/oferta/...). Only direct image links.
            `,
            config: { tools: [{ googleSearch: {} }] }
        });
    }, 4, 3000); // Aggressive retry for the main search

    const text = response.text || "";
    let data = parseJsonResponse(text);

    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    
    // Extracted grounding URIs - ONLY if they look like images
    const groundingImageLinks = chunks
        .map((c: any) => c.web?.uri)
        .filter(isLikelyImage);
    
    // Aggressive text regex extraction - ONLY if they look like images
    const cleanText = text.replace(/\\/g, ''); // Ensure no escaped slashes
    const allTextLinks = (cleanText.match(/https?:\/\/[^\s"']+/gi) || [])
        .filter(isLikelyImage);
    
    // Combine everything
    const allLinks = Array.from(new Set([
        ...groundingImageLinks, 
        ...(data?.image_urls || []), 
        ...allTextLinks
    ])).filter(l => typeof l === 'string' && !l.includes('placeholder') && !l.includes('icon'));

    if (!data) {
        data = { 
            auction_title: identifiedTitle || manualTitle || (chunks.length > 0 ? chunks[0].web?.title?.split('|')[0]?.trim() : `Produkt ${ean}`),
            description_parts: [], 
            image_urls: allLinks, 
            sku: ean, 
            visual_description: "" 
        };
    } else {
        if ((!data.auction_title || data.auction_title.includes("Produkt")) && identifiedTitle) {
            data.auction_title = identifiedTitle;
        }
        data.image_urls = allLinks;
    }
    return data;

  } catch (err) {
      console.error("Gemini EAN Error:", err);
      // Even if it fails completely, return the structure so the UI doesn't crash, just shows no images
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
        const response = await retryWithBackoff(async () => {
            return await ai.models.generateContent({
                model: 'gemini-2.5-flash-image',
                contents: { parts: [imagePart, { text: `Remove background, place on pure white.` }] }
            });
        }, 3, 2000);
        
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
    const resp = await retryWithBackoff(async () => {
        return await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: { parts: [...parts, { text: `Write Allegro description in Polish JSON: { "auctionTitle": "", "descriptionParts": ["", "", "", ""], "sku": "", "ean": "", "colors": [] }` }] },
            config: { responseMimeType: "application/json" }
        });
    }, 3, 2000);
    return parseJsonResponse(resp.text) || { auctionTitle: '', descriptionParts: [], sku: '', ean: '', colors: [] };
};

export const analyzePricing = async (i: Blob, title: string): Promise<{ products: any[] }> => {
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const response = await retryWithBackoff(async () => {
            return await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: `Find similar products to "${title}" on Allegro. Return JSON: { "products": [{"productTitle": "...", "pricePln": "...", "productUrl": "..."}] }`,
                config: { tools: [{ googleSearch: {} }], responseMimeType: "application/json" }
            });
        }, 3, 2000);
        return parseJsonResponse(response.text) || { products: [] };
    } catch (e) { return { products: [] }; }
};

export const verifyAndFilterImages = async (i: any, t: string, v: string) => [];
export const generateStudioProImages = async (f: File, p: string, c: number) => {
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const imagePart = await fileToGenerativePart(f);
        
        const tasks = Array.from({ length: c }).map(async (_, i) => {
            const response = await retryWithBackoff(async () => {
                return await ai.models.generateContent({
                    model: 'gemini-2.5-flash-image',
                    contents: { parts: [imagePart, { text: `Professional product photography. ${p}` }] }
                });
            }, 3, 3000);
            
            const part = response.candidates?.[0]?.content?.parts?.find(part => part.inlineData);
            if (part?.inlineData) {
                const res = await fetch(`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`);
                return { name: `studio_${i+1}.png`, blob: await res.blob() };
            }
            return null;
        });
        
        const results = await Promise.all(tasks);
        return results.filter((r): r is { name: string; blob: Blob } => r !== null);
    } catch (e) { return []; }
};
