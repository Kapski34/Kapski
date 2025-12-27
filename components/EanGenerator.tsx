
import React, { useState, useEffect, useRef } from 'react';
import { generateContentFromEan, fetchImageFromUrl, addWhiteBackground, generateAdditionalImages, verifyImagesWithVision, synthesizeProductImage } from '../services/geminiService';
import { DescriptionOutput } from './DescriptionOutput';
import { Loader } from './Loader';
import { SelectedImagesPreview } from './SelectedImagesPreview';
import { useAuth } from '../contexts/AuthContext';
import { AuthModal } from './AuthModal';
import { TokenStore } from './TokenStore';

export const EanGenerator: React.FC = () => {
    const { user, userData, deductToken } = useAuth();
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
    const [isTokenStoreOpen, setIsTokenStoreOpen] = useState(false);

    const [ean, setEan] = useState('');
    const [manualTitle, setManualTitle] = useState('');
    const [ignoreEan, setIgnoreEan] = useState(false);
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    
    const [isLoading, setIsLoading] = useState(false);
    const [loadingStep, setLoadingStep] = useState<string>('');
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<any>(null);
    const [aiImages, setAiImages] = useState<{ name: string; blob: Blob }[]>([]);

    const processImages = async (title: string, urls: string[]) => {
        setLoadingStep('Pobieranie grafik producenta...');
        const cleanUrls = Array.from(new Set(urls)).filter(u => u && u.startsWith('http')).slice(0, 5);
        
        const fetchPromises = cleanUrls.map(url => fetchImageFromUrl(url).catch(() => null));
        const rawBlobs = (await Promise.all(fetchPromises)).filter((b): b is Blob => b !== null);

        let finalGallery: { name: string; blob: Blob }[] = [];

        if (rawBlobs.length === 0) {
            setLoadingStep('Brak grafik w sieci. Tworzenie fotorealistycznej galerii AI...');
            const angles = ["front perspective", "side view profile", "top view detail", "close-up detail"];
            const synthesisPromises = angles.map(angle => synthesizeProductImage(title, angle).catch(e => {
                console.error("Synthesis error", e);
                return null;
            }));
            const syntheticResults = await Promise.all(synthesisPromises);
            
            finalGallery = syntheticResults
                .filter((b): b is Blob => b !== null)
                .map((blob, i) => ({ name: `gen_ai_${i}.png`, blob }));
        } else {
            setLoadingStep('Weryfikacja wizualna i optymalizacja tła...');
            const verifiedBlobs = await verifyImagesWithVision(rawBlobs, title);
            const anchorBlob = verifiedBlobs.length > 0 ? verifiedBlobs[0] : rawBlobs[0];

            setLoadingStep('Finalizacja galerii produktów...');
            const [whiteBg, variations] = await Promise.all([
                addWhiteBackground(anchorBlob, title).catch(() => anchorBlob),
                generateAdditionalImages(anchorBlob, title, 3).catch(() => [])
            ]);

            finalGallery.push({ name: 'main_product.png', blob: whiteBg });
            finalGallery.push(...variations);
        }

        if (finalGallery.length === 0) throw new Error("Błąd podczas generowania obrazów. Spróbuj ponownie lub wpisz nazwę ręcznie.");
        setAiImages(finalGallery.slice(0, 4));
    };

    const handleSearch = async (useManual: boolean = false) => {
        if (!user) { setIsAuthModalOpen(true); return; }
        setIsLoading(true);
        setError(null);
        setAiImages([]);
        setResult(null);
        
        try {
            setLoadingStep(`Głęboka weryfikacja EAN ${ean} (Przeszukiwanie bazy)...`);
            const aiData = await generateContentFromEan(ean, useManual ? manualTitle : undefined, ignoreEan);
            
            setResult({
                auctionTitle: aiData.auction_title,
                descriptionParts: aiData.description_parts,
                sku: aiData.sku,
                colors: aiData.colors,
                dimensions: aiData.dimensions_mm,
                weight: aiData.weight_kg,
                sources: aiData.sources || []
            });

            await processImages(aiData.auction_title, aiData.image_urls || []);
            deductToken(1);
            setIsEditingTitle(false);
        } catch (err: any) {
            setError(err.message || "Wystąpił nieoczekiwany błąd. Sprawdź połączenie i spróbuj ponownie.");
            setIsEditingTitle(true);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="bg-slate-900 rounded-2xl shadow-2xl p-6 md:p-8 border border-slate-800">
            <div className="text-center mb-8">
                <div className="inline-flex items-center gap-2 mb-3">
                    <h2 className="text-4xl font-bold text-white">Generator EAN</h2>
                    <span className="bg-emerald-500/20 text-emerald-400 text-xs font-bold px-2 py-1 rounded border border-emerald-500/30 uppercase tracking-tighter">Wersja Precyzyjna v4.9</span>
                </div>
                <p className="text-gray-400 italic">Zweryfikowana baza danych EAN + Fotorealistyczne obrazy AI.</p>
            </div>

            <div className="max-w-xl mx-auto mb-10 space-y-4">
                <div className="flex gap-4">
                    <input type="text" value={ean} onChange={e => setEan(e.target.value)} placeholder="Wklej kod EAN (13 cyfr)..." className="flex-1 p-4 bg-slate-800 border border-gray-700 rounded-xl text-white font-mono text-lg outline-none focus:ring-2 focus:ring-emerald-500"/>
                    <button onClick={() => handleSearch(false)} disabled={isLoading} className="px-8 font-bold rounded-xl shadow-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-all">
                        {isLoading ? '...' : 'Pobierz dane'}
                    </button>
                </div>
                {error && <div className="p-4 bg-red-900/30 border border-red-500/50 rounded-xl text-red-300 text-center font-bold animate-pulse">⚠️ {error}</div>}
                
                {isEditingTitle && (
                    <div className="p-5 bg-slate-800 rounded-xl border border-blue-500/50 animate-fade-in space-y-4 shadow-xl">
                        <label className="text-xs font-bold text-blue-400 uppercase">Wyszukiwanie nieprecyzyjne? Wpisz nazwę ręcznie:</label>
                        <input type="text" value={manualTitle} onChange={e => setManualTitle(e.target.value)} placeholder="Np. Kamera Ring Floodlight Wired Plus..." className="w-full p-3 bg-slate-950 border border-gray-700 rounded-lg text-white font-bold" />
                        <div className="flex items-center gap-3">
                             <input type="checkbox" id="ign" checked={ignoreEan} onChange={e => setIgnoreEan(e.target.checked)} className="w-5 h-5" />
                             <label htmlFor="ign" className="text-sm text-gray-300 cursor-pointer">Szukaj tylko po nazwie (Ignoruj EAN)</label>
                        </div>
                        <button onClick={() => handleSearch(true)} className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg shadow-lg transition-all active:scale-95">Napraw identyfikację produktu</button>
                    </div>
                )}
            </div>

            {isLoading && <Loader message={loadingStep} />}

            {result && !isLoading && (
                <div className="space-y-10 animate-fade-in">
                    <div className="bg-slate-800/60 p-8 rounded-xl border border-emerald-500/20 shadow-lg text-center">
                        <h3 className="text-3xl font-extrabold text-white mb-4 leading-tight">{result.auctionTitle}</h3>
                        <div className="flex justify-center gap-3">
                            <button onClick={() => setIsEditingTitle(true)} className="text-xs text-blue-400 hover:text-blue-300 font-bold border border-blue-900/50 px-6 py-2 rounded-full hover:bg-blue-950 transition-colors">
                                To nie ten model? Popraw nazwę
                            </button>
                        </div>
                    </div>

                    <div className="bg-slate-800/60 p-6 rounded-xl border border-orange-500/20 shadow-lg">
                        <h3 className="text-2xl font-bold text-white mb-6">📸 Galeria AI (Zgodna z produktem)</h3>
                        <SelectedImagesPreview images={aiImages} onImageUpdate={() => {}} onColorChange={async () => {}} />
                    </div>
                    
                    <DescriptionOutput auctionTitle={result.auctionTitle} descriptionParts={result.descriptionParts} sku={result.sku} ean={ean} onEanChange={setEan} colors={result.colors} condition="new" dimensions={result.dimensions} weight={result.weight} onDimensionsChange={() => {}} onWeightChange={() => {}} />
                </div>
            )}
            <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
            <TokenStore isOpen={isTokenStoreOpen} onClose={() => setIsTokenStoreOpen(false)} />
        </div>
    );
};
