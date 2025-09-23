import { GoogleGenAI, Type, Modality } from "@google/genai";

/**
 * Solidny parser odpowiedzi JSON, który aktywnie wyszukuje i wyodrębnia prawidłowy
 * fragment JSON z surowego tekstu, ignorując wszelkie poprzedzające go teksty
 * konwersacyjne lub bloki markdown.
 * @param responseText Surowa odpowiedź tekstowa z API.
 * @returns Sparsowany obiekt JSON.
 */
const parseJsonResponse = (responseText: string) => {
  // Znajdź początek JSON - może to być obiekt '{' lub tablica '['
  const jsonStartIndex = responseText.indexOf('{');
  const jsonArrayStartIndex = responseText.indexOf('[');

  let startIndex = -1;

  // Ustal, który znacznik JSON pojawia się jako pierwszy
  if (jsonStartIndex !== -1 && jsonArrayStartIndex !== -1) {
      startIndex = Math.min(jsonStartIndex, jsonArrayStartIndex);
  } else if (jsonStartIndex !== -1) {
      startIndex = jsonStartIndex;
  } else {
      startIndex = jsonArrayStartIndex;
  }
  
  if (startIndex === -1) {
    // Jeśli nie znaleziono obiektu ani tablicy JSON, nie można przetworzyć odpowiedzi.
    console.error("W odpowiedzi nie znaleziono obiektu ani tablicy JSON:", responseText);
    throw new Error(`Otrzymano odpowiedź z API bez prawidłowego obiektu JSON. Surowy tekst: "${responseText}"`);
  }

  // Znajdź koniec JSON - ostatni '}' lub ']'
  const jsonEndIndex = responseText.lastIndexOf('}');
  const jsonArrayEndIndex = responseText.lastIndexOf(']');
  const endIndex = Math.max(jsonEndIndex, jsonArrayEndIndex);

  if (endIndex === -1 || endIndex < startIndex) {
    console.error("Nie można znaleźć prawidłowego końca JSON w odpowiedzi:", responseText);
    throw new Error(`Otrzymano niekompletną odpowiedź JSON z API. Surowy tekst: "${responseText}"`);
  }
  
  // Wyodrębnij potencjalny ciąg znaków JSON
  const jsonText = responseText.substring(startIndex, endIndex + 1);

  try {
    return JSON.parse(jsonText);
  } catch (error) {
    console.error("Błąd podczas parsowania wyodrębnionego JSON:", jsonText);
    throw new Error(`Otrzymano nieprawidłowy format JSON z API. Surowy tekst: "${responseText}"`);
  }
};

const getMimeTypeFromName = (fileName: string): string => {
  const extension = fileName.split('.').pop()?.toLowerCase();
  switch (extension) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    default:
      return '';
  }
};

const fileToGenerativePart = async (file: Blob, fileName: string = 'image.png'): Promise<{ inlineData: { data: string; mimeType: string } }> => {
  const mimeType = file.type || getMimeTypeFromName(fileName);

  if (!mimeType) {
    throw new Error(`Nie można określić typu MIME dla pliku: ${fileName}. Upewnij się, że plik ma poprawne rozszerzenie (jpg, png, gif, webp).`);
  }
  
  const base64EncodedDataPromise = new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result.split(',')[1]);
      } else {
        resolve('');
      }
    };
    reader.readAsDataURL(file);
  });
  const base64EncodedData = await base64EncodedDataPromise;
  return {
    inlineData: {
      data: base64EncodedData,
      mimeType: mimeType,
    },
  };
};

