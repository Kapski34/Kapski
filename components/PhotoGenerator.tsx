
import React, { useState } from 'react';
import { FileUpload } from './FileUpload';
import { ImagePreview } from './ImagePreview';
import { DescriptionOutput } from './DescriptionOutput';
import { Loader } from './Loader';
import { generateAllegroDescription, addWhiteBackground, analyzePricing, generateAdditionalImages } from '../services/geminiService';
import { SelectedImagesPreview } from './SelectedImagesPreview';
import { ExportModal, ExportPlatform } from './ExportModal';
import { exportToWooCommerce, exportToBaseLinker } from '../services/exportService';
import { CostAnalysis, CostAnalysisResult } from './CostAnalysis';
import { BackgroundIntensity, PersonalityType, ModelDimensions } from '../App';
import { createAllegroDraft, publishOffer } from '../services/allegroService';
import { CsvExportModal } from './CsvExportModal'; // IMPORT CSV MODAL

// AUTH IMPORTS
import { useAuth } from '../contexts/AuthContext';
import { AuthModal } from './AuthModal';
import { TokenStore } from './TokenStore';

declare const JSZip: any;

interface SavedStyle {
    id: string;
    name: string;
    links: string;
}

const normalizeEan = (v: string) => (v || '').replace(/[^\d]/g, '').trim();

