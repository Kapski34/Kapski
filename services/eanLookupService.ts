
// services/eanLookupService.ts

export type EanLookupResult = {
  ean: string;
  title?: string;
  brand?: string;
  images?: string[];
  source: "OFF" | "WIKIDATA";
};

type CacheEntry<T> = { v: T; exp: number };
const CACHE_PREFIX = "ean_lookup_v1:";
const DEFAULT_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

// 1. Validation
export function isValidEan13(input: string) {
  const ean = (input || "").replace(/[^\d]/g, "");
  if (!/^\d{13}$/.test(ean)) return false;

  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const d = ean.charCodeAt(i) - 48;
    sum += (i % 2 === 0) ? d : d * 3;
  }
  const check = (10 - (sum % 10)) % 10;
  return check === (ean.charCodeAt(12) - 48);
}

// 2. Cache Logic
export function cacheGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const data: CacheEntry<T> = JSON.parse(raw);
    if (Date.now() > data.exp) {
      localStorage.removeItem(CACHE_PREFIX + key);
      return null;
    }
    return data.v;
  } catch { return null; }
}

export function cacheSet<T>(key: string, value: T, ttlMs = DEFAULT_TTL_MS) {
  try {
    const data: CacheEntry<T> = { v: value, exp: Date.now() + ttlMs };
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(data));
  } catch {}
}

// 3. OpenFoodFacts Lookup
export async function fetchFromOFF(ean: string, signal?: AbortSignal): Promise<EanLookupResult | null> {
  const url = `https://world.openfoodfacts.org/api/v2/product/${ean}.json`;
  try {
      const res = await fetch(url, { signal });
      if (!res.ok) return null;
      const data = await res.json();
      if (!data?.product) return null;

      const p = data.product;
      const images = [
        p.image_url,
        p.image_front_url,
        p.image_ingredients_url,
        p.image_nutrition_url,
      ].filter((x: any) => typeof x === "string" && x.startsWith("http"));

      const title = p.product_name || p.product_name_pl || p.generic_name;
      const brand = p.brands;

      if (!title && !brand && images.length === 0) return null;

      return { ean, title, brand, images: Array.from(new Set(images)), source: "OFF" };
  } catch (e) {
      return null;
  }
}

// 4. Wikidata Lookup
export async function fetchFromWikidata(ean: string, signal?: AbortSignal): Promise<EanLookupResult | null> {
  const sparql = `
    SELECT ?item ?itemLabel ?brandLabel ?image WHERE {
      { ?item wdt:P3962 "${ean}" . }
      UNION
      { ?item wdt:P5283 "${ean}" . }
      OPTIONAL { ?item wdt:P1716 ?brand . }
      OPTIONAL { ?item wdt:P154 ?image . }
      OPTIONAL { ?item wdt:P18  ?image . }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "pl,en". }
    }
    LIMIT 10
  `.trim();

  const url = "https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(sparql);

  try {
      const res = await fetch(url, {
        signal,
        headers: { Accept: "application/sparql-results+json" },
      });
      if (!res.ok) return null;

      const json = await res.json();
      const bindings = json?.results?.bindings || [];
      if (bindings.length === 0) return null;

      const first = bindings[0];
      const title = first?.itemLabel?.value as string | undefined;
      const brand = first?.brandLabel?.value as string | undefined;

      const images = bindings
        .map((b: any) => b?.image?.value)
        .filter((x: any) => typeof x === "string" && x.startsWith("http"));

      return {
        ean,
        title,
        brand,
        images: Array.from(new Set(images)),
        source: "WIKIDATA",
      };
  } catch (e) {
      return null;
  }
}

// 5. Wikimedia Commons Search (Fallback by Title)
export async function searchWikimediaImages(query: string): Promise<string[]> {
    // Basic cleaning of query to remove "EAN" or special chars that might break search
    const cleanQuery = query.replace(/EAN\s*\d+/i, '').trim();
    if (cleanQuery.length < 3) return [];

    const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=File:${encodeURIComponent(cleanQuery)}&gsrlimit=10&prop=imageinfo&iiprop=url&format=json&origin=*`;
    
    try {
        const res = await fetch(url);
        const data = await res.json();
        if (!data.query || !data.query.pages) return [];
        
        return Object.values(data.query.pages)
            .map((p: any) => p.imageinfo?.[0]?.url)
            .filter((u: string) => u && (u.toLowerCase().endsWith('.jpg') || u.toLowerCase().endsWith('.png') || u.toLowerCase().endsWith('.jpeg')));
    } catch (e) { 
        console.warn("Wikimedia search failed", e);
        return []; 
    }
}

// 6. Unified Lookup
export async function lookupEanFree(eanRaw: string) {
  const ean = (eanRaw || "").replace(/[^\d]/g, "");
  // Note: We skip strict validation throw here to allow trying 8-digit EANs or others, 
  // but strictly speaking OFF works best with EAN-13.
  if (ean.length === 13 && !isValidEan13(ean)) {
      throw new Error("Niepoprawny EAN-13 (błąd sumy kontrolnej).");
  }

  const cached = cacheGet<EanLookupResult>("ean:" + ean);
  if (cached) return cached;

  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 4000); // 4s timeout

  try {
    // Try OpenFoodFacts first (fastest for FMCG)
    const off = await fetchFromOFF(ean, ctrl.signal);
    if (off) { 
        cacheSet("ean:" + ean, off); 
        return off; 
    }

    // Try Wikidata second
    const wd = await fetchFromWikidata(ean, ctrl.signal);
    if (wd) { 
        cacheSet("ean:" + ean, wd); 
        return wd; 
    }

    throw new Error("Brak w darmowych bazach.");
  } finally {
    clearTimeout(timeout);
  }
}
