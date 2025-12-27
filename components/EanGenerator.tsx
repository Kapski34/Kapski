
import React, { useState, useEffect, useRef } from 'react';
import { generateContentFromEan, fetchImageFromUrl, addWhiteBackground, generateAdditionalImages, verifyImagesWithVision } from '../services/geminiService';
import { DescriptionOutput } from './DescriptionOutput';
import { Loader } from './Loader';
import { ModelDimensions } from '../App';
import { SelectedImagesPreview } from './SelectedImagesPreview';
import { ExportModal, ExportPlatform } from './ExportModal';
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
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);

    const processImages = async (title: string, urls: string[]) => {
        setLoadingStep('Analiza wizualna i wybór zdjęcia wzorcowego (Anchor)...');
        let rawBlobs: Blob[] = [];
        for (const url of urls.slice(0, 8)) {
            try {
                const blob = await fetchImageFromUrl(url);
                if (blob) rawBlobs.push(blob);
            } catch (e) {}
        }

        const verifiedBlobs = await verifyImagesWithVision(rawBlobs, title);
        
        if (verifiedBlobs.length === 0) {
            throw new Error("Vision Guard odrzucił wszystkie znalezione zdjęcia. Spróbuj poprawić nazwę modelu.");
        }

        // Anchor Image - zdjęcie wzorcowe
        const anchorBlob = verifiedBlobs[0];
        let finalGallery: { name: string; blob: Blob }[] = [{ name: 'main.png', blob: await addWhiteBackground(anchorBlob, title) }];

        setLoadingStep('Generowanie spójnych ujęć na bazie zdjęcia wzorcowego...');
        const variations = await generateAdditionalImages(anchorBlob, title, 3, "professional e-commerce shot", 1, "normal");
        finalGallery.push(...variations);

        setAiImages(finalGallery);
    };

    const handleSearch = async (useManual: boolean = false) => {
        if (!user) { setIsAuthModalOpen(true); return; }
        setIsLoading(true);
        setError(null);
        setAiImages([]);
        
        try {
            setLoadingStep(`Identyfikacja: ${ean}...`);
            const aiData = await generateContentFromEan(ean, useManual ? manualTitle : undefined, ignoreEan);
            
            setResult({
                auctionTitle: aiData.auction_title,
                descriptionParts: aiData.description_parts,
                sku: aiData.sku,
                colors: aiData.colors,
                dimensions: aiData.dimensions_mm,
                weight: aiData.weight_kg
            });

            await processImages(aiData.auction_title, aiData.image_urls || []);
            deductToken(1);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="bg-slate-900 rounded-2xl shadow-2xl p-6 md:p-8 border border-slate-800">
            <div className="text-center mb-8">
                <h2 className="text-4xl font-bold text-white mb-3">Generator EAN (v4.0)</h2>
                <p className="text-gray-400">System Identity-Lock™ zapewnia 100% spójności zdjęć i języka.</p>
            </div>

            <div className="max-w-xl mx-auto mb-10 space-y-4">
                <div className="flex gap-4">
                    <input type="text" value={ean} onChange={e => setEan(e.target.value)} placeholder="Wklej kod EAN..." className="flex-1 p-4 bg-slate-800 border border-gray-700 rounded-xl text-white font-mono text-lg focus:ring-2 focus:ring-orange-500 outline-none"/>
                    <button onClick={() => handleSearch(false)} disabled={isLoading} className="px-8 font-bold rounded-xl shadow-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-all">
                        {isLoading ? 'Pracuję...' : 'Pobierz'}
                    </button>
                </div>
                {error && <div className="p-4 bg-red-900/30 border border-red-500/50 rounded-xl text-red-300 text-center font-bold">⚠️ {error}</div>}
                
                {isEditingTitle && (
                    <div className="p-5 bg-slate-800 rounded-xl border border-blue-500/50 animate-fade-in space-y-4 shadow-xl">
                        <input type="text" value={manualTitle} onChange={e => setManualTitle(e.target.value)} placeholder="Dokładna nazwa modelu..." className="w-full p-3 bg-slate-900 border border-gray-700 rounded-lg text-white" />
                        <div className="flex items-center gap-3">
                             <input type="checkbox" id="ign" checked={ignoreEan} onChange={e => setIgnoreEan(e.target.checked)} className="w-5 h-5" />
                             <label htmlFor="ign" className="text-sm text-gray-300">Ignoruj bazę EAN</label>
                        </div>
                        <button onClick={() => handleSearch(true)} className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg shadow-lg">Wymuś poprawny model</button>
                    </div>
                )}
            </div>

            {isLoading && <Loader message={loadingStep} />}

            {result && !isLoading && (
                <div className="space-y-10 animate-fade-in">
                    <div className="bg-slate-800/60 p-8 rounded-xl border border-emerald-500/20 shadow-lg text-center">
                        <h3 className="text-3xl font-extrabold text-white mb-4 leading-tight">{result.auctionTitle}</h3>
                        <button onClick={() => setIsEditingTitle(true)} className="text-xs text-blue-400 hover:text-blue-300 font-bold border border-blue-900/50 px-6 py-2 rounded-full">
                            ⚠️ Błędny model? Kliknij aby poprawić
                        </button>
                    </div>

                    <div className="bg-slate-800/60 p-6 rounded-xl border border-orange-500/20 shadow-lg">
                        <h3 className="text-2xl font-bold text-white mb-6">📸 Galeria Identity-Lock™</h3>
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
