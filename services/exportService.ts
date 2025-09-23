// services/exportService.ts
import { ModelDimensions } from "../App";

interface ProductData {
    title: string;
    description: string; // This will now be the full HTML description for WC
    descriptionParts: string[]; // This will be used for BaseLinker mapping
    images: { name: string; blob: Blob }[];
    sku?: string;
    ean?: string;
    condition?: 'new' | 'used' | 'refurbished';
    dimensions?: ModelDimensions | null;
    weight?: number | null; // Add weight
}

interface WooCommerceCredentials {
    storeUrl: string;
    consumerKey: string;
    consumerSecret: string;
}

export interface BaseLinkerCredentials {
    apiToken: string;
    inventoryId: number;
    storageId: string;
    priceGroupId: number;
    categoryId?: number;
    manufacturerId?: number;
    quantity: number;
    price: number;
}

// Fix: Define and export the Warehouse type for type safety.
export interface Warehouse {
    storage_id: string;
    name: string;
}

// Fix: Define and export the PriceGroup type for type safety.
export interface PriceGroup {
    price_group_id: number;
    name: string;
    currency: string;
}

export interface Category {
    category_id: number;
    name: string;
}

export interface Manufacturer {
    manufacturer_id: number;
    name: string;
}


// --- WOOCOMMERCE IMAGE UPLOAD HELPER ---
const uploadImagesToWooCommerce = async (credentials: WooCommerceCredentials, images: { name: string; blob: Blob }[]) => {
    const { storeUrl, consumerKey, consumerSecret } = credentials;
    const sanitizedUrl = storeUrl.endsWith('/') ? storeUrl.slice(0, -1) : storeUrl;
    const mediaApiUrl = `${sanitizedUrl}/wp-json/wp/v2/media`;

    const authString = btoa(`${consumerKey}:${consumerSecret}`);
    const headers = {
        'Authorization': `Basic ${authString}`,
    };
    
    const imageUploadPromises = images.map(async (image) => {
        const response = await fetch(mediaApiUrl, {
            method: 'POST',
            headers: {
                ...headers,
                'Content-Type': image.blob.type,
                'Content-Disposition': `attachment; filename="${image.name}"`,
            },
            body: image.blob,
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Błąd podczas wgrywania zdjęcia ${image.name} do WooCommerce: ${errorData.message}`);
        }
        const data = await response.json();
        return { id: data.id };
    });

    return Promise.all(imageUploadPromises);
};


// --- WOOCOMMERCE EXPORT ---
export const exportToWooCommerce = async (credentials: WooCommerceCredentials, productData: ProductData) => {
    const { storeUrl, consumerKey, consumerSecret } = credentials;
    const sanitizedUrl = storeUrl.endsWith('/') ? storeUrl.slice(0, -1) : storeUrl;
    const apiUrl = `${sanitizedUrl}/wp-json/wc/v3`;
    
    try {
        const uploadedImages = await uploadImagesToWooCommerce(credentials, productData.images);

        const productPayload = {
            name: productData.title,
            type: 'simple',
            status: 'draft',
            description: productData.description,
            images: uploadedImages,
        };

        const productResponse = await fetch(`${apiUrl}/products`, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${btoa(`${consumerKey}:${consumerSecret}`)}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(productPayload),
        });

        if (!productResponse.ok) {
            const errorData = await productResponse.json();
            throw new Error(`Błąd podczas tworzenia produktu: ${errorData.message}`);
        }

        return await productResponse.json();
    } catch (error) {
        console.error("Błąd eksportu do WooCommerce:", error);
        if (error instanceof TypeError) { // Network error or CORS
            throw new Error("Błąd sieci lub problem z CORS. Upewnij się, że URL sklepu jest poprawny i serwer zezwala na zapytania z tej domeny.");
        }
        throw error; // Re-throw other errors
    }
};

/**
 * Converts an image blob to a Base64 string prefixed with "data:", as required by the BaseLinker API.
 * The function first standardizes the image to JPEG format for better compatibility and size reduction,
 * resizes it if it exceeds the maximum dimensions, and then strips the MIME type part
 * (e.g., "image/jpeg;base64,") from the data URL, leaving only the required prefix and the raw Base64 data.
 * The responsibility for adding a white background to the main image lies with the AI editing step,
 * not this function.
 * @param blob The input image blob.
 * @returns A promise that resolves with the correctly formatted Base64 string for BaseLinker.
 */
const convertBlobToBase64ForBaseLinker = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        const MAX_DIMENSION = 1920;
        const img = new Image();
        const objectUrl = URL.createObjectURL(blob);

        img.onload = () => {
            URL.revokeObjectURL(objectUrl);

            let { width, height } = img;

            if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
                if (width > height) {
                    height = Math.round((height * MAX_DIMENSION) / width);
                    width = MAX_DIMENSION;
                } else {
                    width = Math.round((width * MAX_DIMENSION) / height);
                    height = MAX_DIMENSION;
                }
            }
            
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');

            if (!ctx) {
                return reject(new Error('Nie można uzyskać kontekstu canvas.'));
            }
            
            // Draw the image onto the canvas. If the source image (from AI) has transparency
            // and we save it as a JPEG, the browser will automatically fill the transparent
            // areas with white. This correctly handles the main image. Other images will
            // simply be re-encoded without their background being modified.
            ctx.drawImage(img, 0, 0, width, height);
            
            // Get the full data URL in JPEG format.
            const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
            
            // As per BaseLinker docs, strip the MIME type part ("image/jpeg;base64,")
            const base64Data = dataUrl.substring(dataUrl.indexOf(',') + 1);
            
            // Prepend only "data:" as required
            resolve(`data:${base64Data}`);
        };

        img.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            reject(new Error('Nie udało się załadować obrazu w celu konwersji.'));
        };

        img.src = objectUrl;
    });
};


const callBaseLinkerApi = async (apiToken: string, method: string, parameters: object = {}) => {
    const proxyUrl = 'https://corsproxy.io/?';
    const targetUrl = 'https://api.baselinker.com/connector.php';
    const apiUrl = `${proxyUrl}${encodeURIComponent(targetUrl)}`;
    
    const body = new URLSearchParams();
    body.append('token', apiToken);
    body.append('method', method);
    
    if (parameters && Object.keys(parameters).length > 0) {
        body.append('parameters', JSON.stringify(parameters));
    }

    const response = await fetch(apiUrl, {
        method: 'POST',
        body: body,
    });

    const responseText = await response.text();
    let data;
    try {
        data = JSON.parse(responseText);
    } catch (e) {
        console.error(`Response from proxy for method ${method} was not valid JSON:`, responseText);
        if (responseText.includes("413 Request Entity Too Large")) {
            throw new Error(`Błąd: Przesyłane obrazy są zbyt duże. Całkowity rozmiar zapytania przekroczył limit serwera proxy. Aplikacja automatycznie zmniejsza obrazy, ale w tym przypadku to nie wystarczyło. Spróbuj użyć mniejszej liczby zdjęć lub mniejszych plików graficznych.`);
        }
        throw new Error(`Błąd odpowiedzi z serwera pośredniczącego (proxy). Serwer nie zwrócił prawidłowej odpowiedzi w formacie JSON, a zamiast tego HTML - prawdopodobnie stronę błędu. Upewnij się, że masz połączenie z internetem i spróbuj ponownie.`);
    }

    if (data.status === 'ERROR') {
        const errorMessage = data.error_message || 'Nieznany błąd API';
        const errorCode = data.error_code || '';
        // Check for warnings, as image errors can appear there
        if (data.warnings && Object.keys(data.warnings).length > 0) {
             const warningsText = Object.values(data.warnings).join('; ');
             throw new Error(`Błąd API BaseLinker (${method}): ${errorMessage} (Kod: ${errorCode}). Ostrzeżenia: ${warningsText}`.trim());
        }
        throw new Error(`Błąd API BaseLinker (${method}): ${errorMessage} (Kod: ${errorCode})`.trim());
    }
    
    // Also throw an error if status is SUCCESS but there are warnings, as this indicates partial failure (e.g., images not added)
    if (data.status === 'SUCCESS' && data.warnings && Object.keys(data.warnings).length > 0) {
        const warningsText = Object.values(data.warnings).join('; ');
        throw new Error(`Produkt został dodany, ale wystąpiły problemy (np. ze zdjęciami): ${warningsText}`);
    }

    return data;
};

// --- BASELINKER CATALOG FETCH ---
export const getBaseLinkerInventories = async (apiToken: string) => {
    const data = await callBaseLinkerApi(apiToken, 'getInventories');
    if (!data.inventories) {
        throw new Error("Nie udało się pobrać katalogów produktów. Odpowiedź API nie zawiera pola 'inventories'.");
    }
    // Sort to put the default inventory first
    return [...data.inventories].sort((a, b) => (b.is_default ? 1 : 0) - (a.is_default ? 1 : 0));
};

/**
 * Fetches the list of warehouses (storages) specifically assigned to a given inventory catalog.
 * This is a direct and reliable method to get the correct warehouses for an inventory.
 * @param apiToken The user's BaseLinker API token.
 * @param inventoryId The ID of the inventory catalog.
 * @returns A promise that resolves with an array of warehouse objects.
 */
// Fix: Added a strong return type to the function and cast the result for type safety.
export const getInventoryWarehouses = async (apiToken: string, inventoryId: number): Promise<Warehouse[]> => {
    if (!inventoryId) {
        return []; // Don't make a call if inventoryId is not set
    }
    const parameters = {
        "inventory_id": inventoryId,
    };
    const data = await callBaseLinkerApi(apiToken, 'getInventoryWarehouses', parameters);
    
    // API might return an empty object or not have the key if no warehouses are assigned.
    // Also check if the response is a valid object.
    if (!data.warehouses || typeof data.warehouses !== 'object') {
        return [];
    }

    // The API returns an object where keys are the authoritative storage_ids.
    // We iterate over the keys to build our array, ensuring we use the correct ID.
    const warehousesArray: Warehouse[] = Object.keys(data.warehouses).map(storageId => {
        const warehouseData = data.warehouses[storageId];
        return {
            storage_id: storageId, // Use the object key as the authoritative source for the ID.
            name: warehouseData.name || 'Brak nazwy' // Safely access the name from the nested object.
        };
    });

    return warehousesArray;
};

/**
 * Fetches the list of price groups assigned to a given inventory catalog.
 * @param apiToken The user's BaseLinker API token.
 * @param inventoryId The ID of the inventory catalog.
 * @returns A promise that resolves with an array of price group objects.
 */
// Fix: Added a function to fetch price groups for a specific inventory, which is necessary to avoid API errors when an inventory doesn't use the default price group ID (1).
export const getInventoryPriceGroups = async (apiToken: string, inventoryId: number): Promise<PriceGroup[]> => {
    if (!inventoryId) {
        return [];
    }
    const parameters = {
        "inventory_id": inventoryId,
    };
    const data = await callBaseLinkerApi(apiToken, 'getInventoryPriceGroups', parameters);
    
    // API returns an array of price groups.
    if (!data.price_groups || !Array.isArray(data.price_groups)) {
        return [];
    }
    
    return data.price_groups as PriceGroup[];
};

/**
 * Fetches the list of categories for a given inventory catalog from BaseLinker.
 * @param apiToken The user's BaseLinker API token.
 * @param inventoryId The ID of the inventory catalog.
 * @returns A promise resolving to an array of Category objects.
 */
export const getInventoryCategories = async (apiToken: string, inventoryId: number): Promise<Category[]> => {
    if (!inventoryId) {
        return [];
    }
    const parameters = {
        "inventory_id": inventoryId,
    };
    const data = await callBaseLinkerApi(apiToken, 'getInventoryCategories', parameters);

    if (!data.categories || !Array.isArray(data.categories)) {
        return [];
    }
    return data.categories as Category[];
};

/**
 * Fetches the list of all manufacturers from BaseLinker.
 * @param apiToken The user's BaseLinker API token.
 * @returns A promise resolving to an array of Manufacturer objects.
 */
export const getInventoryManufacturers = async (apiToken: string): Promise<Manufacturer[]> => {
    const data = await callBaseLinkerApi(apiToken, 'getInventoryManufacturers');
    
    if (!data.manufacturers || !Array.isArray(data.manufacturers)) {
        return [];
    }
    return data.manufacturers as Manufacturer[];
};


// --- BASELINKER EXPORT ---
export const exportToBaseLinker = async (credentials: BaseLinkerCredentials, productData: ProductData) => {
    const { apiToken, inventoryId, storageId, priceGroupId, categoryId, manufacturerId, quantity, price } = credentials;

    try {
        // --- STEP 1: Prepare image data ---
        const imageDataPromises = productData.images.map(image => convertBlobToBase64ForBaseLinker(image.blob));
        const formattedImagesArray = await Promise.all(imageDataPromises);
        
        const imagesObject = formattedImagesArray.reduce((acc, data, index) => {
            acc[String(index)] = data;
            return acc;
        }, {} as { [key: string]: string });

        // --- STEP 2: Prepare product text fields ---
        const textFields: { [key: string]: string } = {};
        if (productData.title) textFields.name = productData.title;
        if (productData.descriptionParts[0]) textFields.description = `<p>${productData.descriptionParts[0].trim()}</p>`;
        if (productData.descriptionParts[1]) textFields.description_extra1 = productData.descriptionParts[1].trim();
        if (productData.descriptionParts[2]) textFields.description_extra2 = productData.descriptionParts[2].trim();
        if (productData.descriptionParts[3]) textFields.description_extra3 = productData.descriptionParts[3].trim();
        
        // --- STEP 3: Add product WITH stock and price information in a single, atomic call ---
        const addProductParameters: { [key: string]: any } = {
            "inventory_id": inventoryId,
            "text_fields": textFields,
            "images": imagesObject,
            "prices": {
                [priceGroupId]: price // Fix: Use the dynamic priceGroupId instead of a hardcoded '1' to support custom price groups.
            },
            "tax_rate": 23.0, // This is a required parameter for prices/stock to work.
            "stock": {
                [storageId]: quantity
            }
        };

        if (productData.sku) {
            addProductParameters.sku = productData.sku;
        }
        if (productData.ean) {
            addProductParameters.ean = productData.ean;
        }
        if (categoryId) {
            addProductParameters.category_id = categoryId;
        }
        if (manufacturerId) {
            addProductParameters.manufacturer_id = manufacturerId;
        }
        if (productData.condition) {
            addProductParameters.condition = productData.condition;
        }
        if (productData.dimensions) {
            // BaseLinker API expects dimensions in centimeters (cm) and accepts float values.
            // Our internal representation is in millimeters (mm), so we divide by 10.
            // We pass the decimal value directly without rounding to maintain precision.
            // e.g., 63mm -> 6.3cm.
            addProductParameters.width = productData.dimensions.x / 10;
            addProductParameters.height = productData.dimensions.y / 10;
            addProductParameters.length = productData.dimensions.z / 10; // 'length' corresponds to depth (z-axis)
        }
        if (productData.weight && productData.weight > 0) {
            // BaseLinker API expects weight in kilograms.
            addProductParameters.weight = productData.weight;
        }
        
        const addProductResponse = await callBaseLinkerApi(apiToken, 'addInventoryProduct', addProductParameters);
        
        if (!addProductResponse.product_id) {
            throw new Error("Nie udało się utworzyć produktu w BaseLinker lub odpowiedź nie zawierała ID produktu.");
        }

        return addProductResponse;

    } catch (error) {
        console.error("Błąd eksportu do BaseLinker:", error);
        if (error instanceof TypeError && (error.message.includes('Failed to fetch') || error.message.includes('NetworkError'))) {
             throw new Error("Błąd sieci (Failed to fetch). Ten błąd jest najczęściej spowodowany przez politykę bezpieczeństwa przeglądarki (CORS), która blokuje bezpośrednie zapytania do API BaseLinker. Aplikacja próbuje obejść ten problem za pomocą publicznego serwera proxy, ale może on być niedostępny lub zablokowany przez Twoją sieć (np. firewall, ad-blocker). Sprawdź połączenie z internetem i spróbuj ponownie.");
        }
        throw error;
    }
};