const buildBasePrompt = (
    modelFileName: string | null,
    additionalInfo: string
): string => {
    const fileSourceInstruction = modelFileName
    ? `na podstawie załączonych zdjęć produktu oraz nazwy pliku modelu 3D: "${modelFileName}"`
    : `na podstawie załączonych zdjęć produktu`;

    const additionalInfoSection = additionalInfo.trim()
    ? `
**Informacje Dodatkowe od Użytkownika (NAJWYŻSZY PRIORYTET):**
Użytkownik dostarczył następujące kluczowe informacje, które MUSISZ uwzględnić i wpleść w treść opisu w naturalny i logiczny sposób. Potraktuj te dane jako absolutnie najważniejsze źródło prawdy o produkcie:
"${additionalInfo.trim()}"
`
    : '';

  return `
Jesteś elitarnym strategiem e-commerce i kreatywnym copywriterem, specjalizującym się w tworzeniu wysokokonwersyjnych opisów na Allegro. Twoim celem jest stworzenie opisu, który nie tylko informuje, ale przede wszystkim sprzedaje, budując w kliencie poczucie potrzeby i ekscytacji. Masz za zadanie wygenerowanie kompletnych danych do aukcji ${fileSourceInstruction}.
${additionalInfoSection}

**NAJWAŻNIEJSZA ZASADA: Zwięzłość i Treściwość!**
Pisz krótko, ale mocno w przekazie. Każdy akapit musi być łatwy do szybkiego przeczytania i zrozumienia. Unikaj zbędnych słów i "lania wody". Używaj prostego, bezpośredniego języka.

Twoje zadania:
1.  **Stwórz Tytuł Aukcji (Zgodny z SEO Allegro):** Ściśle trzymaj się formatu: "[Główna Nazwa Produktu] do/na [Główne Zastosowanie] - Druk 3D". Tytuł musi być zwięzły, konkretny i maksymalnie nasycony słowami kluczowymi. Długość: 50-75 znaków. Przykład: "Uchwyt Ścienny na Pady PS5 - Druk 3D".
2.  **Stwórz Opis Produktu (4 Akapity Perswazji):** Wygeneruj profesjonalny, ZWIĘZŁY opis podzielony na DOKŁADNIE 4 oddzielne akapity. Każdy akapit musi być osobnym elementem w tablicy i razem muszą tworzyć spójną, przekonującą historię.
3.  **Wygeneruj Identyfikatory Produktu (SKU i EAN):**
    - **SKU:** Stwórz unikalny, opisowy kod SKU na podstawie nazwy produktu. Format: Główne słowa kluczowe oddzielone myślnikami, pisane wielkimi literami. Przykład: UCHWYT-SCIENNY-PAD-PS5.
    - **EAN:** Dokładnie przeanalizuj wszystkie dostarczone zdjęcia w poszukiwaniu kodu kreskowego. Jeśli znajdziesz czytelny kod EAN, zwróć jego numer. Jeśli na żadnym zdjęciu nie ma kodu kreskowego lub jest on nieczytelny, zwróć pusty ciąg znaków (""). Nie wymyślaj numeru EAN.
4.  **Wygeneruj Listę Kolorów:** Przeanalizuj zdjęcia i zidentyfikuj wszystkie DISTINCT kolory potrzebne do wydrukowania przedmiotu. Zwróć je jako listę nazw kolorów. Bądź precyzyjny (np. "Czarny", "Czerwony", "Biały"). Jeśli przedmiot jest jednokolorowy, zwróć listę z jednym kolorem.

---

**Struktura Opisu (4 Zwięzłe Akapity):**

**Paragraf 1: Haczyk Emocjonalny - Konkretne Rozwiązanie**
Zacznij od zdania, które uderza w sedno problemu klienta (np. "Masz dość bałaganu na biurku?"). Natychmiast przedstaw produkt jako rozwiązanie. Wymień 2-3 najważniejsze KORZYŚCI w krótkiej, dynamicznej formie. Utrzymaj ten akapit krótki i konkretny.

**Paragraf 2: Jakość i Technologia w Pigułce**
Zbuduj zaufanie, przechodząc od razu do rzeczy. Zamiast długich opisów, **inteligentnie wpleć specyfikację w 2-3 zwięzłe zdania**.
- **Materiał:** Na podstawie wyglądu i zastosowania produktu (widocznych na zdjęciach), **wybierz i krótko uzasadnij najlepszy materiał**. Np. dla uchwytu: "Wykonany z ultrawytrzymałego PETG, gwarantuje bezpieczeństwo Twojego sprzętu.", a dla figurki: "Wydrukowany z ekologicznego PLA o pięknym, satynowym wykończeniu.".
- **Jakość:** Zamiast technicznych detali, napisz po prostu: "Drukujemy w wysokiej rozdzielczości, co zapewnia doskonałą jakość detali i solidną konstrukcję."
- **Skup się na esencji, bez zbędnych ozdobników.**

**Paragraf 3: Personalizacja i Styl**
Pokaż klientowi, jak produkt wpasuje się w jego świat. Przedstaw opcje zwięźle i zachęcająco.
- **Kontekst i Kolor:** Połącz wszystko w jedno zdanie, np. "Idealnie wpasuje się w nowoczesne wnętrze. Domyślnie wysyłamy kolor czarny, ale na życzenie możemy przygotować inny - po prostu napisz do nas!".
- **Unikalność:** Możesz dodać krótką wzmiankę, np. "Każdy egzemplarz tworzymy specjalnie dla Ciebie."

**Paragraf 4: Konkret i Pewność Zakupu**
Zbierz kluczowe informacje logistyczne i zamknij sprzedaż. Bądź bezpośredni i konkretny.
- **Co kupujesz:** "Cena dotyczy jednej sztuki gotowego produktu."
- **Pochodzenie:** "Produkt wykonany w Polsce."
- **Wezwanie do Działania (CTA):** Zakończ prostym i silnym CTA, np. "Dodaj do koszyka i uporządkuj swoją przestrzeń!", "Kup teraz i ciesz się wyjątkowym designem!".
`;
};

