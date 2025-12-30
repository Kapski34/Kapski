
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

// Helper do metadanych obrazu (Quality Gate)
const getImageMeta = (blob: Blob) =>
  new Promise<{ w: number; h: number }>((resolve, reject) => {
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

export const EanGenerator: React.FC = () => {
    const { user, deductToken } = useAuth();
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
    const [isTokenStoreOpen, setIsTokenStoreOpen] = useState(false);
    const [isScannerOpen, setIsScannerOpen] = useState(false);

    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [exportPlatform, setExportPlatform] = useState<ExportPlatform | null>(null);
    const [exportStatus, setExportStatus] = useState<'idle' | 'exporting' | 'success' | 'error'>('idle');

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
            // ETAP 1: Wyszukiwanie EAN
            setLoadingStep(`🔍 Identyfikacja produktu...`);
            let aiData = await generateContentFromEan(ean, isManual ? manualTitle : undefined);
            
            // ETAP 2: Search Chaining (Jeśli mamy tytuł, szukamy też po tytule)
            let extraUrls: string[] = [];
            if (!isManual && aiData.auction_title && aiData.auction_title.length > 3) {
                setLoadingStep(`🔎 Szukanie zdjęć dla "${aiData.auction_title}"...`);
                try {
                    // Jeśli EAN nie dał zdjęć, szukaj po nazwie
                    const titleSearchData = await generateContentFromEan("", aiData.auction_title);
                    if (titleSearchData.image_urls) extraUrls = titleSearchData.image_urls;
                } catch (e) { }
            }

            setResult(aiData);
            
            const allUrlsRaw = [...(aiData.image_urls || []), ...extraUrls];
            const urls = Array.from(new Set(allUrlsRaw))
                .filter((u): u is string => typeof u === 'string' && u.startsWith('http'))
                .slice(0, 25); // Limitujemy do 25 URLi

            setLoadingStep(`🚀 Pobieranie zdjęć (${urls.length} źródeł)...`);

            // WYŚCIG: Pobieramy równolegle
            const goodImages: Blob[] = [];
            const BATCH_SIZE = 5;

            // Przetwarzamy w małych paczkach
            for (let i = 0; i < urls.length; i += BATCH_SIZE) {
                if (goodImages.length >= 4) break; 

                const batch = urls.slice(i, i + BATCH_SIZE);
                const promises = batch.map(async (url) => {
                    try {
                        const blob = await fetchImageFromUrl(url);
                        if (!blob || blob.size < 1000) return null; // Akceptujemy od 1KB

                        const { w, h } = await getImageMeta(blob);
                        // RELAXED QUALITY GATE: Min 200px (wcześniej 400px)
                        if (w < 200 || h < 200) return null; 
                        
                        const ratio = w / h;
                        // RELAXED RATIO: 0.3 - 3.0 (wcześniej 0.4 - 2.5)
                        if (ratio > 3.0 || ratio < 0.3) return null;

                        return blob;
                    } catch (e) { return null; }
                });

                const batchResults = await Promise.all(promises);
                const validBlobs = batchResults.filter((b): b is Blob => b !== null);
                
                // Deduplikacja
                for (const blob of validBlobs) {
                    if (!goodImages.some(existing => Math.abs(existing.size - blob.size) < 100)) {
                        goodImages.push(blob);
                    }
                }
            }

            if (goodImages.length === 0) {
                 throw new Error("Nie znaleziono wiarygodnych zdjęć produktu. Spróbuj wyszukać po nazwie lub wgraj zdjęcie ręcznie.");
            }

            // Mamy realne zdjęcia.
            setSourceInfo(`Znaleziono: ${goodImages.length} oryginałów`);
            setLoadingStep(`🎨 Retusz zdjęć...`);

            const gallery: { name: string; blob: Blob; isAi?: boolean }[] = [];

            // 1. Główne zdjęcie (pierwsze znalezione) - usuwamy tło
            const mainBlob = await processRealPhoto(goodImages[0], aiData.auction_title);
            gallery.push({ name: 'main_product.png', blob: mainBlob, isAi: false });

            // 2. Reszta znalezionych zdjęć (do 3 sztuk)
            const remaining = goodImages.slice(1, 4);
            const processedRemaining = await Promise.all(remaining.map(async (blob, idx) => {
                const clean = await processRealPhoto(blob, aiData.auction_title);
                return { name: `view_${idx + 1}.png`, blob: clean, isAi: false };
            }));
            gallery.push(...processedRemaining);

            // 3. Jeśli brakuje do 4, klonujemy lub dorabiamy AI (tylko Image-to-Image)
            if (gallery.length < 4) {
                setLoadingStep(`✨ Generowanie wariantów (brakujące ${4 - gallery.length})...`);
                try {
                    const extra = await generateAdditionalImages(
                        gallery[0].blob, 
                        aiData.auction_title, 
                        4 - gallery.length, 
                        "", 
                        gallery.length
                    );
                    gallery.push(...extra);
                } catch (e) { console.warn("AI variants failed", e); }
                
                // Ostateczny fallback: powielenie oryginałów jeśli AI zawiedzie
                while (gallery.length < 4 && goodImages.length > 0) {
                    const source = goodImages[gallery.length % goodImages.length];
                    gallery.push({ 
                        name: `fallback_${gallery.length + 1}.png`, 
                        blob: source,
                        isAi: false 
                    });
                }
            }

            setAiImages(gallery.slice(0, 4));
            deductToken(1);

        } catch (err: any) {
            console.error(err);
            setError(err.message || "Nie znaleziono produktu.");
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
                <p className="text-gray-400 italic font-medium tracking-wide text-sm">Szybkie wyszukiwanie + Retusz AI (Bez halucynacji)</p>
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
                        <button onClick={() => {setExportPlatform('baselinker'); setIsExportModalOpen(true);}} className="px-10 py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-xl transition-all transform hover:scale-105">Eksportuj do BaseLinker</button>
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
            {isExportModalOpen && exportPlatform && (
                <ExportModal isOpen={isExportModalOpen} onClose={() => setIsExportModalOpen(false)} platform={exportPlatform} onExport={handleExport} status={exportStatus} error={null} />
            )}
        </div>
    );
};
