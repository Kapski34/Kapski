
import React, { useState, useEffect, useRef } from 'react';
import { generateContentFromEan, fetchImageFromUrl, addWhiteBackground, generateAdditionalImages, verifyImagesWithVision, synthesizeProductImage } from '../services/geminiService';
import { DescriptionOutput } from './DescriptionOutput';
import { Loader } from './Loader';
import { SelectedImagesPreview } from './SelectedImagesPreview';
import { useAuth } from '../contexts/AuthContext';
import { AuthModal } from './AuthModal';
import { TokenStore } from './TokenStore';
import { ExportModal, ExportPlatform } from './ExportModal';
import { exportToWooCommerce, exportToBaseLinker } from '../services/exportService';
import { createAllegroDraft, publishOffer } from '../services/allegroService';

declare const JSZip: any;

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

    // Export State
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [exportPlatform, setExportPlatform] = useState<ExportPlatform | null>(null);
    const [exportStatus, setExportStatus] = useState<'idle' | 'exporting' | 'success' | 'error'>('idle');
    const [exportError, setExportError] = useState<string | null>(null);
    const [isPackaging, setIsPackaging] = useState(false);

    const processImages = async (title: string, urls: string[]) => {
        setLoadingStep('Pobieranie grafik produktowych...');
        const imageFileUrls = Array.from(new Set(urls))
            .filter(u => {
                if (!u) return false;
                const low = u.toLowerCase();
                return low.includes('.jpg') || low.includes('.png') || low.includes('.jpeg') || low.includes('googleusercontent') || low.includes('allegroimg');
            })
            .slice(0, 10);
        
        const fetchPromises = imageFileUrls.map(url => fetchImageFromUrl(url).catch(() => null));
        let rawBlobs = (await Promise.all(fetchPromises)).filter((b): b is Blob => b !== null);

        let finalGallery: { name: string; blob: Blob }[] = [];

        if (rawBlobs.length === 0) {
            setLoadingStep('Generowanie studia AI...');
            const angles = ["front view", "angled profile", "side view", "macro details"];
            const synthesisPromises = angles.map(angle => synthesizeProductImage(title, angle).catch(() => null));
            const syntheticResults = await Promise.all(synthesisPromises);
            
            finalGallery = syntheticResults
                .filter((b): b is Blob => b !== null)
                .map((blob, i) => ({ name: `ai_shot_${i}.png`, blob }));
        } else {
            setLoadingStep('Przygotowywanie prezentacji...');
            const anchorBlob = rawBlobs[0];
            const [whiteBg, variations] = await Promise.all([
                addWhiteBackground(anchorBlob, title).catch(() => anchorBlob),
                generateAdditionalImages(anchorBlob, title, 3).catch(() => [])
            ]);

            finalGallery.push({ name: 'main_focus.png', blob: whiteBg });
            finalGallery.push(...variations);
            
            if (finalGallery.length < 4) {
                rawBlobs.forEach((b, i) => {
                    if (finalGallery.length < 4 && !finalGallery.some(f => f.blob === b)) {
                        finalGallery.push({ name: `view_${i}.png`, blob: b });
                    }
                });
            }
        }

        if (finalGallery.length === 0) throw new Error("Błąd tworzenia galerii.");
        setAiImages(finalGallery.slice(0, 4));
    };

    const handleSearch = async (useManual: boolean = false) => {
        if (!user) { setIsAuthModalOpen(true); return; }
        setIsLoading(true);
        setError(null);
        setAiImages([]);
        setResult(null);
        
        try {
            setLoadingStep(`Analiza produktu ${ean}...`);
            const aiData = await generateContentFromEan(ean, useManual ? manualTitle : undefined, ignoreEan);
            
            setResult({
                auctionTitle: aiData.auction_title,
                descriptionParts: aiData.description_parts,
                sku: aiData.sku,
                colors: aiData.colors,
                dimensions: aiData.dimensions_mm,
                weight: aiData.weight_kg,
            });

            await processImages(aiData.auction_title, aiData.image_urls || []);
            deductToken(1);
            setIsEditingTitle(false);
        } catch (err: any) {
            setError(err.message || "Produkt nieodnaleziony.");
            setIsEditingTitle(true);
        } finally {
            setIsLoading(false);
        }
    };

    const handleExport = async (credentials: any) => {
        setExportStatus('exporting');
        setExportError(null);
        try {
            if (exportPlatform === 'allegro') {
                const allegroData = {
                    title: result.auctionTitle,
                    descriptionParts: result.descriptionParts,
                    images: aiImages,
                    price: credentials.price,
                    stock: credentials.stock,
                    categoryId: credentials.categoryId,
                    shippingRateId: credentials.shippingRateId,
                    sku: result.sku,
                    ean: ean
                };
                const offerResponse = await createAllegroDraft(credentials, allegroData);
                if (credentials.publishImmediately && offerResponse.id) {
                    await publishOffer(credentials.token, offerResponse.id, credentials.isSandbox);
                }
            } else {
                const productData = {
                    title: result.auctionTitle,
                    description: result.descriptionParts.map((p: string) => `<p>${p}</p>`).join(''),
                    descriptionParts: result.descriptionParts,
                    images: aiImages,
                    sku: result.sku,
                    ean: ean,
                    dimensions: result.dimensions,
                    weight: result.weight
                };
                if (exportPlatform === 'baselinker') {
                    await exportToBaseLinker(credentials, productData as any);
                } else if (exportPlatform === 'woocommerce') {
                    await exportToWooCommerce(credentials, productData as any);
                }
            }
            setExportStatus('success');
        } catch (err) {
            setExportStatus('error');
            setExportError(err instanceof Error ? err.message : 'Błąd eksportu.');
        }
    };

    const handleDownloadPackage = async () => {
        if (!aiImages || !result.auctionTitle) return;
        setIsPackaging(true);
        try {
            const zip = new JSZip();
            const genFolder = zip.folder("_WYGENEROWANE");
            for (const image of aiImages) genFolder.file(image.name, image.blob, { binary: true });
            let content = `TYTUŁ: ${result.auctionTitle}\n\nOPIS:\n${result.descriptionParts.join('\n\n')}`;
            zip.file("opis.txt", content);
            const zipBlob = await zip.generateAsync({ type: "blob" });
            const url = URL.createObjectURL(zipBlob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `aukcja-ean-${ean}.zip`;
            link.click();
        } catch (err) { setError("Błąd ZIP."); } finally { setIsPackaging(false); }
    };

    return (
        <div className="bg-slate-900 rounded-2xl shadow-2xl p-6 md:p-8 border border-slate-800">
            <div className="text-center mb-8">
                <div className="inline-flex items-center gap-2 mb-3">
                    <h2 className="text-4xl font-bold text-white">Generator EAN</h2>
                    <span className="bg-emerald-500/20 text-emerald-400 text-xs font-bold px-2 py-1 rounded border border-emerald-500/30 uppercase tracking-tighter">Reliable v5.2</span>
                </div>
                <p className="text-gray-400 italic">Inteligentne pobieranie zdjęć + Eksport jednym kliknięciem.</p>
            </div>

            <div className="max-w-xl mx-auto mb-10 space-y-4">
                <div className="flex gap-4">
                    <input type="text" value={ean} onChange={e => setEan(e.target.value)} placeholder="Wklej EAN..." className="flex-1 p-4 bg-slate-800 border border-gray-700 rounded-xl text-white font-mono text-lg outline-none focus:ring-2 focus:ring-emerald-500"/>
                    <button onClick={() => handleSearch(false)} disabled={isLoading} className="px-8 font-bold rounded-xl shadow-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-all active:scale-95">
                        {isLoading ? '...' : 'Szukaj'}
                    </button>
                </div>
                {error && <div className="p-4 bg-red-900/30 border border-red-500/50 rounded-xl text-red-300 text-center font-bold">⚠️ {error}</div>}
                
                {isEditingTitle && (
                    <div className="p-5 bg-slate-800 rounded-xl border border-blue-500/50 animate-fade-in space-y-4 shadow-xl">
                        <label className="text-xs font-bold text-blue-400 uppercase">Wpisz nazwę ręcznie, aby znaleźć produkt:</label>
                        <input type="text" value={manualTitle} onChange={e => setManualTitle(e.target.value)} placeholder="Np. Chuwi HeroBook Plus 15.6..." className="w-full p-3 bg-slate-950 border border-gray-700 rounded-lg text-white font-bold" />
                        <div className="flex items-center gap-3">
                             <input type="checkbox" id="ign" checked={ignoreEan} onChange={e => setIgnoreEan(e.target.checked)} className="w-5 h-5" />
                             <label htmlFor="ign" className="text-sm text-gray-300 cursor-pointer">Ignoruj EAN</label>
                        </div>
                        <button onClick={() => handleSearch(true)} className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg shadow-lg">Wymuś identyfikację</button>
                    </div>
                )}
            </div>

            {isLoading && <Loader message={loadingStep} />}

            {result && !isLoading && (
                <div className="space-y-10 animate-fade-in">
                    <div className="bg-slate-800/60 p-8 rounded-xl border border-emerald-500/20 shadow-lg text-center">
                        <h3 className="text-3xl font-extrabold text-white mb-4 leading-tight">{result.auctionTitle}</h3>
                        <button onClick={() => setIsEditingTitle(true)} className="text-xs text-blue-400 hover:text-blue-300 font-bold border border-blue-900/50 px-6 py-2 rounded-full hover:bg-blue-950">
                            To nie ten produkt? Popraw nazwę
                        </button>
                    </div>

                    <div className="bg-slate-800/60 p-6 rounded-xl border border-orange-500/20 shadow-lg">
                        <h3 className="text-2xl font-bold text-white mb-6">📸 Galeria Produktu</h3>
                        <SelectedImagesPreview images={aiImages} onImageUpdate={(n, b) => setAiImages(imgs => imgs.map(i => i.name === n ? {name: n, blob: b} : i))} onColorChange={async () => {}} />
                    </div>
                    
                    <DescriptionOutput auctionTitle={result.auctionTitle} descriptionParts={result.descriptionParts} sku={result.sku} ean={ean} onEanChange={setEan} colors={result.colors} condition="new" dimensions={result.dimensions} weight={result.weight} onDimensionsChange={(a, v) => setResult((prev: any) => ({ ...prev, dimensions: { ...prev.dimensions, [a]: v * 10 } }))} onWeightChange={(w) => setResult((prev: any) => ({ ...prev, weight: w }))} />

                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-8 border-t border-slate-800">
                        <button onClick={handleDownloadPackage} disabled={isPackaging} className="px-8 py-3 bg-teal-600 hover:bg-teal-500 text-white font-bold rounded-lg shadow-lg transition-all">Pobierz pakiet .zip</button>
                        <button onClick={() => {setExportPlatform('baselinker'); setIsExportModalOpen(true);}} className="px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg shadow-lg transition-all">Eksportuj do BaseLinker</button>
                        <button onClick={() => {setExportPlatform('allegro'); setIsExportModalOpen(true);}} className="px-8 py-3 bg-orange-600 hover:bg-orange-500 text-white font-bold rounded-lg shadow-lg transition-all">Wystaw na Allegro</button>
                    </div>
                </div>
            )}

            {isExportModalOpen && exportPlatform && (
                <ExportModal 
                    isOpen={isExportModalOpen} 
                    onClose={() => setIsExportModalOpen(false)} 
                    platform={exportPlatform} 
                    onExport={handleExport} 
                    status={exportStatus} 
                    error={exportError} 
                />
            )}
            <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
            <TokenStore isOpen={isTokenStoreOpen} onClose={() => setIsTokenStoreOpen(false)} />
        </div>
    );
};