const buildUnifiedPrompt = (
    modelFileName: string | null,
    imageFileNames: string[],
    additionalInfo: string
): string => {
  const imageCountInstruction = imageFileNames.length > 4 
    ? `Z dostarczonej listy ${imageFileNames.length} zdjęć, wybierz 4 najlepsze, które najlepiej zaprezentują produkt.`
    : `Przeanalizuj dostarczone ${imageFileNames.length} zdjęcia i uszereguj je w optymalnej kolejności do prezentacji na aukcji.`;

  return `
${buildBasePrompt(modelFileName, additionalInfo)}

**Instrukcja Dodatkowa (NAJWAŻNIEJSZA): Analiza i Selekcja Zdjęć**

Twoim kluczowym zadaniem, oprócz tworzenia tekstów, jest analiza i selekcja zdjęć.
- **Dostępne pliki zdjęć:** ${imageFileNames.join(', ')}
- ${imageCountInstruction}

**Kryteria wyboru i kolejności:**
1.  **ZDJĘCIE GŁÓWNE (pierwsze na liście):** To jest absolutny priorytet. To zdjęcie będzie miniaturką aukcji i musi być "strzałem w dziesiątkę" (hero shot), które przyciągnie wzrok klienta. Musi spełniać następujące kryteria w podanej kolejności ważności:
    - **NAJWAŻNIEJSZE KRYTERIUM: KOMPLETNOŚĆ UJĘCIA.** Zdjęcie MUSI pokazywać **CAŁY, KOMPLETNY produkt**. Kategorycznie nie może to być zbliżenie (close-up) na detal, fragment, czy ucięty kadr. Musi to być ogólne ujęcie, które najlepiej reprezentuje cały przedmiot.
    - **Klarowność i ostrość:** Obraz musi być wyraźny, dobrze oświetlony i wysokiej jakości.
    - **Atrakcyjność wizualna:** Zdjęcie powinno być estetyczne i zachęcające.
    - **Kontekst (opcjonalnie):** Jeśli dostępne jest zdjęcie pokazujące produkt w użyciu (np. uchwyt na ścianie), jest to silny kandydat, ale tylko pod warunkiem, że spełnia pierwsze, najważniejsze kryterium (pokazuje cały produkt).
2.  **ZDJĘCIA UZUPEŁNIAJĄCE (kolejne pozycje):** Pozostałe wybrane zdjęcia (do 3) powinny uzupełniać główne ujęcie, pokazując:
    - Produkt z **innych perspektyw** (tył, bok).
    - **Zbliżenia na detale** i fakturę (te są idealne tutaj, ale nie jako zdjęcie główne).
    - **Skalę produktu** (np. w dłoni, obok znanego przedmiotu).

**Format Wyjściowy:**
Zwróć odpowiedź w formacie JSON, ściśle przestrzegając poniższego schematu. Klucz "selected_images" MUSI zawierać tablicę z nazwami plików w optymalnej kolejności (od 1 do 4 zdjęć). Klucz "description_parts" MUSI zawierać DOKŁADNIE 4 akapity.
`;
};


