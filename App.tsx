
import React, { useState, useCallback, useEffect } from 'react';
import { Header } from './components/Header';
import { FileUpload } from './components/FileUpload';
import { ImagePreview } from './components/ImagePreview';
import { DescriptionOutput } from './components/DescriptionOutput';
import { Loader } from './components/Loader';
import { generateAllegroDescription, addWhiteBackground, analyzePricing, generateAdditionalImages } from './services/geminiService';
import { generateImagesFromModel } from './services/rendererService';
import { SelectedImagesPreview } from './components/SelectedImagesPreview';
import { ExportModal, ExportPlatform } from './components/ExportModal';
import { exportToWooCommerce, exportToBaseLinker } from './services/exportService';
import { CostAnalysis, CostAnalysisResult } from './components/CostAnalysis';
import { CostSettingsModal } from './components/CostSettingsModal';
import { PrintCostEstimator } from './components/PrintCostEstimator';
import { VirtualStudio } from './components/VirtualStudio';

declare const JSZip: any;

type Status = 'idle' | 'loading' | 'success' | 'error';
type ExportStatus = 'idle' | 'exporting' | 'success' | 'error';
export type BackgroundIntensity = 'calm' | 'normal' | 'crazy';
type Tab = 'generator' | 'studio';

export interface ModelDimensions {
    x: number;
    y: number;
    z: number;
}

export interface CostSettings {
  filamentPricePerKg: number;
  printerSpeedGramsPerHour: number;
  printerPowerConsumptionWatts: number;
  electricityPricePerKwh: number;
  otherCostsPercentage: number;
}

