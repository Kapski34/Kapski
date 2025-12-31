
import React, { useState } from 'react';
import { generateContentFromEan, fetchImageFromUrl, processRealPhoto, generateAdditionalImages, verifyVisualIdentity } from '../services/geminiService';
import { DescriptionOutput } from './DescriptionOutput';
import { Loader } from './Loader';
import { SelectedImagesPreview } from './SelectedImagesPreview';
import { useAuth } from '../contexts/AuthContext';
import { AuthModal } from './AuthModal';
import { TokenStore } from './TokenStore';
import { ExportModal, ExportPlatform } from './ExportModal';
import { createAllegroDraft } from '../services/allegroService';
import { exportToBaseLinker } from '../services/exportService';
import { BarcodeScannerModal } from './BarcodeScannerModal';
import { CsvExportModal } from './CsvExportModal'; // IMPORT CSV MODAL

const getImageMeta = (blob: Blob) =>
  new Promise<{ w: number; h: number }>((resolve, reject) => {
    // REMOVED STRICT MIME CHECK: Proxies sometimes return application/octet-stream
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ w: img.naturalWidth, h: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image load error"));
    };
    img.src = url;
  });

const digitsOnly = (v: string) => (v || "").replace(/[^\d]/g, "").trim();

const getEanVariants = (input: string) => {
  const raw = digitsOnly(input);
  const out: string[] = [];
  if (/^\d{12}$/.test(raw)) { out.push(raw, "0" + raw); }
  else if (/^\d{13}$/.test(raw)) { out.push(raw); if (raw.startsWith("0")) out.push(raw.slice(1)); }
  // Fallback for others (e.g. 8 digits or invalid length but let API handle or fail)
  if (out.length === 0 && raw.length > 0) out.push(raw);
  return Array.from(new Set(out));
};

const quickSig = async (blob: Blob) => {
  const a = blob.slice(0, 2048); // First 2KB
  const buf = await a.arrayBuffer();
  let sum = 0;
  const u8 = new Uint8Array(buf);
  for (let i = 0; i < u8.length; i += 29) sum = (sum * 33 + u8[i]) >>> 0;
  return `${blob.size}-${sum}`;
};