export const generateAllegroDescription = async (
  imageFiles: File[],
  modelFile: File | null,
  additionalInfo: string
): Promise<{ auctionTitle: string; descriptionParts: string[]; selectedImageNames: string[], sku: string; ean: string; colors: string[] }> => {
  if (!process.env.API_KEY) {
    throw new Error("API key not configured.");
  }
  if (imageFiles.length === 0) {
      throw new Error("Do wygenerowania opisu potrzebne jest przynajmniej jedno zdjęcie.");
  }
  
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const modelFileName = modelFile?.name || null;
  
  const imageFileNames = imageFiles.map(f => f.name);
  const textPrompt = buildUnifiedPrompt(modelFileName, imageFileNames, additionalInfo);

  const imageContentParts = await Promise.all(
      imageFiles.map(file => fileToGenerativePart(file, file.name))
  );
  const contentParts = [...imageContentParts, { text: textPrompt }];

  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      auction_title: {
        type: Type.STRING,
        description: 'Tytuł aukcji Allegro zoptymalizowany pod SEO, o długości 50-75 znaków.',
      },
      description_parts: {
        type: Type.ARRAY,
        description: 'Tablica zawierająca DOKŁADNIE 4 akapity opisu produktu.',
        items: { type: Type.STRING },
      },
      selected_images: {
        type: Type.ARRAY,
        description: 'Tablica zawierająca od 1 do 4 nazw plików najlepszych zdjęć, posortowanych w optymalnej kolejności (najlepsze na początku).',
        items: { type: Type.STRING },
      },
      sku: {
        type: Type.STRING,
        description: 'Sugerowany, unikalny kod SKU produktu, np. UCHWYT-SCIENNY-PAD-PS5.',
      },
      ean: {
        type: Type.STRING,
        description: 'Numer EAN (kod kreskowy) produktu, jeśli został zidentyfikowany na zdjęciu. W przeciwnym razie pusty string.',
      },
      colors: {
        type: Type.ARRAY,
        description: 'Tablica zawierająca nazwy kolorów potrzebnych do wydruku przedmiotu.',
        items: { type: Type.STRING },
      },
    },
    propertyOrdering: ["auction_title", "description_parts", "selected_images", "sku", "ean", "colors"],
  };


  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: { parts: contentParts },
    config: {
      responseMimeType: "application/json",
      responseSchema: responseSchema,
    },
  });

  const jsonResponse = parseJsonResponse(response.text);

  // Bezpieczne pobranie nazw wybranych obrazów
  let selectedImageNames = jsonResponse.selected_images || [];

  // Walidacja i fallback
  if (selectedImageNames.length === 0) {
      console.warn("AI did not return selected images. Falling back to using the first available images.");
      selectedImageNames = imageFiles.slice(0, 4).map(f => f.name);
  }

  return {
    auctionTitle: jsonResponse.auction_title,
    descriptionParts: jsonResponse.description_parts,
    selectedImageNames: selectedImageNames,
    sku: jsonResponse.sku || '',
    ean: jsonResponse.ean || '',
    colors: jsonResponse.colors || [],
  };
};

