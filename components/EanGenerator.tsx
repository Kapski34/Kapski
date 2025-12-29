
import React, { useState, useEffect } from 'react';
import { generateContentFromEan, fetchImageFromUrl, processRealPhoto, generateNeuralSeed, generateAdditionalImages, verifyVisualIdentity } from '../services/geminiService';
import { DescriptionOutput } from './DescriptionOutput';
import { Loader } from './Loader';
import { SelectedImagesPreview } from './SelectedImagesPreview';
import { useAuth } from '../contexts/AuthContext';
import { AuthModal } from './AuthModal';
import { TokenStore } from './TokenStore';
import { ExportModal, ExportPlatform } from './ExportModal';
import { createAllegroDraft } from '../services/allegroService';
import { exportToBaseLinker } from '../services/exportService';

export const EanGenerator: React.FC = () => {
    const { user, deductToken } = useAuth();
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
    const [isTokenStoreOpen, setIsTokenStoreOpen] = useState(false);

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
            setLoadingStep(`Titan-Engine v71: Analiza globalna...`);
            // v71: generateContentFromEan nigdy nie rzuca błędu, zwraca co najmniej szkielet
            const aiData = await generateContentFromEan(ean, isManual ? manualTitle : undefined);
            setResult(aiData);
            
            const urls = Array.from(new Set(aiData.image_urls || []))
                .filter((u): u is string => typeof u === 'string' && u.startsWith('http'))
                .slice(0, 15);
            
            if (urls.length > 0) {
                 setLoadingStep(`Titan-Vision: Weryfikacja treści (limit 4)...`);
                 const validBlobs: Blob[] = [];
                 
                 for (const url of urls) {
                     try {
                         const blob = await fetchImageFromUrl(url);
                         const isMatch = await verifyVisualIdentity(blob, aiData.auction_title, url);
                         if (isMatch) {
                             validBlobs.push(blob);
                             if (validBlobs.length >= 4) break;
                         }
                     } catch (e) { continue; }
                 }

                 if (validBlobs.length > 0) {
                     setSourceInfo("Titan-Engine v71 Verified");
                     await processFastGallery(validBlobs, aiData);
                 } else {
                     setLoadingStep(`Weryfikacja negatywna. Synteza Neural AI...`);
                     const seedBlob = await generateNeuralSeed(aiData.auction_title, aiData.visual_description);
                     setSourceInfo("Neural Generation v71");
                     await processFastGallery([seedBlob], aiData);
                 }
            } else {
                 setLoadingStep(`Brak linków w sieci. Synteza AI 4K...`);
                 const seedBlob = await generateNeuralSeed(aiData.auction_title, aiData.visual_description);
                 setSourceInfo("AI Studio v71");
                 await processFastGallery([seedBlob], aiData);
            }

        } catch (err: any) {
            console.error(err);
            // v71: Ten błąd pojawia się tylko przy całkowitym padzie aplikacji
            setError("Błąd krytyczny. Sprawdź połączenie lub klucz API.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleSelectKey = async () => {
        if ((window as any).aistudio?.openSelectKey) {
            await (window as any).aistudio.openSelectKey();
        }
    };

    const processFastGallery = async (blobs: Blob[], aiData: any) => {
        setLoadingStep(`Finalizacja galerii Titan v71...`);
        const gallery: { name: string; blob: Blob; isAi?: boolean }[] = [];

        for (const [idx, blob] of blobs.slice(0, 4).entries()) {
            const cleaned = await processRealPhoto(blob, aiData.auction_title);
            gallery.push({ name: `v71_asset_${idx + 1}.png`, blob: cleaned, isAi: false });
        }

        if (gallery.length < 4) {
            setLoadingStep(`Generowanie rzutów 360° przez AI...`);
            const extra = await generateAdditionalImages(gallery[0].blob, aiData.auction_title, 4 - gallery.length, "", gallery.length);
            gallery.push(...extra);
        }

        setAiImages(gallery.slice(0, 4));
        deductToken(1);
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

    return (
        <div className="bg-slate-900 rounded-2xl shadow-2xl p-6 md:p-8 border border-slate-800">
            <div className="text-center mb-8">
                <div className="inline-flex items-center gap-2 mb-2">
                    <h2 className="text-4xl font-bold text-white tracking-tight">Generator EAN</h2>
                    <span className="bg-blue-500/20 text-blue-400 text-[10px] font-bold px-2 py-1 rounded border border-blue-500/30 uppercase tracking-tighter">Titan v71.0</span>
                </div>
                <p className="text-gray-400 italic font-medium tracking-wide">Bezawaryjny silnik: Titan-Grounding + Neural Fallback.</p>
                <button onClick={handleSelectKey} className="mt-4 text-[10px] text-gray-500 hover:text-blue-400 transition-colors">Klucz API dla jakości 4K</button>
            </div>

            <div className="max-w-xl mx-auto mb-10 space-y-4">
                <div className="flex gap-4">
                    <input type="text" value={ean} onChange={e => setEan(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch(false)} placeholder="Wklej kod EAN produktu..." className="flex-1 p-4 bg-slate-800 border border-gray-700 rounded-xl text-white font-mono text-lg outline-none focus:ring-2 focus:ring-blue-500 transition-all shadow-inner" />
                    <button onClick={() => handleSearch(false)} disabled={isLoading} className="px-10 font-bold rounded-xl shadow-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-all transform active:scale-95 disabled:opacity-50"> {isLoading ? '...' : 'Generuj'} </button>
                </div>
                
                {error && !isLoading && (
                    <div className="p-6 bg-slate-950 border border-red-500/40 rounded-xl animate-fade-in space-y-4 shadow-2xl">
                         <div className="flex gap-4 items-center text-red-500"> <span>⚠️</span> <p className="text-xs text-red-200 font-bold uppercase tracking-widest">Wyszukiwanie Titan v71</p> </div>
                         <div className="space-y-3">
                            <input type="text" value={manualTitle} onChange={e => setManualTitle(e.target.value)} placeholder="Wklej nazwę z wyszukiwarki..." className="w-full p-4 bg-slate-900 border border-gray-700 rounded-xl text-sm text-white focus:ring-2 focus:ring-blue-500 outline-none" />
                            <div className="flex gap-3">
                                <button onClick={() => handleSearch(true)} className="flex-1 py-4 bg-indigo-600 text-white font-bold rounded-xl uppercase text-xs hover:bg-indigo-500 transition-all shadow-lg">Analiza po nazwie</button>
                            </div>
                         </div>
                    </div>
                )}
            </div>

            {isLoading && <Loader message={loadingStep} />}

            {result && !isLoading && aiImages.length > 0 && (
                <div className="space-y-10 animate-fade-in">
                    <div className="bg-slate-800/60 p-8 rounded-xl border border-blue-500/20 shadow-lg text-center relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-2"> <span className="text-[9px] font-bold text-blue-400 bg-blue-950 px-2 py-1 rounded-full border border-blue-800 shadow-xl tracking-tighter uppercase">{sourceInfo}</span> </div>
                        <h3 className="text-3xl font-extrabold text-white mb-2 leading-tight tracking-tight">{result.auction_title}</h3>
                        <p className="text-xs text-blue-500/60 uppercase tracking-widest font-bold">Zweryfikowana Galeria v71.0</p>
                    </div>

                    <SelectedImagesPreview images={aiImages} onImageUpdate={(n, b) => setAiImages(imgs => imgs.map(i => i.name === n ? {name: n, blob: b} : i))} onColorChange={async () => {}} />
                    <DescriptionOutput auctionTitle={result.auction_title} descriptionParts={result.description_parts} sku={result.sku} ean={ean} onEanChange={setEan} colors={[]} condition="new" dimensions={null} weight={null} onDimensionsChange={()=>{}} onWeightChange={()=>{}} />

                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-8 border-t border-slate-800">
                        <button onClick={() => {setExportPlatform('baselinker'); setIsExportModalOpen(true);}} className="px-10 py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-xl transition-all transform hover:scale-105">Eksportuj do BaseLinker</button>
                        <button onClick={() => {setExportPlatform('allegro'); setIsExportModalOpen(true);}} className="px-10 py-4 bg-orange-600 hover:bg-orange-500 text-white font-bold rounded-xl shadow-xl transition-all transform hover:scale-105">Wystaw na Allegro</button>
                    </div>
                </div>
            )}

            <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
            <TokenStore isOpen={isTokenStoreOpen} onClose={() => setIsTokenStoreOpen(false)} />
            {isExportModalOpen && exportPlatform && (
                <ExportModal isOpen={isExportModalOpen} onClose={() => setIsExportModalOpen(false)} platform={exportPlatform} onExport={handleExport} status={exportStatus} error={null} />
            )}
        </div>
    );
};