export interface PrintCost {
  estimatedTimeHours: number;
  filamentCost: number;
  electricityCost: number;
  marginCost: number;
  totalCost: number;
}

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('generator');

  const [modelFile, setModelFile] = useState<File | null>(null);
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
  
  const [baseImageForAi, setBaseImageForAi] = useState<Blob | null>(null);
  const [sourceRenderBlobs, setSourceRenderBlobs] = useState<Blob[]>([]);

  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);
  const [exportPlatform, setExportPlatform] = useState<ExportPlatform | null>(null);
  const [exportStatus, setExportStatus] = useState<ExportStatus>('idle');
  const [exportError, setExportError] = useState<string | null>(null);

  const [costAnalysisStatus, setCostAnalysisStatus] = useState<Status>('idle');
  const [costAnalysisResult, setCostAnalysisResult] = useState<CostAnalysisResult | null>(null);
  const [costAnalysisError, setCostAnalysisError] = useState<string | null>(null);
  
  const [isCostSettingsModalOpen, setIsCostSettingsModalOpen] = useState<boolean>(false);
  const [costSettings, setCostSettings] = useState<CostSettings>({
    filamentPricePerKg: 45,
    printerSpeedGramsPerHour: 40,
    printerPowerConsumptionWatts: 90,
    electricityPricePerKwh: 1.20,
    otherCostsPercentage: 15,
  });
  const [printCost, setPrintCost] = useState<PrintCost | null>(null);
  
  useEffect(() => {
    try {
        const savedSettings = localStorage.getItem('printCostSettings');
        if (savedSettings) {
            const parsedSettings = JSON.parse(savedSettings);
            if (typeof parsedSettings.filamentPricePerKg === 'number') setCostSettings(parsedSettings);
        }
    } catch (e) { console.error(e); }
  }, []);

  const calculatePrintCost = (modelWeightKg: number, settings: CostSettings) => {
    if (modelWeightKg <= 0) { setPrintCost(null); return; }
    const modelWeightGrams = modelWeightKg * 1000;
    const estimatedTimeHours = modelWeightGrams / settings.printerSpeedGramsPerHour;
    const filamentCost = modelWeightKg * settings.filamentPricePerKg;
    const electricityCost = (estimatedTimeHours * (settings.printerPowerConsumptionWatts / 1000)) * settings.electricityPricePerKwh;
    const baseCost = filamentCost + electricityCost;
    const marginCost = baseCost * (settings.otherCostsPercentage / 100);
    const totalCost = baseCost + marginCost;
    setPrintCost({ estimatedTimeHours, filamentCost, electricityCost, marginCost, totalCost });
  };

  const resetState = () => {
      setAuctionTitle('');
      setDescriptionParts([]);
      setSku('');
      setEan('');
      setColors([]);
      setDimensions(null);
      setWeight(null);
      setSelectedImages([]);
      setBaseImageForAi(null);
      setSourceRenderBlobs([]);
      setError(null);
      setCostAnalysisStatus('idle');
      setCostAnalysisResult(null);
      setPrintCost(null);
      setExportStatus('idle');
      setExportError(null);
  }

  const handleGenerate = useCallback(async () => {
    if (!modelFile && imageFiles.length === 0) {
      setError('Proszę wgrać model 3D lub zdjęcie.');
      return;
    }

    setIsLoading(true);
    resetState();
    
    try {
      let userImages: { name: string; blob: Blob }[] = [];
      let modelRenders: { name: string; blob: Blob }[] = [];
      let modelFileForContext: File | null = null;

      if (modelFile) {
        let modelToProcess: File = modelFile;
        if (modelFile.name.toLowerCase().endsWith('.zip')) {
            setLoadingMessage('Rozpakowywanie modelu...');
            const zip = await JSZip.loadAsync(modelFile);
            const modelEntries = zip.file(/\.(stl|3mf)$/i);
            if (modelEntries.length > 0) {
                const blob = await modelEntries[0].async('blob');
                modelToProcess = new File([blob], modelEntries[0].name);
            }
        }
        modelFileForContext = modelToProcess;
        setLoadingMessage('Rendering 360° skanowania...');
        // We now get 9 images (8 angles + 1 top)
        const { images, dimensions: modelDims, weight: modelW } = await generateImagesFromModel(modelToProcess);
        
        // STRICT DIVERSE ANGLE SELECTION
        // Instead of sorting by size (which clumps similar views), we explicitly fetch the files by name 
        // to guarantee rotation in the final gallery.
        
        // 1. Isometric (Standard 3/4 view)
        const isoView = images.find(img => img.name === 'iso_top_fr.png') || images[0];
        
        // 2. Side Profile (90 degrees) - forces the object to look "sideways"
        const sideView = images.find(img => img.name === 'ring_y_90.png') || images[2];
        
        // 3. Front Face (0 degrees) or Alternative Angle (225 degrees)
        const frontView = images.find(img => img.name === 'ring_y_0.png') || images.find(img => img.name === 'ring_y_315.png') || images[1];
        
        // 4. Detail View (Top)
        const topView = images.find(img => img.name === 'top_direct.png') || images[3];

        const finalSelection = [isoView, sideView, frontView, topView].filter(Boolean);
        
        // Fallback if specific names not found (should not happen with rendererService)
        if (finalSelection.length < 4) {
             const remaining = images.filter(img => !finalSelection.includes(img));
             finalSelection.push(...remaining.slice(0, 4 - finalSelection.length));
        }

        modelRenders = finalSelection.map(f => ({ name: f.name, blob: f as Blob }));
        
        setDimensions(modelDims);
        setWeight(modelW);
        if (modelW) calculatePrintCost(modelW, costSettings);
      }

      if (imageFiles.length > 0) {
          userImages = imageFiles.map(f => ({ name: f.name, blob: f as Blob }));
      }

      setLoadingMessage('Analizowanie i generowanie opisu...');
      
      // Determine base images
      let baseBlobs: Blob[] = [];
      if (userImages.length > 0) {
          baseBlobs = userImages.map(i => i.blob);
      } else if (modelRenders.length > 0) {
          baseBlobs = modelRenders.map(r => r.blob);
      }
      
      // Store the renders so we can use them for regeneration correctly
      setSourceRenderBlobs(baseBlobs);
      
      // Use the #1 most detailed image as the main reference for AI (usually the best Iso view for models)
      const bestForWhiteBg = baseBlobs[0];
      
      setBaseImageForAi(bestForWhiteBg);

      const allCandidateFiles = [...userImages.map(i => new File([i.blob], i.name)), ...modelRenders.map(i => new File([i.blob], i.name))];
      const { auctionTitle: title, descriptionParts: parts, sku: gSku, ean: gEan, colors: gCols } = await generateAllegroDescription(allCandidateFiles, modelFileForContext, additionalInfo);
      
      setAuctionTitle(title);
      setDescriptionParts(parts);
      setSku(gSku);
      setEan(gEan || '');
      setColors(gCols);
      
      setLoadingMessage('Stylizacja zdjęć przez AI...');
      let finalGallery: { name: string; blob: Blob }[] = [];

      if (baseBlobs.length > 0 && bestForWhiteBg) {
          // 1. Generate Main White BG Shot
          // Pass 'title' as context so it knows WHAT to texture
          const whiteBgPromise = addWhiteBackground(bestForWhiteBg, title).catch(() => bestForWhiteBg);
          
          // 2. Generate Lifestyle Shots 
          // CRITICAL: Pass the DIFFERENT ANGLES to generateAdditionalImages
          // slice(0,3) will take [Iso, Side, Front]
          const distinctAngles = baseBlobs.slice(0, 3); 
          const aiGensPromise = generateAdditionalImages(distinctAngles, title, 3, imageStylePrompt, 0, backgroundIntensity);

          const [whiteBg, aiGens] = await Promise.all([whiteBgPromise, aiGensPromise]);

          if (whiteBg) finalGallery.push({ name: 'main_product.png', blob: whiteBg as Blob });
          finalGallery.push(...aiGens);
          
          // Fill logic if AI fails
          if (finalGallery.length < 4) {
             modelRenders.forEach(r => {
                 if (finalGallery.length < 4) finalGallery.push(r);
             });
          }
      }

      setSelectedImages(finalGallery.slice(0, 4));

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Wystąpił błąd.');
    } finally { setIsLoading(false); }
  }, [modelFile, imageFiles, costSettings, additionalInfo, imageStylePrompt, backgroundIntensity]);

  const handleRegenerateImage = async (index: number) => {
      if (!baseImageForAi || !auctionTitle) return;
      try {
          let newImage: { name: string; blob: Blob } | null = null;
          if (index === 0) {
              const newBlob = await addWhiteBackground(baseImageForAi, auctionTitle);
              newImage = { name: 'main_product_refreshed.png', blob: newBlob };
          } else {
              // Ensure we pick the correct source angle for regeneration so the rotation stays consistent
              const sources = sourceRenderBlobs.length > 0 ? sourceRenderBlobs : [baseImageForAi];
              // UI Index 1 corresponds to sourceRenderBlobs[0] (Iso) in the batch generation logic
              // UI Index 2 corresponds to sourceRenderBlobs[1] (Side)
              // UI Index 3 corresponds to sourceRenderBlobs[2] (Front)
              const sourceIndex = (index - 1) % sources.length;
              const specificSource = sources[sourceIndex];
              
              const results = await generateAdditionalImages(specificSource, auctionTitle, 1, imageStylePrompt, index, backgroundIntensity);
              if (results.length > 0) newImage = results[0];
          }
          if (newImage) {
              setSelectedImages(prev => {
                  const updated = [...prev];
                  updated[index] = newImage!;
                  return updated;
              });
          }
      } catch (err) { console.error("Błąd regeneracji:", err); }
  };

  const handleExport = async (credentials: any) => {
    setExportStatus('exporting');
    setExportError(null);
    try {
      const productData = {
        title: auctionTitle,
        description: descriptionParts.map(p => `<p>${p}</p>`).join(''),
        descriptionParts: descriptionParts,
        images: selectedImages,
        sku: sku,
        ean: ean,
        condition: productCondition,
        dimensions: dimensions,
        weight: weight
      };
      if (exportPlatform === 'baselinker') {
        await exportToBaseLinker(credentials, productData);
      } else if (exportPlatform === 'woocommerce') {
        await exportToWooCommerce(credentials, productData);
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
        link.download = `aukcja-3d.zip`;
        link.click();
    } catch (err) { setError("Błąd ZIP."); } finally { setIsPackaging(false); }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-gray-100 flex flex-col items-center p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-5xl">
        <Header />
        
        {/* TABS NAVIGATION */}
        <div className="flex justify-center mt-8 mb-6">
            <div className="bg-slate-900 p-1 rounded-xl border border-gray-700 flex">
                <button
                    onClick={() => setActiveTab('generator')}
                    className={`px-6 py-2 rounded-lg font-bold transition-all ${activeTab === 'generator' ? 'bg-cyan-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
                >
                    Generator 3D (Allegro)
                </button>
                <button
                    onClick={() => setActiveTab('studio')}
                    className={`px-6 py-2 rounded-lg font-bold transition-all flex items-center gap-2 ${activeTab === 'studio' ? 'bg-purple-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    Wirtualne Studio
                </button>
            </div>
        </div>

        {activeTab === 'studio' ? (
            <VirtualStudio />
        ) : (
            <main className="relative bg-slate-900 rounded-2xl shadow-2xl p-6 sm:p-8 border border-slate-800">
            <div className="absolute top-4 right-4">
                <button onClick={() => setIsCostSettingsModalOpen(true)} className="p-2 rounded-full text-gray-400 hover:text-cyan-300">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924-1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="flex flex-col gap-6">
                <FileUpload id="model-upload" label="Wgraj model 3D (STL/3MF)" accept=".stl,.3mf,.zip" onChange={e => setModelFile(e.target.files?.[0] || null)} fileName={modelFile?.name} icon={<svg className="h-8 w-8 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-14L4 7m0 0l8 4m-8-4v10l8 4" /></svg>} />
                <FileUpload id="image-upload" label="Zdjęcia bazowe (opcjonalnie)" accept="image/*" onChange={e => setImageFiles(Array.from(e.target.files || []))} fileName={imageFiles.length > 0 ? `${imageFiles.length} zdjęć` : undefined} icon={<svg className="h-8 w-8 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01" /></svg>} multiple />
                
                <div className="space-y-4 bg-slate-800/40 p-4 rounded-xl border border-gray-700">
                    <div>
                    <label className="block text-sm font-semibold text-cyan-400 mb-2">Opis produktu (opcjonalnie)</label>
                    <textarea value={additionalInfo} onChange={e => setAdditionalInfo(e.target.value)} placeholder="Np. Przeznaczenie, pasujące modele..." className="w-full h-16 p-3 bg-slate-900 border border-gray-700 rounded-lg text-sm" />
                    </div>
                    <div>
                    <label className="block text-sm font-semibold text-cyan-400 mb-2">Intensywność tła AI</label>
                    <div className="flex bg-slate-900 p-1 rounded-lg border border-gray-700">
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
                    </div>
                    <div>
                    <label className="block text-sm font-semibold text-cyan-400 mb-2">Własny styl tła (opcjonalnie)</label>
                    <input type="text" value={imageStylePrompt} onChange={e => setImageStylePrompt(e.target.value)} placeholder="Np. 'Dżungla', 'Warsztat', 'Cyberpunk'..." className="w-full p-3 bg-slate-900 border border-gray-700 rounded-lg text-sm" />
                    </div>
                </div>

                <button onClick={handleGenerate} disabled={isLoading} className="w-full py-4 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-lg shadow-lg shadow-cyan-500/20 transform transition-all hover:scale-105">
                    {isLoading ? 'Pracuję...' : 'Generuj Szybką Ofertę'}
                </button>
                </div>
                <ImagePreview imageFile={imageFiles[0] || modelFile} />
            </div>
            {isLoading && <Loader message={loadingMessage} />}
            {selectedImages.length > 0 && !isLoading && (
                <div className="mt-10 pt-8 border-t border-cyan-500/20 space-y-10">
                <DescriptionOutput auctionTitle={auctionTitle} descriptionParts={descriptionParts} sku={sku} ean={ean} onEanChange={setEan} colors={colors} condition={productCondition} dimensions={dimensions} onDimensionsChange={(a, v) => setDimensions(d => d ? {...d, [a]: v*10} : null)} weight={weight} onWeightChange={setWeight} />
                <SelectedImagesPreview 
                    images={selectedImages} 
                    onImageUpdate={(n, b) => setSelectedImages(imgs => imgs.map(i => i.name === n ? {name: n, blob: b} : i))} 
                    onColorChange={async () => {}} 
                    onRegenerate={handleRegenerateImage}
                />
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                    {printCost && <PrintCostEstimator cost={printCost} />}
                    <CostAnalysis status={costAnalysisStatus} result={costAnalysisResult} error={costAnalysisError} onAnalyze={handleAnalyzeCost} />
                </div>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-8">
                    <button onClick={handleDownloadPackage} disabled={isPackaging} className="px-8 py-3 bg-teal-600 hover:bg-teal-500 text-white font-bold rounded-lg shadow-lg transition-all">Pobierz pakiet .zip</button>
                    <button onClick={() => {setExportPlatform('baselinker'); setIsExportModalOpen(true);}} className="px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg shadow-lg">Eksportuj do BaseLinker</button>
                </div>
                </div>
            )}
            </main>
        )}

        {isExportModalOpen && (
          <ExportModal 
            isOpen={isExportModalOpen} 
            onClose={() => setIsExportModalOpen(false)} 
            platform={exportPlatform!} 
            onExport={handleExport} 
            status={exportStatus} 
            error={exportError} 
          />
        )}
        {isCostSettingsModalOpen && <CostSettingsModal isOpen={isCostSettingsModalOpen} onClose={() => setIsCostSettingsModalOpen(false)} settings={costSettings} onSave={setCostSettings} />}
      </div>
    </div>
  );
};