export const addWhiteBackground = async (imageFile: Blob): Promise<Blob> => {
  if (!process.env.API_KEY) {
    throw new Error("API key not configured.");
  }
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const imagePart = await fileToGenerativePart(imageFile);
  const textPart = { text: "Isolate the main subject from its background. Place the subject on a solid, pure white background (#FFFFFF). The output image should have the same dimensions as the original. Do not add any text or other elements." };

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image-preview',
    contents: { parts: [imagePart, textPart] },
    config: {
        responseModalities: [Modality.IMAGE, Modality.TEXT],
    },
  });

  // Find the image part in the response
  const imageResponsePart = response.candidates?.[0]?.content?.parts?.find(part => part.inlineData);

  if (!imageResponsePart || !imageResponsePart.inlineData) {
      throw new Error("AI did not return an image. Please try again.");
  }

  // Convert base64 back to blob
  const base64Data = imageResponsePart.inlineData.data;
  const mimeType = imageResponsePart.inlineData.mimeType;
  const fetchResponse = await fetch(`data:${mimeType};base64,${base64Data}`);
  const newBlob = await fetchResponse.blob();

  return newBlob;
};

/**
 * Generates a single, high-quality "showcase" image instead of multiple separate ones
 * to avoid hitting API rate limits and to provide a more professional result.
 * This function makes only ONE API call.
 * @param mainImageBlob The main product image to use as a base.
 * @param auctionTitle The title of the product for context.
 * @param count This parameter is ignored, kept for signature compatibility. The function always generates one image.
 * @returns A promise that resolves to an array containing a single generated image object, or an empty array on failure.
 */
export const generateAdditionalImages = async (
  mainImageBlob: Blob,
  auctionTitle: string,
  count: number
): Promise<{ name: string; blob: Blob }[]> => {
    if (!process.env.API_KEY) {
        throw new Error("API key not configured.");
    }
    if (count <= 0) {
        return [];
    }
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const imagePart = await fileToGenerativePart(mainImageBlob);

    const prompt = `
Jesteś ekspertem od edycji zdjęć produktowych. Twoim zadaniem jest przekształcenie poniższego zdjęcia w profesjonalną fotografię studyjną, idealną do użytku w e-commerce.

**Tytuł produktu dla kontekstu:** "${auctionTitle}"

**Ścisłe instrukcje edycji:**
1.  **Zachowaj produkt nietknięty:** Kształt, kolor, tekstura i wszystkie detale oryginalnego produktu muszą pozostać w 100% niezmienione. Nie dodawaj, nie usuwaj i nie zmieniaj niczego na samym produkcie.
2.  **Zastąp tło:** Usuń całe oryginalne tło i zastąp je idealnie czystym, jednolitym białym tłem (#FFFFFF).
3.  **Dodaj realistyczny cień:** Pod produktem umieść subtelny, miękki cień, aby wyglądał, jakby stał na białej powierzchni.
4.  **Popraw oświetlenie:** Zastosuj studyjne oświetlenie, aby produkt był równomiernie oświetlony, a jego detale dobrze widoczne. Unikaj prześwietleń i zbyt ostrych cieni.
5.  **Brak dodatków:** Finalny obraz musi być czysty — bez żadnych tekstów, ramek, logo czy znaków wodnych.

Zastosuj te zmiany i zwróć wyłącznie finalny obraz.
`;

    const textPart = { text: prompt };

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image-preview',
            contents: { parts: [imagePart, textPart] },
            config: {
                responseModalities: [Modality.IMAGE, Modality.TEXT],
            },
        });

        const imageResponsePart = response.candidates?.[0]?.content?.parts?.find(part => part.inlineData);
        if (!imageResponsePart || !imageResponsePart.inlineData) {
            throw new Error("AI did not return a valid image for the showcase generation.");
        }

        const base64Data = imageResponsePart.inlineData.data;
        const mimeType = imageResponsePart.inlineData.mimeType;
        const fetchResponse = await fetch(`data:${mimeType};base64,${base64Data}`);
        const newBlob = await fetchResponse.blob();

        return [{
            name: `wygenerowana_wizytowka.png`,
            blob: newBlob
        }];

    } catch (error) {
        console.error(`Error generating showcase image:`, error);
        // Return empty array on failure, so the app can continue
        return [];
    }
};

