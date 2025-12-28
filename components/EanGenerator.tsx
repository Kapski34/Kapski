import React, { useState, useEffect, useRef } from 'react';
import { generateContentFromEan, fetchImageFromUrl, addWhiteBackground, generateVariationsFromAnchor, verifyAndFilterImages, synthesizeProductImage } from '../services/geminiService';
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

    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [exportPlatform, setExportPlatform] = useState<ExportPlatform | null>(null);
    const [exportStatus, setExportStatus] = useState<'idle' | 'exporting' | 'success' | 'error'>('idle');
    const [exportError, setExportError] = useState<string | null>(null);
    const [isPackaging, setIsPackaging] = useState(false);

    const processImages = async (title: string, urls: string[], visualGuide: string) => {
        setLoadingStep('Pobieranie oficjalnych zdjęć z sieci...');
        
        const imageFileUrls = Array.from(new Set(urls))
            .filter(u => u && u.startsWith('http'))
            .slice(0, 15);
        
        const fetchPromises = imageFileUrls.map(url => fetchImageFromUrl(url).catch(() => null));
        let rawBlobs = (await Promise.all(fetchPromises)).filter((b): b is Blob => b !== null);

        if (rawBlobs.length > 0) {
            setLoadingStep('Weryfikacja autentyczności przez Vision AI...');
            const verifiedBlobs = await verifyAndFilterImages(rawBlobs, title, visualGuide);
            
            if (verifiedBlobs.length > 0) {
                const anchorBlob = verifiedBlobs[0];
                setLoadingStep('Tworzenie profesjonalnej galerii na bazie zdjęcia...');
                
                // Zawsze generujemy 3 warianty na bazie zdjęcia kotwicy, aby zapewnić 100% zgodności detali
                const variations = await generateVariationsFromAnchor(anchorBlob, title, 3);
                const whiteAnchor = await addWhiteBackground(anchorBlob, title).catch(() => anchorBlob);
                
                setAiImages([
                    { name: `anchor_photo.png`, blob: whiteAnchor },
                    ...variations
                ]);
                return;
            }
        }

        // Jeśli mimo wysiłków nie ma zdjęć - synteza z ostrzeżeniem
        setLoadingStep('Brak zdjęć w sieci. Generowanie wizualizacji AI...');
        const b = await synthesizeProductImage(title, "front").catch(() => null);
        if (b) {
            const variations = await generateVariationsFromAnchor(b, title, 3);
            setAiImages([{ name: 'ai_fallback_main.png', blob: b }, ...variations]);
        } else {
            throw new Error("Nie znaleziono produktu ani zdjęć w sieci.");
        }
    };

    const handleSearch = async (useManual: boolean = false) => {
        if (!user) { setIsAuthModalOpen(true); return; }
        setIsLoading(true);
        setError(null);
        setAiImages([]);
        setResult(null);
        
        try {
            setLoadingStep(`Szczegółowa analiza EAN: ${ean}...`);
            const aiData = await generateContentFromEan(ean, useManual ? manualTitle : undefined, ignoreEan);
            
            setResult({
                auctionTitle: aiData.auction_title,
                descriptionParts: aiData.description_parts,
                sku: aiData.sku,
                colors: aiData.colors,
                dimensions: aiData.dimensions_mm,
                weight: aiData.weight_kg,
            });

            await processImages(aiData.auction_title, aiData.image_urls || [], aiData.visual_guide || '');
            deductToken(1);
            setIsEditingTitle(false);
        } catch (err: any) {
            setError(err.message || "Błąd identyfikacji. Spróbuj wpisać model ręcznie.");
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
            const genFolder = zip.folder("_EKSPORT_EAN");
            for (const image of aiImages) genFolder.file(image.name, image.blob, { binary: true });
            let content = `TYTUŁ: ${result.auctionTitle}\n\nEAN: ${ean}\n\nOPIS:\n${result.descriptionParts.join('\n\n')}`;
            zip.file("oferta.txt", content);
            const zipBlob = await zip.generateAsync({ type: "blob" });
            const url = URL.createObjectURL(zipBlob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `aukcja-${ean}.zip`;
            link.click();
        } catch (err) { setError("Błąd ZIP."); } finally { setIsPackaging(false); }
    };

    return (
        <div className="bg-slate-900 rounded-2xl shadow-2xl p-6 md:p-8 border border-slate-800">
            <div className="text-center mb-8">
                <div className="inline-flex items-center gap-2 mb-3">
                    <h2 className="text-4xl font-bold text-white">Generator EAN</h2>
                    <span className="bg-emerald-500/20 text-emerald-400 text-xs font-bold px-2 py-1 rounded border border-emerald-500/30 uppercase tracking-tighter">Verified v5.7</span>
                </div>
                <p className="text-gray-400 italic">Bezbłędna identyfikacja i galeria na bazie zdjęć referencyjnych.</p>
            </div>

            <div className="max-w-xl mx-auto mb-10 space-y-4">
                <div className="flex gap-4">
                    <input type="text" value={ean} onChange={e => setEan(e.target.value)} placeholder="Wklej kod EAN (np. 5706751072673)..." className="flex-1 p-4 bg-slate-800 border border-gray-700 rounded-xl text-white font-mono text-lg outline-none focus:ring-2 focus:ring-emerald-500 transition-all"/>
                    <button onClick={() => handleSearch(false)} disabled={isLoading} className="px-8 font-bold rounded-xl shadow-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-all active:scale-95 disabled:opacity-50">
                        {isLoading ? '...' : 'Szukaj'}
                    </button>
                </div>
                
                {isEditingTitle || error ? (
                    <div className="p-6 bg-slate-800 rounded-xl border border-blue-500/40 animate-fade-in space-y-4 shadow-xl">
                        <p className="text-sm text-blue-300 font-medium">Błędny produkt? Wpisz poprawną nazwę modelu:</p>
                        <input type="text" value={manualTitle} onChange={e => setManualTitle(e.target.value)} placeholder="Np. Denver KCA-1351 Niebieski..." className="w-full p-3 bg-slate-950 border border-gray-700 rounded-lg text-white font-bold placeholder-gray-600" />
                        <div className="flex items-center gap-3 bg-slate-900/50 p-2 rounded-lg">
                             <input type="checkbox" id="ign" checked={ignoreEan} onChange={e => setIgnoreEan(e.target.checked)} className="w-5 h-5 rounded border-gray-700 text-blue-600 focus:ring-blue-500" />
                             <label htmlFor="ign" className="text-sm text-gray-300 cursor-pointer">Szukaj tylko po nazwie (ignoruj EAN)</label>
                        </div>
                        <button onClick={() => handleSearch(true)} className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg shadow-lg transition-all">Ponów wyszukiwanie zdjęć</button>
                    </div>
                ) : null}
            </div>

            {isLoading && <Loader message={loadingStep} />}

            {result && !isLoading && (
                <div className="space-y-10 animate-fade-in">
                    <div className="bg-slate-800/60 p-8 rounded-xl border border-emerald-500/20 shadow-lg text-center">
                        <h3 className="text-3xl font-extrabold text-white mb-4 leading-tight">{result.auctionTitle}</h3>
                        <button onClick={() => setIsEditingTitle(true)} className="text-xs text-blue-400 hover:text-blue-300 font-bold border border-blue-900/50 px-6 py-2 rounded-full hover:bg-blue-950 transition-all">
                            Błędna nazwa? Popraw model ręcznie
                        </button>
                    </div>

                    <div className="bg-slate-800/60 p-6 rounded-xl border border-orange-500/20 shadow-lg">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-2xl font-bold text-white">📸 Galeria Autentyczności</h3>
                            <span className="text-xs font-bold text-emerald-400 bg-emerald-950 px-2 py-1 rounded border border-emerald-800">Anchor Mode Enabled</span>
                        </div>
                        <SelectedImagesPreview images={aiImages} onImageUpdate={(n, b) => setAiImages(imgs => imgs.map(i => i.name === n ? {name: n, blob: b} : i))} onColorChange={async () => {}} />
                        {aiImages.some(img => img.name.includes('anchor')) && (
                            <div className="mt-4 p-3 bg-blue-950/30 border border-blue-700/50 rounded-lg">
                                <p className="text-xs text-blue-300 italic text-center">Informacja: Wszystkie zdjęcia w galerii bazują na zweryfikowanej fotografii referencyjnej produktu.</p>
                            </div>
                        )}
                        {aiImages.some(img => img.name.includes('ai_fallback')) && (
                            <div className="mt-4 p-3 bg-red-950/30 border border-red-700/50 rounded-lg">
                                <p className="text-xs text-red-300 italic text-center">Ostrzeżenie: Nie znaleziono zdjęć w sieci. Galeria wygenerowana całkowicie przez AI.</p>
                            </div>
                        )}
                    </div>
                    
                    <DescriptionOutput auctionTitle={result.auctionTitle} descriptionParts={result.descriptionParts} sku={result.sku} ean={ean} onEanChange={setEan} colors={result.colors} condition="new" dimensions={result.dimensions} weight={result.weight} onDimensionsChange={(a, v) => setResult((prev: any) => ({ ...prev, dimensions: { ...prev.dimensions, [a]: v * 10 } }))} onWeightChange={(w) => setResult((prev: any) => ({ ...prev, weight: w }))} />

                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-8 border-t border-slate-800">
                        <button onClick={handleDownloadPackage} disabled={isPackaging} className="px-8 py-3 bg-teal-600 hover:bg-teal-500 text-white font-bold rounded-lg shadow-lg transition-all">Pobierz .zip</button>
                        <button onClick={() => {setExportPlatform('baselinker'); setIsExportModalOpen(true);}} className="px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg shadow-lg transition-all">Do BaseLinker</button>
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
