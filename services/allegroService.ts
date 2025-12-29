
import { ModelDimensions } from "../App";

interface AllegroCredentials {
    token: string;
    isSandbox?: boolean;
}

interface AllegroProductData {
    title: string;
    descriptionParts: string[];
    images: { name: string; blob: Blob }[];
    price: number;
    stock: number;
    categoryId: string;
    shippingRateId: string;
    ean?: string;
    sku?: string;
    parameters?: any[]; 
}

const PROXIES = [
    (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    (url: string) => `https://thingproxy.freeboard.io/fetch/${url}`,
];

const getUrls = (isSandbox: boolean) => ({
    api: isSandbox ? 'https://api.allegro.pl.allegrosandbox.pl' : 'https://api.allegro.pl',
    auth: isSandbox ? 'https://allegro.pl.allegrosandbox.pl/auth/oauth' : 'https://allegro.pl/auth/oauth'
});

const robustFetch = async (targetUrl: string, options: RequestInit = {}): Promise<Response> => {
    let lastError: any;
    for (const proxyGenerator of PROXIES) {
        const proxyUrl = proxyGenerator(targetUrl);
        try {
            const response = await fetch(proxyUrl, { ...options });
            if ([502, 503, 504].includes(response.status)) continue;
            return response;
        } catch (err) {
            lastError = err;
        }
    }
    throw lastError || new Error("Proxy niedostępne.");
};

const getBasicAuthHeader = (clientId: string, clientSecret: string) => {
    return 'Basic ' + btoa(`${clientId}:${clientSecret}`);
};

export const initiateDeviceAuth = async (clientId: string, clientSecret: string, isSandbox: boolean) => {
    const { auth } = getUrls(isSandbox);
    const targetUrl = `${auth}/device`;
    const headers = { 'Authorization': getBasicAuthHeader(clientId.trim(), clientSecret.trim()), 'Content-Type': 'application/x-www-form-urlencoded' };
    const body = new URLSearchParams();
    body.append('client_id', clientId.trim());
    const response = await robustFetch(targetUrl, { method: 'POST', headers, body: body.toString() });
    if (!response.ok) throw new Error(`Błąd autoryzacji (${response.status})`);
    return response.json();
};

export const getDeviceToken = async (clientId: string, clientSecret: string, deviceCode: string, isSandbox: boolean) => {
    const { auth } = getUrls(isSandbox);
    const targetUrl = `${auth}/token`;
    const headers = { 'Authorization': getBasicAuthHeader(clientId.trim(), clientSecret.trim()), 'Content-Type': 'application/x-www-form-urlencoded' };
    const body = new URLSearchParams();
    body.append('grant_type', 'urn:ietf:params:oauth:grant-type:device_code');
    body.append('device_code', deviceCode);
    const response = await robustFetch(targetUrl, { method: 'POST', headers, body: body.toString() });
    if (response.status === 400) {
        const err = await response.json();
        if (err.error === 'authorization_pending') return { status: 'pending' };
    }
    if (!response.ok) throw new Error("Błąd pobierania tokena.");
    const data = await response.json();
    return { status: 'success', access_token: data.access_token };
};

const allegroFetch = async (endpoint: string, token: string, isSandbox: boolean, options: RequestInit = {}) => {
    const { api } = getUrls(isSandbox);
    const url = `${api}${endpoint}`;
    const headers = { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.allegro.public.v1+json', 'Content-Type': 'application/vnd.allegro.public.v1+json', 'Accept-Language': 'pl-PL', ...options.headers };
    const response = await robustFetch(url, { ...options, headers });
    if (!response.ok) throw new Error(`Błąd Allegro API (${response.status})`);
    return response.json();
};

export const searchAllegroCategories = async (token: string, query: string, isSandbox: boolean = false) => {
    if (!query || query.length < 3) return [];
    const endpoint = `/sale/matching-categories?name=${encodeURIComponent(query)}`;
    const data = await allegroFetch(endpoint, token, isSandbox, { method: 'GET' });
    return data.matching_categories || [];
};

export const getShippingRates = async (token: string, isSandbox: boolean = false) => {
    const endpoint = '/sale/shipping-rates';
    const data = await allegroFetch(endpoint, token, isSandbox, { method: 'GET' });
    return data.shippingRates || [];
};

export const searchProductByEan = async (token: string, ean: string, isSandbox: boolean = false) => {
    const endpoint = `/sale/products?gtin=${ean}`;
    try {
        const data = await allegroFetch(endpoint, token, isSandbox, { method: 'GET' });
        if (!data.products || data.products.length === 0) return null;

        const product = data.products[0];
        const imageUrls = product.images ? product.images.map((img: any) => img.url) : [];
        
        return {
            id: product.id,
            name: product.name,
            category: product.category,
            images: imageUrls,
            description: product.description || null
        };
    } catch (e) {
        return null;
    }
};

const uploadImageToAllegro = async (token: string, blob: Blob, isSandbox: boolean) => {
    const { api } = getUrls(isSandbox);
    const url = `${api}/sale/images`;
    const response = await robustFetch(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.allegro.public.v1+json', 'Content-Type': blob.type },
        body: blob
    });
    if (!response.ok) throw new Error("Błąd uploadu.");
    const data = await response.json();
    return data.location;
};

export const publishOffer = async (token: string, offerId: string, isSandbox: boolean) => {
    const commandId = crypto.randomUUID();
    const endpoint = `/sale/offer-publication-commands/${commandId}`;
    const payload = { publication: { action: "ACTIVATE" }, offerCriteria: [ { offers: [ { id: offerId } ], type: "CONTAINS_OFFERS" } ] };
    return await allegroFetch(endpoint, token, isSandbox, { method: 'PUT', body: JSON.stringify(payload) });
};

export const createAllegroDraft = async (credentials: AllegroCredentials, data: AllegroProductData) => {
    const { token, isSandbox = false } = credentials;
    const uploadedImageUrls: string[] = [];
    for (const img of data.images) {
        try {
            const location = await uploadImageToAllegro(token, img.blob, isSandbox);
            uploadedImageUrls.push(location);
        } catch (e) { console.error(e); }
    }
    if (uploadedImageUrls.length === 0) throw new Error("Wymagane min. 1 zdjęcie.");

    const sections = [ { items: [{ type: "TEXT", content: `<h1>${data.title}</h1>` }] } ];
    data.descriptionParts.forEach((part, i) => {
        const sectionItems: any[] = [{ type: "TEXT", content: `<p>${part}</p>` }];
        if (uploadedImageUrls[i+1]) sectionItems.push({ type: "IMAGE", url: uploadedImageUrls[i+1] });
        sections.push({ items: sectionItems });
    });

    const payload = {
        name: data.title,
        category: { id: data.categoryId },
        description: { sections: sections },
        images: uploadedImageUrls.map(url => ({ url })),
        sellingMode: { format: "BUY_NOW", price: { amount: data.price.toFixed(2), currency: "PLN" } },
        stock: { available: data.stock, unit: "UNIT" },
        publication: { status: "INACTIVE" }, 
        delivery: { shippingRates: { id: data.shippingRateId }, handlingTime: "PT24H" }
    };

    return await allegroFetch('/sale/offers', token, isSandbox, { method: 'POST', body: JSON.stringify(payload) });
};