export const changeImageColor = async (imageFile: Blob, sourceColorHex: string, targetColorHex: string): Promise<Blob> => {
    if (!process.env.API_KEY) {
        throw new Error("API key not configured.");
    }
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const imagePart = await fileToGenerativePart(imageFile);
    const textPart = { text: `Twoim zadaniem jest precyzyjna zamiana koloru na zdjęciu. Znajdź wszystkie obszary na obrazie, które mają kolor zbliżony do wartości szesnastkowej "${sourceColorHex}". Zastąp ten kolor nowym kolorem o wartości szesnastkowej "${targetColorHex}". Zrób to w sposób inteligentny: zachowaj oryginalną teksturę, cienie i oświetlenie. Nie zmieniaj żadnych innych kolorów na zdjęciu. Zwróć tylko i wyłącznie obraz wynikowy.` };

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image-preview',
        contents: { parts: [imagePart, textPart] },
        config: {
            responseModalities: [Modality.IMAGE, Modality.TEXT],
        },
    });

    const imageResponsePart = response.candidates?.[0]?.content?.parts?.find(part => part.inlineData);

    if (!imageResponsePart || !imageResponsePart.inlineData) {
        throw new Error("AI nie zwróciło obrazu po próbie zmiany koloru. Spróbuj ponownie z innym opisem koloru.");
    }

    const base64Data = imageResponsePart.inlineData.data;
    const mimeType = imageResponsePart.inlineData.mimeType;
    const fetchResponse = await fetch(`data:${mimeType};base64,${base64Data}`);
    const newBlob = await fetchResponse.blob();

    return newBlob;
};

export const getColorsFromImages = async (images: { name: string; blob: Blob }[]): Promise<string[]> => {
  if (!process.env.API_KEY) {
    throw new Error("API key not configured.");
  }
  if (images.length === 0) {
      return [];
  }
  
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const textPrompt = `Jesteś ekspertem od druku 3D. Przeanalizuj te zdjęcia i zidentyfikuj wszystkie unikalne kolory potrzebne do wydrukowania widocznego na nich przedmiotu. Zwróć odpowiedź jako listę nazw kolorów w formacie JSON. Bądź precyzyjny (np. "Czarny", "Czerwony", "Biały"). Jeśli przedmiot jest jednokolorowy, zwróć listę z jednym kolorem.`;

  const imageContentParts = await Promise.all(
      images.map(image => fileToGenerativePart(image.blob, image.name))
  );
  const contentParts = [...imageContentParts, { text: textPrompt }];

  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      colors: {
        type: Type.ARRAY,
        description: 'Tablica zawierająca nazwy kolorów potrzebnych do wydruku przedmiotu.',
        items: { type: Type.STRING },
      },
    },
    propertyOrdering: ["colors"],
  };

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: { parts: contentParts },
    config: {
      responseMimeType: "application/json",
      responseSchema: responseSchema,
      thinkingConfig: { thinkingBudget: 0 },
    },
  });

  const jsonResponse = parseJsonResponse(response.text);

  return jsonResponse.colors || [];
};