export const EanGenerator: React.FC = () => {
    const { user, deductToken } = useAuth();
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
    const [isTokenStoreOpen, setIsTokenStoreOpen] = useState(false);
    const [isScannerOpen, setIsScannerOpen] = useState(false);

    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [exportPlatform, setExportPlatform] = useState<ExportPlatform | null>(null);
    const [exportStatus, setExportStatus] = useState<'idle' | 'exporting' | 'success' | 'error'>('idle');

    // CSV Modal State
    const [isCsvModalOpen, setIsCsvModalOpen] = useState<boolean>(false);

    const [ean, setEan] = useState('');
    const [manualTitle, setManualTitle] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [loadingStep, setLoadingStep] = useState<string>('');
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<any>(null);
    const [aiImages, setAiImages] = useState<{ name: string; blob: Blob; isAi?: boolean }[]>([]);
    const [sourceInfo, setSourceInfo] = useState<string>('');

    const handleSearch = async (isManual: boolean = false) => {
        if (!user) { setIsAuthModalOpen(true); return; }
        if (!ean && !manualTitle) { setError("Wpisz EAN lub nazwę produktu."); return; }
        
        setIsLoading(true);
        setError(null);
        setAiImages([]);
        setResult(null);
        
        try {
            const eanVariants = isManual ? [] : getEanVariants(ean);
            let aiData: any = null;

            if (isManual) {
                setLoadingStep(`🔎 Szukanie po nazwie...`);
                aiData = await generateContentFromEan("", manualTitle);
            } else {
                 setLoadingStep(`🔍 Identyfikacja produktu...`);
                 let lastErr: any = null;
                 // Try variants
                 for (const cand of eanVariants) {
                    try {
                        aiData = await generateContentFromEan(cand, undefined);
                        if (aiData && aiData.auction_title) {
                             setEan(cand);
                             break;
                        }
                    } catch (e) { lastErr = e; }
                 }
                 if (!aiData) {
                     throw lastErr || new Error("Nie udało się znaleźć produktu po EAN.");
                 }
            }
            
            // AGGRESSIVE SECONDARY SEARCH
            let extraUrls: string[] = [];
            const initialUrlCount = (aiData.image_urls || []).length;
            
            if (!isManual && aiData.auction_title && aiData.auction_title.length > 3 && initialUrlCount < 8) {
                setLoadingStep(`🔎 Znaleziono "${aiData.auction_title}". Doszukiwanie zdjęć...`);
                try {
                    const titleSearchData = await generateContentFromEan("", aiData.auction_title);
                    if (titleSearchData.image_urls && titleSearchData.image_urls.length > 0) {
                        extraUrls = titleSearchData.image_urls;
                    }
                } catch (e) { console.warn("Extra search failed", e); }
            }

            setResult(aiData);
            
            const allUrlsRaw = [...(aiData.image_urls || []), ...extraUrls];
            const urls = Array.from(new Set(allUrlsRaw))
                .filter((u): u is string => typeof u === 'string' && u.startsWith('http'))
                .slice(0, 45); 

            setLoadingStep(`🚀 Analiza ${urls.length} źródeł...`);

            const validCandidates: { blob: Blob, w: number, h: number, sig: string }[] = [];
            // Rejection now tracks reason: 'content' (wrong product) or 'size' (too small)
            const rejectedCandidates: { blob: Blob, w: number, h: number, sig: string, rejectionReason: 'content' | 'size' }[] = [];
            const seenSignatures = new Set<string>();
            
            // REDUCED BATCH SIZE to mitigate 429 Errors
            const BATCH_SIZE = 3; 

            const MIN_SIZE = 150; 
            const MAX_VISION_CHECKS = 8; // Increased check limit
            let visionChecks = 0;

            for (let i = 0; i < urls.length; i += BATCH_SIZE) {
                if (validCandidates.length >= 4) break;
                
                // Add explicit delay between batches to respect rate limits
                if (i > 0) await new Promise(r => setTimeout(r, 1000));

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
                             if (meta.w < 20 || meta.h < 20) return null; 
                        } catch (e) { return null; }

                        let rejectionReason: 'content' | 'size' | null = null;

                        if (meta.w < MIN_SIZE || meta.h < MIN_SIZE) {
                            rejectionReason = 'size';
                        } else if (validCandidates.length < 5 && visionChecks < MAX_VISION_CHECKS) {
                             visionChecks++;
                             const isCorrectProduct = await verifyVisualIdentity(blob, aiData.auction_title, url);
                             if (!isCorrectProduct) {
                                 console.warn("AI rejected image content", url);
                                 rejectionReason = 'content';
                             }
                        }

                        return { blob, ...meta, sig, rejectionReason };
                    } catch (e) { return null; }
                });

                const results = await Promise.all(promises);
                results.forEach(res => {
                    if (res) {
                        seenSignatures.add(res.sig);
                        if (res.rejectionReason) {
                            rejectedCandidates.push({ ...res, rejectionReason: res.rejectionReason });
                        } else {
                            validCandidates.push(res);
                        }
                    }
                });
                
                if (validCandidates.length > 0) {
                     setLoadingStep(`Znaleziono ${validCandidates.length} pasujących zdjęć...`);
                }
            }

            // FALLBACK STRATEGY: ULTIMATE DESPERATION
            if (validCandidates.length === 0 && rejectedCandidates.length > 0) {
                 console.warn("AI rejected all images. Engaging ultimate fallback.");
                 
                 // 1. Sort all rejects by size (biggest first)
                 rejectedCandidates.sort((a, b) => (b.w * b.h) - (a.w * a.h));

                 // 2. Filter out tiny icons (<50px) unless that's all we have
                 const viableRejects = rejectedCandidates.filter(c => c.w > 50 && c.h > 50);

                 if (viableRejects.length > 0) {
                     // Take the largest viable image regardless of rejection reason
                     validCandidates.push(viableRejects[0]);
                     // Add up to 3 more if available
                     validCandidates.push(...viableRejects.slice(1, 4));
                 } else {
                     // If everything is tiny, take the largest tiny one
                     validCandidates.push(rejectedCandidates[0]);
                 }
            }

            if (validCandidates.length === 0) {
                 if (urls.length === 0) {
                     throw new Error("AI nie znalazło żadnych linków do zdjęć dla tego produktu. Spróbuj wyszukać po nazwie.");
                 } else {
                     throw new Error(`Znaleziono ${urls.length} źródeł, ale nie udało się pobrać żadnego zdjęcia. Prawdopodobnie blokady regionalne lub błędy sieci.`);
                 }
            }

            // Sortowanie: Największe na początek (jeśli jeszcze nie posortowane)
            validCandidates.sort((a, b) => (b.w * b.h) - (a.w * a.h));

            // Use whatever we found, even if it's just 1 or 2 good images. 
            // Better to show 2 good ones than 2 good + 1 incorrect one.
            const goodImages = validCandidates.slice(0, 4).map(c => c.blob);
            
            setSourceInfo(`Źródło: ${validCandidates.length} obrazów`);
            setLoadingStep(`🎨 Generowanie galerii...`);

            const gallery: { name: string; blob: Blob; isAi?: boolean }[] = [];

            // 1. Główne zdjęcie
            const mainBlob = await processRealPhoto(goodImages[0], aiData.auction_title);
            gallery.push({ name: 'main_product.png', blob: mainBlob, isAi: false });

            // 2. Reszta oryginałów
            const remaining = goodImages.slice(1, 4);
            const processedRemaining = await Promise.all(remaining.map(async (blob, idx) => {
                const clean = await processRealPhoto(blob, aiData.auction_title);
                return { name: `view_${idx + 1}.png`, blob: clean, isAi: false };
            }));
            gallery.push(...processedRemaining);

            // 3. Generowanie wariantów AI - tylko jeśli mamy mało oryginałów
            if (gallery.length < 4) {
                setLoadingStep(`✨ Tworzenie nowych ujęć 3D...`);
                const needed = 4 - gallery.length;
                // Generate explicitly from the BEST image (index 0)
                for (let k = 0; k < needed; k++) {
                    try {
                        const one = await generateAdditionalImages(
                            gallery[0].blob,
                            aiData.auction_title,
                            1,
                            "",
                            gallery.length + k // Unique offset
                        );
                        if (one && one.length > 0) gallery.push(one[0]);
                    } catch (e) { console.warn("AI extra img failed", e); }
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

    const handleSelectKey = async () => {
        if ((window as any).aistudio?.openSelectKey) {
            await (window as any).aistudio.openSelectKey();
        }
    };

    const handleExport = async (credentials: any) => {
        setExportStatus('exporting');
        try {
            if (exportPlatform === 'allegro') {
                await createAllegroDraft(credentials, { ...result, images: aiImages, ean });
            } else if (exportPlatform === 'baselinker') {
                await exportToBaseLinker(credentials, { ...result, images: aiImages, ean, condition: 'new' });
            }
            setExportStatus('success');
        } catch (err) { setExportStatus('error'); }
    };

    const onBarcodeDetected = (code: string) => {
        setEan(code);
    };

    return (
        <div className="bg-slate-900 rounded-2xl shadow-2xl p-6 md:p-8 border border-slate-800">
            <div className="text-center mb-8">
                <div className="inline-flex items-center gap-2 mb-2">
                    <h2 className="text-4xl font-bold text-white tracking-tight">Generator EAN</h2>
                    <span className="bg-emerald-500/20 text-emerald-400 text-[10px] font-bold px-2 py-1 rounded border border-emerald-500/30 uppercase tracking-tighter">Fast-Check v2</span>
                </div>
                <p className="text-gray-400 italic font-medium tracking-wide text-sm">Szybkie wyszukiwanie + Weryfikacja wizualna AI</p>
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

            {result && !isLoading && aiImages.length > 0 && (
                <div className="space-y-10 animate-fade-in">
                    <div className="bg-slate-800/60 p-8 rounded-xl border border-emerald-500/20 shadow-lg text-center relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-2"> <span className="text-[9px] font-bold text-emerald-400 bg-emerald-950 px-2 py-1 rounded-full border border-emerald-800 shadow-xl tracking-tighter uppercase">{sourceInfo}</span> </div>
                        <h3 className="text-3xl font-extrabold text-white mb-2 leading-tight tracking-tight">{result.auction_title}</h3>
                        <p className="text-xs text-emerald-500/60 uppercase tracking-widest font-bold">Galeria wygenerowana automatycznie</p>
                    </div>

                    <SelectedImagesPreview images={aiImages} onImageUpdate={(n, b) => setAiImages(imgs => imgs.map(i => i.name === n ? {name: n, blob: b} : i))} onColorChange={async () => {}} />
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
                imageBlobs={aiImages}
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
