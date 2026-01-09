
import React, { useState } from 'react';
import { generateContentFromEan, fetchImageFromUrl, processRealPhoto, generateAdditionalImages, verifyVisualIdentity } from '../services/geminiService';
import { lookupEanFree, isValidEan13, searchWikimediaImages } from '../services/eanLookupService';
import { DescriptionOutput } from './DescriptionOutput';
import { Loader } from './Loader';
import { SelectedImagesPreview, ImageItem } from './SelectedImagesPreview';
import { useAuth } from '../contexts/AuthContext';
import { AuthModal } from './AuthModal';
import { TokenStore } from './TokenStore';
import { ExportModal, ExportPlatform } from './ExportModal';
import { createAllegroDraft } from '../services/allegroService';
import { exportToBaseLinker } from '../services/exportService';
import { BarcodeScannerModal } from './BarcodeScannerModal';
import { CsvExportModal } from './CsvExportModal';
import { FileUpload } from './FileUpload'; // Import FileUpload

const digitsOnly = (v: string) => (v || "").replace(/[^\d]/g, "").trim();

const getEanVariants = (input: string) => {
  const raw = digitsOnly(input);
  const out: string[] = [];
  if (/^\d{12}$/.test(raw)) { out.push(raw, "0" + raw); }
  else if (/^\d{13}$/.test(raw)) { out.push(raw); if (raw.startsWith("0")) out.push(raw.slice(1)); }
  if (out.length === 0 && raw.length > 0) out.push(raw);
  return Array.from(new Set(out));
};

const quickSig = async (blob: Blob) => {
  const a = blob.slice(0, 2048); 
  const buf = await a.arrayBuffer();
  let sum = 0;
  const u8 = new Uint8Array(buf);
  for (let i = 0; i < u8.length; i += 29) sum = (sum * 33 + u8[i]) >>> 0;
  return `${blob.size}-${sum}`;
};

const getImageMeta = (blob: Blob) =>
  new Promise<{ w: number; h: number }>((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve({ w: img.naturalWidth, h: img.naturalHeight }); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Image load error")); };
    img.src = url;
  });