export const analyzePricing = async (
  imageFile: Blob,
  auctionTitle: string
): Promise<{ products: { productTitle: string; pricePln: string; productUrl: string; }[] }> => {
  if (!process.env.API_KEY) {
    throw new Error("API key not configured.");
  }
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const imagePart = await fileToGenerativePart(imageFile);
  const textPart = {
    text: `
Jesteś zaawansowanym asystentem wyszukiwania specjalizującym się w polskim rynku e-commerce. Twoim jedynym zadaniem jest znalezienie od 1 do 5 aktywnych ofert na **allegro.pl**, które są **wizualnie i funkcjonalnie identyczne lub bardzo podobne** do produktu pokazanego na zdjęciu.

**PROCES MYŚLOWY I DZIAŁANIE:**
1.  **Analiza Obrazu i Tytułu:** Dokładnie przeanalizuj zdjęcie oraz tytuł produktu: "${auctionTitle}". Zidentyfikuj kluczowe, unikalne cechy produktu (np. "stojak na jajko meduza", "organizer na kable plaster miodu", "figurka dynia halloween").
2.  **Konstrukcja Zapytań Wyszukiwania:** Stwórz kilka precyzyjnych zapytań dla narzędzia Google Search, aby zmaksymalizować szansę na znalezienie trafnych wyników. **Zawsze używaj operatora \`site:allegro.pl\`**, aby ograniczyć wyszukiwanie tylko do tej domeny. Bądź kreatywny w doborze słów kluczowych. Przykłady zapytań, które możesz skonstruować:
    - \`site:allegro.pl "stojak na jajko meduza druk 3d"\`
    - \`site:allegro.pl "figurka meduza dekoracja"\`
    - \`site:allegro.pl "podstawka pod jajko wielkanoc"\`
3.  **Ocena Wyników:** Krytycznie oceń wyniki wyszukiwania. Odrzuć oferty, które nie są wizualnie podobne, nawet jeśli tytuł jest zbliżony. Skup się na znalezieniu ofert z taką samą estetyką (np. styl low-poly, styl realistyczny) i przeznaczeniem.
4.  **Ekstrakcja Danych:** Z każdej trafnej oferty, wyodrębnij jej **pełny tytuł**, **aktualną cenę** (w formacie "XX,XX zł") i **bezpośredni, działający link URL**.
5.  **Formatowanie Odpowiedzi (NAJWAŻNIEJSZE):**
    - **Jeśli znajdziesz pasujące oferty:** Zwróć **WYŁĄCZNIE** obiekt JSON. Nie dodawaj żadnego tekstu przed ani po obiekcie JSON.
    - **Jeśli po starannym wyszukaniu nie znajdziesz ŻADNYCH pasujących ofert:** Zwróć **WYŁĄCZNIE** pusty obiekt JSON: \`{"products": []}\`. Nie dodawaj żadnych wyjaśnień, przeprosin ani komentarzy.

**Format wyjściowy (JSON):**
Twoja odpowiedź musi być pojedynczym obiektem JSON z kluczem "products", który zawiera tablicę znalezionych ofert. Każdy obiekt w tablicy musi mieć klucze: "product_title", "price_pln" oraz "product_url".`,
  };

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: { parts: [imagePart, textPart] },
    config: {
      tools: [{googleSearch: {}}],
    },
  });
  
  try {
    const jsonResponse = parseJsonResponse(response.text);
    
    // Dodatkowa walidacja na wypadek, gdyby AI zwróciło prawidłowy JSON, ale bez klucza "products"
    if (!jsonResponse || !jsonResponse.products || !Array.isArray(jsonResponse.products)) {
        console.warn("Analiza cen zwróciła prawidłowy JSON, ale brakuje w nim tablicy 'products'. Traktowanie jako brak wyników. Surowa odpowiedź:", response.text);
        return { products: [] };
    }
  
    const mappedProducts = jsonResponse.products.map((p: any) => ({
        productTitle: p.product_title,
        pricePln: p.price_pln,
        productUrl: p.product_url,
    }));

    return {
      products: mappedProducts,
    };
  } catch (error) {
      // Błąd pochodzi z parseJsonResponse, ponieważ w odpowiedzi nie znaleziono JSON.
      // Oznacza to, że AI zignorowało instrukcje i odpowiedziało tekstem.
      // Traktujemy to jako scenariusz "nie znaleziono wyników" i zwracamy pustą tablicę.
      console.warn("Nie udało się sparsować odpowiedzi JSON z analizy cen, zakładając brak znalezionych produktów. Surowy tekst:", response.text);
      return { products: [] };
  }
};