export const PhotoGenerator: React.FC = () => {
  // AUTH STATE
  const { user, userData, deductToken } = useAuth();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isTokenStoreOpen, setIsTokenStoreOpen] = useState(false);

  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [additionalInfo, setAdditionalInfo] = useState<string>('');
  const [imageStylePrompt, setImageStylePrompt] = useState<string>('');
  const [backgroundIntensity, setBackgroundIntensity] = useState<BackgroundIntensity>('normal');
  const [auctionTitle, setAuctionTitle] = useState<string>('');
  const [descriptionParts, setDescriptionParts] = useState<string[]>([]);
  const [sku, setSku] = useState<string>('');
  const [ean, setEan] = useState<string>('');
  const [colors, setColors] = useState<string[]>([]);
  const [productCondition, setProductCondition] = useState<'new' | 'used' | 'refurbished'>('new');
  const [dimensions, setDimensions] = useState<ModelDimensions | null>(null);
  const [weight, setWeight] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedImages, setSelectedImages] = useState<{ name: string; blob: Blob }[]>([]);
  const [loadingMessage, setLoadingMessage] = useState<string>('Przygotowywanie...');
  const [isPackaging, setIsPackaging] = useState<boolean>(false);
  
  const [personality, setPersonality] = useState<PersonalityType>('professional');
  const [referenceLinks, setReferenceLinks] = useState<string>('');
  const [savedStyles, setSavedStyles] = useState<SavedStyle[]>([]);
  const [newStyleName, setNewStyleName] = useState<string>('');

  const [baseImageForAi, setBaseImageForAi] = useState<Blob | null>(null);

  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);
  const [exportPlatform, setExportPlatform] = useState<ExportPlatform | null>(null);
  const [exportStatus, setExportStatus] = useState<'idle' | 'exporting' | 'success' | 'error'>('idle');
  const [exportError, setExportError] = useState<string | null>(null);
  
  // CSV Modal State
  const [isCsvModalOpen, setIsCsvModalOpen] = useState<boolean>(false);

  const [costAnalysisStatus, setCostAnalysisStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [costAnalysisResult, setCostAnalysisResult] = useState<CostAnalysisResult | null>(null);
  const [costAnalysisError, setCostAnalysisError] = useState<string | null>(null);

  React.useEffect(() => {
    try {
        const styles = localStorage.getItem('userStyles');
        if (styles) {
            setSavedStyles(JSON.parse(styles));
        }
    } catch (e) { console.error("Could not load styles", e); }
  }, []);

  const saveStyle = () => {
    if (!newStyleName.trim() || !referenceLinks.trim()) return;
    const newStyle: SavedStyle = {
        id: `custom_${Date.now()}`,
        name: newStyleName.trim(),
        links: referenceLinks
    };
    const updatedStyles = [...savedStyles, newStyle];
    setSavedStyles(updatedStyles);
    localStorage.setItem('userStyles', JSON.stringify(updatedStyles));
    setPersonality(newStyle.id);
    setNewStyleName('');
  };

  const deleteStyle = (styleId: string) => {
    const updatedStyles = savedStyles.filter(s => s.id !== styleId);
    setSavedStyles(updatedStyles);
    localStorage.setItem('userStyles', JSON.stringify(updatedStyles));
    setPersonality('professional');
    setReferenceLinks('');
  };

  const handlePersonalityChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const val = e.target.value;
      setPersonality(val);
      
      const saved = savedStyles.find(s => s.id === val);
      if (saved) {
          setReferenceLinks(saved.links);
      } else if (val === 'custom') {
      } else {
          setReferenceLinks('');
      }
  };

  const handleGenerate = async () => {
    // 1. Check Login
    if (!user) {
        setIsAuthModalOpen(true);
        return;
    }
    // 2. Check Tokens
    if (!userData || userData.tokens < 1) {
        setIsTokenStoreOpen(true);
        return;
    }

    if (imageFiles.length === 0) {
      setError('Proszę wgrać przynajmniej jedno zdjęcie.');
      return;
    }

    setIsLoading(true);
    setAuctionTitle('');
    setDescriptionParts([]);
    setSku('');
    setEan('');
    setColors([]);
    setDimensions(null);
    setWeight(null);
    setSelectedImages([]);
    setBaseImageForAi(null);
    setError(null);
    setCostAnalysisStatus('idle');
    setCostAnalysisResult(null);
    setExportStatus('idle');
    setExportError(null);
    
    try {
      setLoadingMessage('Analizowanie zdjęć i generowanie opisu...');
      
      const baseBlobs = imageFiles; // Files are Blobs, no need to wrap
      setBaseImageForAi(baseBlobs[0]);

      const { auctionTitle: title, descriptionParts: parts, sku: gSku, ean: gEan, colors: gCols } = await generateAllegroDescription(
          imageFiles, 
          null, 
          additionalInfo,
          personality,
          referenceLinks
      );
      
      setAuctionTitle(title);
      setDescriptionParts(parts);
      setSku(gSku);
      setEan(normalizeEan(gEan || ''));
      setColors(gCols);
      
      setLoadingMessage('Stylizacja zdjęć przez AI...');
      let finalGallery: { name: string; blob: Blob }[] = [];

      if (baseBlobs.length > 0) {
          const mainImageBlob = baseBlobs[0];
          const whiteBgPromise = addWhiteBackground(mainImageBlob, title).catch(() => mainImageBlob);
          
          // Initial AI Generation attempt (parallel)
          const aiGensPromise = generateAdditionalImages(mainImageBlob, title, 3, imageStylePrompt, 0, backgroundIntensity)
            .catch((e: any) => {
                console.error("generateAdditionalImages failed:", e);
                return [];
            });

          const [whiteBg, aiGens] = await Promise.all([whiteBgPromise, aiGensPromise]);

          if (whiteBg) finalGallery.push({ name: 'main_product.png', blob: whiteBg as Blob });
          finalGallery.push(...(aiGens || []));
          
          // Fallback: fill gallery with original images if AI didn't produce enough
          if (finalGallery.length < 4) {
             baseBlobs.forEach((blob, idx) => {
                 if (finalGallery.length < 4 && idx > 0) {
                     finalGallery.push({ name: `original_${idx}.png`, blob: blob });
                 }
             });
          }

          // IMPROVED FALLBACK: Try to generate images one by one if still missing
          if (finalGallery.length < 4) {
              const needed = 4 - finalGallery.length;
              for (let k = 0; k < needed; k++) {
                  try {
                      // Generate 1 image with specific offset
                      const results = await generateAdditionalImages(
                          baseBlobs[0], 
                          title, 
                          1, 
                          imageStylePrompt, 
                          k, // offset 0, 1, 2... for different angles
                          backgroundIntensity
                      );
                      if (results.length > 0) {
                          finalGallery.push(results[0]);
                      }
                  } catch (e) {
                      console.warn("AI gen failed for index", k, e);
                  }
              }
          }
      }
      setSelectedImages(finalGallery.slice(0, 4));

      // 3. Deduct Token
      deductToken(1);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Wystąpił błąd.');
    } finally { setIsLoading(false); }
  };

  const handleRegenerateImage = async (index: number) => {
      // Auth Check for Regeneration
      if (!user) return setIsAuthModalOpen(true);
      if (!userData || userData.tokens < 1) return setIsTokenStoreOpen(true);

      if (!baseImageForAi || !auctionTitle) return;
      try {
          let newImage: { name: string; blob: Blob } | null = null;
          if (index === 0) {
              const newBlob = await addWhiteBackground(baseImageForAi, auctionTitle);
              newImage = { name: 'main_product_refreshed.png', blob: newBlob };
          } else {
              const results = await generateAdditionalImages(baseImageForAi, auctionTitle, 1, imageStylePrompt, index, backgroundIntensity);
              if (results.length > 0) newImage = results[0];
          }
          if (newImage) {
              setSelectedImages(prev => {
                  const updated = [...prev];
                  updated[index] = newImage!;
                  return updated;
              });
              deductToken(1);
          }
      } catch (err) { console.error("Błąd regeneracji:", err); }
  };

  const handleExport = async (credentials: any) => {
    setExportStatus('exporting');
    setExportError(null);
    const eanNorm = normalizeEan(ean);
    try {
      if (exportPlatform === 'allegro') {
             const allegroData = {
                  title: auctionTitle,
                  descriptionParts: descriptionParts,
                  images: selectedImages,
                  price: credentials.price,
                  stock: credentials.stock,
                  categoryId: credentials.categoryId,
                  shippingRateId: credentials.shippingRateId,
                  sku: sku,
                  ean: eanNorm
              };
              const offerResponse = await createAllegroDraft(credentials, allegroData);
              
              if (credentials.publishImmediately && offerResponse.id) {
                   await publishOffer(credentials.token, offerResponse.id, credentials.isSandbox);
              }
      } else {
          const productData = {
            title: auctionTitle,
            description: descriptionParts.map(p => `<p>${p}</p>`).join(''),
            descriptionParts: descriptionParts,
            images: selectedImages,
            sku: sku,
            ean: eanNorm,
            condition: productCondition,
            dimensions: dimensions,
            weight: weight
          };
          if (exportPlatform === 'baselinker') {
            await exportToBaseLinker(credentials, productData);
          } else if (exportPlatform === 'woocommerce') {
            await exportToWooCommerce(credentials, productData);
          }
      }
      setExportStatus('success');
    } catch (err) {
      setExportStatus('error');
      setExportError(err instanceof Error ? err.message : 'Nieznany błąd podczas eksportu.');
    }
  };

  const handleAnalyzeCost = async () => {
    if (!selectedImages[0] || !auctionTitle) return;
    setCostAnalysisStatus('loading');
    try {
      const result = await analyzePricing(selectedImages[0].blob, auctionTitle);
      setCostAnalysisResult(result);
      setCostAnalysisStatus('success');
    } catch (err) { setCostAnalysisStatus('error'); }
  };
  
  const handleDownloadPackage = async () => {
    if (!selectedImages || !auctionTitle) return;
    setIsPackaging(true);
    try {
        const zip = new JSZip();
        const genFolder = zip.folder("_WYGENEROWANE");
        for (const image of selectedImages) genFolder.file(image.name, image.blob, { binary: true });
        let content = `TYTUŁ: ${auctionTitle}\n\nOPIS:\n${descriptionParts.join('\n\n')}`;
        zip.file("opis.txt", content);
        const zipBlob = await zip.generateAsync({ type: "blob" });
        const url = URL.createObjectURL(zipBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `aukcja-foto.zip`;
        link.click();
    } catch (err) { setError("Błąd ZIP."); } finally { setIsPackaging(false); }
  };

  return (
    <div className="bg-slate-900 rounded-2xl shadow-2xl p-6 sm:p-8 border border-slate-800 animate-fade-in">
        <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 mb-2">
                <h2 className="text-3xl font-bold text-white">Generator ze Zdjęcia</h2>
                <span className="bg-indigo-500/20 text-indigo-400 text-[10px] font-bold px-2 py-1 rounded border border-indigo-500/30 uppercase tracking-tighter">Wersja Alfa</span>
            </div>
            <p className="text-gray-400">Wgraj zdjęcia produktu, aby wygenerować profesjonalną aukcję (bez modelu 3D).</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="flex flex-col gap-6">
                <FileUpload id="photo-upload" label="Wgraj zdjęcia produktu" accept="image/*" onChange={e => setImageFiles(Array.from(e.target.files || []))} fileName={imageFiles.length > 0 ? `${imageFiles.length} plików` : undefined} icon={<svg className="h-8 w-8 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>} multiple />
            
                <div className="space-y-4 bg-slate-800/40 p-4 rounded-xl border border-gray-700">
                    <div>
                        <label className="block text-sm font-semibold text-cyan-400 mb-2">Styl komunikacji</label>
                        <select
                            value={personality}
                            onChange={handlePersonalityChange}
                            className="w-full p-3 bg-slate-900 border border-gray-700 rounded-lg text-sm text-gray-200 focus:ring-2 focus:ring-cyan-500"
                        >
                            <option value="professional">Profesjonalny / Ekspercki (Standard)</option>
                            <option value="energetic">Energetyczny / Marketingowy (Hype)</option>
                            <option value="luxury">Ekskluzywny / Minimalistyczny</option>
                            <option value="technical">Czysto Techniczny / Precyzyjny</option>
                            <option value="storyteller">Opowiadacz Historii (Storytelling)</option>
                            
                            {savedStyles.length > 0 && (
                                <optgroup label="--- Moje Style ---">
                                    {savedStyles.map(style => (
                                        <option key={style.id} value={style.id}>⭐ {style.name}</option>
                                    ))}
                                </optgroup>
                            )}
                            <optgroup label="--- Opcje ---">
                                    <option value="custom">✨ Dodaj nowy styl (Trenuj AI)</option>
                            </optgroup>
                        </select>
                    </div>

                    {(personality === 'custom' || savedStyles.some(s => s.id === personality)) && (
                        <div className="animate-fade-in space-y-3">
                             {personality === 'custom' && (
                                <div>
                                    <label className="block text-xs font-semibold text-gray-400 mb-1">Nazwa Twojego Stylu</label>
                                    <input 
                                        type="text" 
                                        value={newStyleName}
                                        onChange={e => setNewStyleName(e.target.value)}
                                        placeholder="np. Mój Sklep Vintage"
                                        className="w-full p-2 bg-slate-900 border border-gray-600 rounded-md text-sm text-white"
                                    />
                                </div>
                             )}

                             <label className="block text-sm font-semibold text-purple-400">
                                {personality === 'custom' ? 'Wklej linki do aukcji (trening)' : 'Linki referencyjne (zapisane)'}
                            </label>
                             <textarea 
                                value={referenceLinks} 
                                onChange={e => setReferenceLinks(e.target.value)} 
                                placeholder="https://allegro.pl/oferta/..." 
                                className="w-full h-24 p-3 bg-purple-900/20 border border-purple-500/50 rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:ring-2 focus:ring-purple-500 focus:outline-none" 
                             />
                             
                             <div className="flex justify-end pt-1">
                                {personality === 'custom' ? (
                                    <button 
                                        onClick={saveStyle}
                                        disabled={!newStyleName || !referenceLinks}
                                        className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold rounded shadow-lg transition-all"
                                    >
                                        Zapisz ten styl
                                    </button>
                                ) : (
                                     <button 
                                        onClick={() => deleteStyle(personality)}
                                        className="px-4 py-2 bg-red-900/50 hover:bg-red-800 text-red-200 text-xs font-bold rounded border border-red-800 transition-all"
                                    >
                                        Usuń ten styl
                                    </button>
                                )}
                             </div>
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-semibold text-cyan-400 mb-2">Opis produktu (opcjonalnie)</label>
                        <textarea value={additionalInfo} onChange={e => setAdditionalInfo(e.target.value)} placeholder="Np. Przeznaczenie, pasujące modele..." className="w-full h-16 p-3 bg-slate-900 border border-gray-700 rounded-lg text-sm" />
                    </div>
                    
                    <div>
                        <label className="block text-sm font-semibold text-cyan-400 mb-2">Stylistyka Zdjęć AI</label>
                        <div className="flex bg-slate-900 p-1 rounded-lg border border-gray-700 mb-2">
                            <button 
                            onClick={() => setBackgroundIntensity('calm')} 
                            className={`flex-1 py-2 text-xs font-bold rounded-md transition-all ${backgroundIntensity === 'calm' ? 'bg-cyan-600 text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}
                            >
                            Spokojne
                            </button>
                            <button 
                            onClick={() => setBackgroundIntensity('normal')} 
                            className={`flex-1 py-2 text-xs font-bold rounded-md transition-all ${backgroundIntensity === 'normal' ? 'bg-cyan-600 text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}
                            >
                            Normalne
                            </button>
                            <button 
                            onClick={() => setBackgroundIntensity('crazy')} 
                            className={`flex-1 py-2 text-xs font-bold rounded-md transition-all ${backgroundIntensity === 'crazy' ? 'bg-cyan-600 text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}
                            >
                            Szalone
                            </button>
                        </div>
                        <input type="text" value={imageStylePrompt} onChange={e => setImageStylePrompt(e.target.value)} placeholder="Własny prompt tła (np. 'Dżungla')..." className="w-full p-3 bg-slate-900 border border-gray-700 rounded-lg text-sm" />
                    </div>
                </div>

                <button onClick={handleGenerate} disabled={isLoading} className="w-full py-4 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-lg shadow-lg shadow-cyan-500/20 transform transition-all hover:scale-105">
                    {isLoading ? 'Pracuję...' : 'Generuj Szybką Ofertę'}
                </button>
                
                {error && <p className="text-red-400 text-center font-medium">{error}</p>}
            </div>
            <ImagePreview imageFile={imageFiles[0] || null} />
        </div>

        {isLoading && <Loader message={loadingMessage} />}

        {selectedImages.length > 0 && !isLoading && (
            <div className="mt-10 pt-8 border-t border-cyan-500/20 space-y-10">
                <DescriptionOutput auctionTitle={auctionTitle} descriptionParts={descriptionParts} sku={sku} ean={ean} onEanChange={setEan} colors={colors} condition={productCondition} dimensions={dimensions} onDimensionsChange={(a, v) => setDimensions(d => ({ ...(d || {x:0, y:0, z:0}), [a]: v * 10 }))} weight={weight} onWeightChange={setWeight} />
                <SelectedImagesPreview 
                    images={selectedImages} 
                    onImageUpdate={(n, b) => setSelectedImages(imgs => imgs.map(i => i.name === n ? {name: n, blob: b} : i))} 
                    onColorChange={async () => {}} 
                    onRegenerate={handleRegenerateImage}
                />
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                    <CostAnalysis status={costAnalysisStatus} result={costAnalysisResult} error={costAnalysisError} onAnalyze={handleAnalyzeCost} />
                </div>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-8">
                    <button onClick={handleDownloadPackage} disabled={isPackaging} className="px-8 py-3 bg-teal-600 hover:bg-teal-500 text-white font-bold rounded-lg shadow-lg transition-all">Pobierz pakiet .zip</button>
                    <button onClick={() => setIsCsvModalOpen(true)} className="px-8 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg shadow-lg">Pobierz plik .csv</button>
                    <button onClick={() => {setExportPlatform('baselinker'); setIsExportModalOpen(true);}} className="px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg shadow-lg">Eksportuj do BaseLinker</button>
                     <button onClick={() => {setExportPlatform('allegro'); setIsExportModalOpen(true);}} className="px-8 py-3 bg-orange-600 hover:bg-orange-500 text-white font-bold rounded-lg shadow-lg">Wystaw na Allegro</button>
                </div>
            </div>
        )}

        {/* CSV Modal */}
        <CsvExportModal 
            isOpen={isCsvModalOpen} 
            onClose={() => setIsCsvModalOpen(false)} 
            imageBlobs={selectedImages}
            data={{
                title: auctionTitle,
                sku: sku,
                ean: ean,
                colors: colors.join(', '),
                condition: productCondition === 'new' ? 'Nowy' : 'Używany',
                weight: weight ? weight.toString() : '',
                width: dimensions ? (dimensions.x / 10).toFixed(2) : '',
                height: dimensions ? (dimensions.y / 10).toFixed(2) : '',
                depth: dimensions ? (dimensions.z / 10).toFixed(2) : '',
                description_main: descriptionParts[0] || '',
                description_extra1: descriptionParts[1] || '',
                description_extra2: descriptionParts[2] || '',
                description_extra3: descriptionParts[3] || '',
                images: selectedImages.map(img => img.name).join('|')
            }}
        />

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