export const EanGenerator: React.FC = () => {
    const { user, deductToken } = useAuth();
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
    const [isTokenStoreOpen, setIsTokenStoreOpen] = useState(false);
    const [isScannerOpen, setIsScannerOpen] = useState(false);

    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [exportPlatform, setExportPlatform] = useState<ExportPlatform | null>(null);
    const [exportStatus, setExportStatus] = useState<'idle' | 'exporting' | 'success' | 'error'>('idle');

    const [isCsvModalOpen, setIsCsvModalOpen] = useState<boolean>(false);

    const [ean, setEan] = useState('');
    const [manualTitle, setManualTitle] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [loadingStep, setLoadingStep] = useState<string>('');
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<any>(null);
    const [aiImages, setAiImages] = useState<ImageItem[]>([]);
    const [sourceInfo, setSourceInfo] = useState<string>('');
    const [showManualUpload, setShowManualUpload] = useState(false);

    // --- Deep Image Search Logic ---
    const executeDeepImageSearch = async (aiData: any, isManual: boolean) => {
        try {
            setIsLoading(true);
            setShowManualUpload(false);
            
            // 1. Wikimedia Search (Fallback by Title)
            setLoadingStep(`📚 Przeszukiwanie Wikimedia Commons: "${aiData.auction_title}"...`);
            const wikiUrls = await searchWikimediaImages(aiData.auction_title);
            
            // 2. Gemini Store Search
            let extraUrls: string[] = [];
            // If manual mode OR wiki failed, try Gemini deep search
            if ((isManual || wikiUrls.length < 2) && aiData.auction_title) {
                setLoadingStep(`🔎 Szukanie w sklepach online dla "${aiData.auction_title}"...`);
                try {
                    const titleSearchData = await generateContentFromEan("", aiData.auction_title);
                    if (titleSearchData.image_urls) extraUrls = titleSearchData.image_urls;
                } catch (e) {}
            }

            const allUrlsRaw = [...wikiUrls, ...(aiData.image_urls || []), ...extraUrls];
            const urls = Array.from(new Set(allUrlsRaw))
                .filter((u): u is string => typeof u === 'string' && u.startsWith('http'))
                .slice(0, 45); 

            if (urls.length === 0) {
                setShowManualUpload(true);
                setIsLoading(false);
                return;
            }

            setLoadingStep(`🚀 Weryfikacja ${urls.length} źródeł wizualnych...`);

            const validCandidates: { blob: Blob, w: number, h: number, sig: string }[] = [];
            const seenSignatures = new Set<string>();
            const BATCH_SIZE = 3;
            const MIN_SIZE = 200; // STRICT: Only decent quality
            const MAX_VISION_CHECKS = 20; 
            let visionChecks = 0;

            for (let i = 0; i < urls.length; i += BATCH_SIZE) {
                if (validCandidates.length >= 4) break;
                if (i > 0) await new Promise(r => setTimeout(r, 500));

                const batch = urls.slice(i, i + BATCH_SIZE);
                const promises = batch.map(async (url) => {
                    try {
                        const blob = await fetchImageFromUrl(url);
                        if (!blob) return null;
                        const sig = await quickSig(blob);
                        if (seenSignatures.has(sig)) return null; 
                        
                        let meta;
                        try {
                             meta = await getImageMeta(blob);
                             if (meta.w < MIN_SIZE || meta.h < MIN_SIZE) return null; 
                        } catch (e) { return null; }

                        if (validCandidates.length < 5 && visionChecks < MAX_VISION_CHECKS) {
                             visionChecks++;
                             // STRICT VISUAL VERIFICATION
                             const isCorrectProduct = await verifyVisualIdentity(blob, aiData.auction_title, url);
                             if (!isCorrectProduct) return null; 
                        }
                        return { blob, ...meta, sig };
                    } catch (e) { return null; }
                });

                const results = await Promise.all(promises);
                results.forEach(res => {
                    if (res) {
                        seenSignatures.add(res.sig);
                        validCandidates.push(res);
                    }
                });
                
                if (validCandidates.length > 0) setLoadingStep(`Zweryfikowano ${validCandidates.length} zdjęć...`);
            }

            // STRICT FAILURE IF NO CANDIDATES -> MANUAL UPLOAD
            if (validCandidates.length === 0) {
                console.warn("No verified images found. Prompting manual upload.");
                setShowManualUpload(true);
                setIsLoading(false);
                return;
            }

            // Only show verified candidates
            validCandidates.sort((a, b) => (b.w * b.h) - (a.w * a.h));
            const goodImages = validCandidates.slice(0, 4).map(c => c.blob);
            
            setSourceInfo(`Źródło: Zweryfikowane (${validCandidates.length} szt.)`);
            setLoadingStep(`🎨 Generowanie galerii...`);

            const gallery: ImageItem[] = [];
            
            // If we have verified images, process them
            if (goodImages.length > 0) {
                // Main image processing
                const mainBlob = await processRealPhoto(goodImages[0], aiData.auction_title);
                gallery.push({ name: 'main_product.png', blob: mainBlob, isAi: false });

                // Remaining verified images
                const remaining = goodImages.slice(1, 4);
                const processedRemaining = await Promise.all(remaining.map(async (blob, idx) => {
                    const clean = await processRealPhoto(blob, aiData.auction_title);
                    return { name: `view_${idx + 1}.png`, blob: clean, isAi: false };
                }));
                gallery.push(...processedRemaining);
            }

            // Fill gaps with AI generated views
            if (gallery.length < 4 && gallery.length > 0) {
                setLoadingStep(`✨ Tworzenie nowych ujęć 3D...`);
                const needed = 4 - gallery.length;
                for (let k = 0; k < needed; k++) {
                    try {
                        const one = await generateAdditionalImages(gallery[0].blob!, aiData.auction_title, 1, "", gallery.length + k);
                        if (one && one.length > 0) gallery.push(one[0]);
                    } catch (e) {}
                }
            }

            setAiImages(gallery);
            deductToken(1);
        } catch (err: any) {
            console.error(err);
            setError(err.message || "Błąd wyszukiwania.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleManualImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;
        setIsLoading(true);
        setLoadingStep("Przetwarzanie Twojego zdjęcia...");
        
        try {
            const file = e.target.files[0];
            const blob = new Blob([file], { type: file.type });
            const title = result?.auction_title || manualTitle || "Produkt";
            
            // Process the manually uploaded image
            const mainBlob = await processRealPhoto(blob, title);
            
            const gallery: ImageItem[] = [{ name: 'main_manual.png', blob: mainBlob, isAi: false }];
            
            // Generate AI views from it
            setLoadingStep("Generowanie widoków AI...");
            const aiViews = await generateAdditionalImages(mainBlob, title, 3);
            gallery.push(...aiViews);
            
            setAiImages(gallery);
            setShowManualUpload(false);
            deductToken(1);
        } catch (err) {
            setError("Błąd przetwarzania zdjęcia.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleSearch = async (isManual: boolean = false) => {
        if (!user) { setIsAuthModalOpen(true); return; }
        if (!ean && !manualTitle) { setError("Wpisz EAN lub nazwę produktu."); return; }
        
        setIsLoading(true);
        setError(null);
        setAiImages([]);
        setResult(null);
        setShowManualUpload(false);
        
        const rawEan = digitsOnly(ean);

        if (!isManual && rawEan.length === 13 && !isValidEan13(rawEan)) {
            setError("Niepoprawny kod EAN-13 (błąd sumy kontrolnej). Sprawdź cyfry.");
            setIsLoading(false);
            return;
        }

        try {
            let eanVariants: string[] = [];
            if (isManual) eanVariants = [];
            else if (rawEan.length === 13) eanVariants = [rawEan];
            else eanVariants = getEanVariants(ean);

            let aiData: any = null;
            let fastLookupImages: string[] = [];
            let fastLookupTitle: string = "";

            // --- STRATEGIA 1: FAST FREE LOOKUP (OFF/Wikidata) ---
            if (!isManual && eanVariants.length > 0) {
                setLoadingStep(`🔍 Szybkie wyszukiwanie EAN (OFF/Wikidata)...`);
                for (const cand of eanVariants) {
                    try {
                        const fastResult = await lookupEanFree(cand);
                        if (fastResult) {
                            fastLookupTitle = [fastResult.brand, fastResult.title].filter(Boolean).join(" ");
                            fastLookupImages = fastResult.images || [];
                            aiData = {
                                auction_title: fastLookupTitle,
                                image_urls: fastLookupImages,
                                sku: "",
                                description_parts: [`Produkt zidentyfikowany w bazie ${fastResult.source}. EAN: ${fastResult.ean}`]
                            };
                            setEan(cand);
                            setSourceInfo(`Źródło: ${fastResult.source}`);
                            break;
                        }
                    } catch (e) {}
                }
            }

            // --- STRATEGIA 2: AI FALLBACK ---
            if (!aiData) {
                if (isManual) {
                    setLoadingStep(`🔎 Szukanie po nazwie (AI)...`);
                    aiData = await generateContentFromEan("", manualTitle);
                } else {
                    setLoadingStep(`🤖 Identyfikacja produktu przez AI...`);
                    let lastErr: any = null;
                    for (const cand of eanVariants) {
                        try {
                            aiData = await generateContentFromEan(cand, undefined);
                            if (aiData && aiData.auction_title) {
                                setEan(cand);
                                break;
                            }
                        } catch (e) { lastErr = e; }
                    }
                    if (!aiData) throw lastErr || new Error("Nie udało się znaleźć produktu.");
                }
            }

            setResult(aiData);

            // --- FAST MODE IMAGE DISPLAY (URL-FIRST) ---
            if (fastLookupImages.length > 0) {
                const initialImages: ImageItem[] = fastLookupImages.slice(0, 4).map((url, i) => ({
                    name: i === 0 ? 'main_product.png' : `view_${i}.png`,
                    url: url,
                    isAi: false
                }));
                
                setAiImages(initialImages);
                deductToken(1);
                setIsLoading(false);

                // Background Hydration
                const hydrate = async () => {
                    const hydrated = await Promise.all(initialImages.map(async (item, idx) => {
                        try {
                            const blob = await fetchImageFromUrl(item.url!);
                            return { ...item, blob: blob };
                        } catch(e) { 
                            return item; 
                        }
                    }));
                    setAiImages(hydrated);
                };
                hydrate();
                return;
            }

            // Go to Deep Search / Manual Flow
            await executeDeepImageSearch(aiData, isManual);

        } catch (err: any) {
            console.error(err);
            setError(err.message || "Błąd wyszukiwania.");
            setIsLoading(false);
        }
    };

    const handleSelectKey = async () => {
        if ((window as any).aistudio?.openSelectKey) await (window as any).aistudio.openSelectKey();
    };

    const handleExport = async (credentials: any) => {
        // Only export images that have successfully hydrated blobs
        const validImages = aiImages.filter((img): img is { name: string; blob: Blob; isAi?: boolean } => !!img.blob);
        
        if (validImages.length === 0) {
            alert("Brak zdjęć do eksportu. Dodaj zdjęcie ręcznie.");
            return;
        }

        setExportStatus('exporting');
        try {
            if (exportPlatform === 'allegro') {
                await createAllegroDraft(credentials, { ...result, images: validImages, ean });
            } else if (exportPlatform === 'baselinker') {
                await exportToBaseLinker(credentials, { ...result, images: validImages, ean, condition: 'new' });
            }
            setExportStatus('success');
        } catch (err) { setExportStatus('error'); }
    };

    const onBarcodeDetected = (code: string) => { setEan(code); };

    // Prepare blobs for CSV export (ignore missing blobs)
    const validBlobsForCsv = aiImages.filter((img): img is { name: string; blob: Blob } => !!img.blob);

    return (
        <div className="bg-slate-900 rounded-2xl shadow-2xl p-6 md:p-8 border border-slate-800">
            <div className="text-center mb-8">
                <div className="inline-flex items-center gap-2 mb-2">
                    <h2 className="text-4xl font-bold text-white tracking-tight">Generator EAN</h2>
                    <span className="bg-emerald-500/20 text-emerald-400 text-[10px] font-bold px-2 py-1 rounded border border-emerald-500/30 uppercase tracking-tighter">Fast-Check v4</span>
                </div>
                <p className="text-gray-400 italic font-medium tracking-wide text-sm">Flow: OFF/Wiki → Search → Manual</p>
                <button onClick={handleSelectKey} className="mt-4 text-[10px] text-gray-500 hover:text-emerald-400 transition-colors">Klucz API</button>
            </div>

            <div className="max-w-xl mx-auto mb-10 space-y-4">
                <div className="flex gap-2 sm:gap-4">
                    <div className="relative flex-1">
                        <input 
                            type="text" 
                            value={ean} 
                            onChange={e => setEan(e.target.value)} 
                            onKeyDown={e => e.key === 'Enter' && handleSearch(false)} 
                            placeholder="Wklej kod EAN produktu..." 
                            className="w-full p-4 pr-12 bg-slate-800 border border-gray-700 rounded-xl text-white font-mono text-lg outline-none focus:ring-2 focus:ring-emerald-500 transition-all shadow-inner" 
                        />
                        <button 
                            onClick={() => setIsScannerOpen(true)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-gray-400 hover:text-white bg-slate-700/50 hover:bg-slate-600 rounded-lg transition-colors"
                            title="Skanuj kod EAN"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                            </svg>
                        </button>
                    </div>
                    
                    <button onClick={() => handleSearch(false)} disabled={isLoading} className="px-6 sm:px-10 font-bold rounded-xl shadow-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-all transform active:scale-95 disabled:opacity-50"> {isLoading ? '...' : 'Szukaj'} </button>
                </div>
                
                {error && !isLoading && (
                    <div className="p-6 bg-slate-950 border border-red-500/40 rounded-xl animate-fade-in space-y-4 shadow-2xl">
                         <div className="flex gap-4 items-center text-red-500"> <span>⚠️</span> <p className="text-xs text-red-200 font-bold uppercase tracking-widest">{error}</p> </div>
                         <div className="space-y-3">
                            <p className="text-gray-400 text-sm">Spróbuj wpisać nazwę ręcznie, jeśli EAN nie daje wyników:</p>
                            <input type="text" value={manualTitle} onChange={e => setManualTitle(e.target.value)} placeholder="Wpisz Markę i Model..." className="w-full p-4 bg-slate-900 border border-gray-700 rounded-xl text-sm text-white focus:ring-2 focus:ring-emerald-500 outline-none" />
                            <div className="flex gap-3">
                                <button onClick={() => handleSearch(true)} className="flex-1 py-4 bg-indigo-600 text-white font-bold rounded-xl uppercase text-xs hover:bg-indigo-500 transition-all shadow-lg">Szukaj po Nazwie</button>
                            </div>
                         </div>
                    </div>
                )}
            </div>

            {isLoading && <Loader message={loadingStep} />}

            {result && !isLoading && (aiImages.length === 0 || showManualUpload) && (
                <div className="p-8 bg-slate-800/60 border border-emerald-500/30 rounded-xl text-center space-y-6 animate-fade-in">
                    <div className="space-y-2">
                        <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950 px-2 py-1 rounded-full border border-emerald-800 uppercase tracking-tighter">Produkt Zidentyfikowany</span>
                        <h3 className="text-2xl font-bold text-white">{result.auction_title}</h3>
                        <p className="text-gray-400 max-w-md mx-auto">
                            Znaleźliśmy produkt, ale nie udało się pobrać wystarczająco dobrych zdjęć.
                            <br/>Dodaj własne zdjęcie, a AI je ulepszy i dokończy ofertę.
                        </p>
                    </div>
                    <div className="flex justify-center gap-4 pt-2">
                        <div className="w-full max-w-sm">
                            <FileUpload 
                                id="manual-upload" 
                                label="Dodaj zdjęcie produktu" 
                                accept="image/*" 
                                onChange={handleManualImageUpload} 
                                fileName={undefined}
                                icon={<svg className="h-10 w-10 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>} 
                            />
                        </div>
                    </div>
                </div>
            )}

            {result && !isLoading && aiImages.length > 0 && (
                <div className="space-y-10 animate-fade-in">
                    <div className="bg-slate-800/60 p-8 rounded-xl border border-emerald-500/20 shadow-lg text-center relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-2"> <span className="text-[9px] font-bold text-emerald-400 bg-emerald-950 px-2 py-1 rounded-full border border-emerald-800 shadow-xl tracking-tighter uppercase">{sourceInfo}</span> </div>
                        <h3 className="text-3xl font-extrabold text-white mb-2 leading-tight tracking-tight">{result.auction_title}</h3>
                        <p className="text-xs text-emerald-500/60 uppercase tracking-widest font-bold">Galeria wygenerowana automatycznie</p>
                    </div>

                    <SelectedImagesPreview images={aiImages} onImageUpdate={(n, b) => setAiImages(imgs => imgs.map(i => i.name === n ? { ...i, blob: b } : i))} onColorChange={async () => {}} />
                    <DescriptionOutput auctionTitle={result.auction_title} descriptionParts={result.description_parts} sku={result.sku} ean={ean} onEanChange={setEan} colors={[]} condition="new" dimensions={null} weight={null} onDimensionsChange={()=>{}} onWeightChange={()=>{}} />

                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-8 border-t border-slate-800">
                        <button onClick={() => setIsCsvModalOpen(true)} className="px-10 py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-xl transition-all transform hover:scale-105">Pobierz plik .csv</button>
                        <button onClick={() => {setExportPlatform('baselinker'); setIsExportModalOpen(true);}} className="px-10 py-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl shadow-xl transition-all transform hover:scale-105">Eksportuj do BaseLinker</button>
                        <button onClick={() => {setExportPlatform('allegro'); setIsExportModalOpen(true);}} className="px-10 py-4 bg-orange-600 hover:bg-orange-500 text-white font-bold rounded-xl shadow-xl transition-all transform hover:scale-105">Wystaw na Allegro</button>
                    </div>
                </div>
            )}

            <BarcodeScannerModal 
                isOpen={isScannerOpen} 
                onClose={() => setIsScannerOpen(false)} 
                onDetected={onBarcodeDetected} 
            />

            <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
            <TokenStore isOpen={isTokenStoreOpen} onClose={() => setIsTokenStoreOpen(false)} />
            
            <CsvExportModal 
                isOpen={isCsvModalOpen} 
                onClose={() => setIsCsvModalOpen(false)} 
                imageBlobs={validBlobsForCsv}
                data={{
                    title: result?.auction_title || '',
                    sku: result?.sku || '',
                    ean: ean,
                    condition: 'Nowy',
                    colors: '',
                    width: '',
                    height: '',
                    depth: '',
                    weight: '',
                    description_main: result?.description_parts?.[0] || '',
                    description_extra1: result?.description_parts?.[1] || '',
                    description_extra2: result?.description_parts?.[2] || '',
                    description_extra3: result?.description_parts?.[3] || '',
                    images: aiImages.map(img => img.name).join('|')
                }}
            />

            {isExportModalOpen && exportPlatform && (
                <ExportModal isOpen={isExportModalOpen} onClose={() => setIsExportModalOpen(false)} platform={exportPlatform} onExport={handleExport} status={exportStatus} error={null} />
            )}
        </div>
    );
};
