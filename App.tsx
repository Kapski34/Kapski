
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
import { createAllegroDraft, publishOffer } from './services/allegroService';
import { CostAnalysis, CostAnalysisResult } from './components/CostAnalysis';
import { CostSettingsModal } from './components/CostSettingsModal';
import { PrintCostEstimator } from './components/PrintCostEstimator';
import { VirtualStudio } from './components/VirtualStudio';
import { EanGenerator } from './components/EanGenerator';
import { PhotoGenerator } from './components/PhotoGenerator';

// AUTH IMPORTS
import { useAuth } from './contexts/AuthContext';
import { AuthModal } from './components/AuthModal';
import { TokenStore, PACKAGES } from './components/TokenStore'; // Import PACKAGES

declare const JSZip: any;

type Status = 'idle' | 'loading' | 'success' | 'error';
type ExportStatus = 'idle' | 'exporting' | 'success' | 'error';
export type BackgroundIntensity = 'calm' | 'normal' | 'crazy';
export type PersonalityType = 'professional' | 'energetic' | 'luxury' | 'technical' | 'storyteller' | 'custom' | string;
type Tab = 'generator' | 'studio' | 'ean' | 'photo';
type MainView = 'app' | 'features' | 'pricing';

interface SavedStyle {
    id: string;
    name: string;
    links: string;
}

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

const normalizeEan = (v: string) => (v || '').replace(/[^\d]/g, '').trim();

export const App: React.FC = () => {
  // AUTH STATE
  const { user, userData, deductToken } = useAuth();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isTokenStoreOpen, setIsTokenStoreOpen] = useState(false);
  const [initialStorePackage, setInitialStorePackage] = useState<string | undefined>(undefined);

  const [mainView, setMainView] = useState<MainView>('app');
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
  
  const [personality, setPersonality] = useState<PersonalityType>('professional');
  const [referenceLinks, setReferenceLinks] = useState<string>('');
  const [savedStyles, setSavedStyles] = useState<SavedStyle[]>([]);
  const [newStyleName, setNewStyleName] = useState<string>('');

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
    if (!user) {
        setIsAuthModalOpen(true);
        return;
    }
    if (!userData || userData.tokens < 1) {
        setInitialStorePackage(undefined);
        setIsTokenStoreOpen(true);
        return;
    }

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
        const { images, dimensions: modelDims, weight: modelW } = await generateImagesFromModel(modelToProcess);
        
        const isoView = images.find(img => img.name === 'iso_top_fr.png') || images[0];
        const sideView = images.find(img => img.name === 'ring_y_90.png') || images[2];
        const frontView = images.find(img => img.name === 'ring_y_0.png') || images.find(img => img.name === 'ring_y_315.png') || images[1];
        const topView = images.find(img => img.name === 'top_direct.png') || images[3];

        const finalSelection = [isoView, sideView, frontView, topView].filter(Boolean);
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

      setLoadingMessage('Analizowanie stylu i generowanie opisu...');
      
      let baseBlobs: Blob[] = [];
      if (userImages.length > 0) {
          baseBlobs = userImages.map(i => i.blob);
      } else if (modelRenders.length > 0) {
          baseBlobs = modelRenders.map(r => r.blob);
      }
      setSourceRenderBlobs(baseBlobs);
      const bestForWhiteBg = baseBlobs[0];
      setBaseImageForAi(bestForWhiteBg);

      const allCandidateFiles = [...userImages.map(i => new File([i.blob], i.name)), ...modelRenders.map(i => new File([i.blob], i.name))];
      
      const { auctionTitle: title, descriptionParts: parts, sku: gSku, ean: gEan, colors: gCols } = await generateAllegroDescription(
          allCandidateFiles, 
          modelFileForContext, 
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

      if (baseBlobs.length > 0 && bestForWhiteBg) {
          const whiteBgPromise = addWhiteBackground(bestForWhiteBg, title).catch(() => bestForWhiteBg);
          // v72 Fix: always pass a single blob to ensure API consistency
          const aiGensPromise = generateAdditionalImages(bestForWhiteBg, title, 3, imageStylePrompt, 0, backgroundIntensity);
          const [whiteBg, aiGens] = await Promise.all([whiteBgPromise, aiGensPromise]);

          if (whiteBg) finalGallery.push({ name: 'main_product.png', blob: whiteBg as Blob });
          finalGallery.push(...aiGens);
          
          if (finalGallery.length < 4) {
             modelRenders.forEach(r => {
                 if (finalGallery.length < 4) finalGallery.push(r);
             });
          }
      }
      setSelectedImages(finalGallery.slice(0, 4));

      deductToken(1);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Wystąpił błąd.');
    } finally { setIsLoading(false); }
  }, [modelFile, imageFiles, costSettings, additionalInfo, imageStylePrompt, backgroundIntensity, personality, referenceLinks, user, userData, deductToken]);

  const handleRegenerateImage = async (index: number) => {
      if (!user) return setIsAuthModalOpen(true);
      if (!userData || userData.tokens < 1) {
          setInitialStorePackage(undefined);
          return setIsTokenStoreOpen(true);
      }

      if (!baseImageForAi || !auctionTitle) return;
      try {
          let newImage: { name: string; blob: Blob } | null = null;
          if (index === 0) {
              const newBlob = await addWhiteBackground(baseImageForAi, auctionTitle);
              newImage = { name: 'main_product_refreshed.png', blob: newBlob };
          } else {
              const sources = sourceRenderBlobs.length > 0 ? sourceRenderBlobs : [baseImageForAi];
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
              deductToken(1);
          }
      } catch (err) { console.error("Błąd regeneracji:", err); }
  };

  const handleAnalyzeCost = async () => {
    if (!selectedImages[0] || !auctionTitle) return;
    setCostAnalysisStatus('loading');
    setCostAnalysisError(null);
    try {
      const result = await analyzePricing(selectedImages[0].blob, auctionTitle);
      setCostAnalysisResult(result);
      setCostAnalysisStatus('success');
    } catch (err) {
      setCostAnalysisStatus('error');
      setCostAnalysisError(err instanceof Error ? err.message : 'Wystąpił błąd podczas analizy cen.');
    }
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

  const handleBuyPackage = (pkgId: string) => {
      setInitialStorePackage(pkgId);
      setIsTokenStoreOpen(true);
  };

  // --- RENDERING HELPERS ---

  const renderFeatures = () => (
      <div className="bg-slate-900 rounded-2xl shadow-2xl p-6 sm:p-10 border border-slate-800 animate-fade-in">
           <style>{`
                @keyframes scan {
                    0% { top: 0%; opacity: 0.8; }
                    50% { top: 100%; opacity: 0.8; }
                    51% { top: 100%; opacity: 0; }
                    100% { top: 0%; opacity: 0; }
                }
                @keyframes gradient-x {
                    0%, 100% { background-position: 0% 50%; }
                    50% { background-position: 100% 50%; }
                }
                /* NEW ANIMATIONS FOR INTEGRATIONS */
                @keyframes float-up {
                    0%, 100% { transform: translateY(0); opacity: 1; }
                    50% { transform: translateY(-5px); opacity: 0.8; }
                }
                @keyframes shake-cart {
                    0%, 100% { transform: rotate(0deg) scale(1); }
                    25% { transform: rotate(-5deg) scale(1.1); }
                    75% { transform: rotate(5deg) scale(1.1); }
                }
                @keyframes download-bounce {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(5px); }
                }
           `}</style>
           <h2 className="text-3xl font-bold text-center text-white mb-10">Dostępne Funkcje</h2>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
               
               {/* 1. STL GENERATOR */}
               <div className="bg-slate-800/50 p-6 rounded-xl border border-gray-700 hover:border-cyan-500 transition-colors group cursor-default">
                   <div className="mb-4 w-16 h-16 bg-cyan-900/20 rounded-lg flex items-center justify-center relative overflow-hidden">
                       {/* Animated Cube Icon */}
                       <div className="text-4xl transition-transform duration-700 group-hover:animate-[spin_4s_linear_infinite] group-hover:scale-110">🧊</div>
                   </div>
                   <h3 className="text-xl font-bold text-white mb-2 group-hover:text-cyan-400 transition-colors">Generator STL + 3MF</h3>
                   <p className="text-gray-400 text-sm">Przekształca pliki modeli 3D w gotowe oferty. Automatycznie renderuje model w wirtualnym studiu pod 4 kątami, mierzy wymiary, szacuje koszty druku i pisze opis.</p>
               </div>

               {/* 2. PHOTO GENERATOR */}
               <div className="bg-slate-800/50 p-6 rounded-xl border border-gray-700 hover:border-indigo-500 transition-colors group cursor-default">
                   <div className="mb-4 w-16 h-16 bg-indigo-900/20 rounded-lg flex items-center justify-center relative overflow-hidden">
                       {/* Checkerboard Background (Transparent) */}
                       <div className="absolute inset-0 opacity-30" style={{backgroundImage: 'linear-gradient(45deg, #444 25%, transparent 25%), linear-gradient(-45deg, #444 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #444 75%), linear-gradient(-45deg, transparent 75%, #444 75%)', backgroundSize: '10px 10px', backgroundPosition: '0 0, 0 5px, 5px -5px, -5px 0px'}}></div>
                       {/* Solid Overlay that fades out */}
                       <div className="absolute inset-0 bg-slate-800 transition-opacity duration-700 group-hover:opacity-0"></div>
                       <div className="relative z-10 text-4xl group-hover:scale-110 transition-transform duration-300">📸</div>
                   </div>
                   <h3 className="text-xl font-bold text-white mb-2 group-hover:text-indigo-400 transition-colors">Generator Zdjęcia</h3>
                   <p className="text-gray-400 text-sm">Nie masz modelu 3D? Wgraj zwykłe zdjęcia produktu. AI usunie tło (jak na animacji powyżej), poprawi jakość, zidentyfikuje przedmiot i stworzy profesjonalny opis aukcji.</p>
               </div>

               {/* 3. VIRTUAL STUDIO */}
               <div className="bg-slate-800/50 p-6 rounded-xl border border-gray-700 hover:border-purple-500 transition-colors group cursor-default">
                   <div className="mb-4 w-16 h-16 bg-purple-900/20 rounded-lg flex items-center justify-center relative overflow-hidden">
                       {/* Animated Gradient Background */}
                       <div className="absolute inset-0 bg-gradient-to-r from-slate-900 via-purple-900 to-slate-900 bg-[length:200%_100%] transition-all duration-300 group-hover:animate-[gradient-x_3s_ease_infinite]"></div>
                       <div className="relative z-10 text-4xl group-hover:rotate-12 transition-transform duration-500">✨</div>
                   </div>
                   <h3 className="text-xl font-bold text-white mb-2 group-hover:text-purple-400 transition-colors">Wirtualne Studio</h3>
                   <p className="text-gray-400 text-sm">Masz "brzydkie" zdjęcie produktu? Umieść je w wirtualnej scenerii (np. na drewnianym stole, w lofcie, w neonowym świetle) za pomocą jednego kliknięcia.</p>
               </div>

                {/* 4. EAN GENERATOR */}
                <div className="bg-slate-800/50 p-6 rounded-xl border border-gray-700 hover:border-emerald-500 transition-colors group cursor-default">
                   <div className="mb-4 w-16 h-16 bg-emerald-900/20 rounded-lg flex items-center justify-center relative overflow-hidden">
                       <div className="text-4xl text-emerald-100">🔍</div>
                       {/* Scanning Laser Line */}
                       <div className="absolute top-0 left-0 w-full h-0.5 bg-red-500 shadow-[0_0_8px_rgba(239,68,68,1)] opacity-0 group-hover:opacity-100 group-hover:animate-[scan_2s_linear_infinite]"></div>
                   </div>
                   <h3 className="text-xl font-bold text-white mb-2 group-hover:text-emerald-400 transition-colors">Generator EAN</h3>
                   <p className="text-gray-400 text-sm">Wpisz kod EAN, a system znajdzie zdjęcia produktu w sieci, zweryfikuje ich autentyczność, wyczyści tło i przygotuje pełną ofertę.</p>
               </div>
           </div>

           {/* NEW SECTION: INTEGRATIONS WITH ANIMATIONS */}
           <div className="mt-16 pt-10 border-t border-gray-800 animate-fade-in">
                <h2 className="text-3xl font-bold text-center text-white mb-10">Integracje i Eksport</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    
                    {/* ALLEGRO - Animation: Float Up + Glow */}
                    <div className="group bg-slate-800/30 p-6 rounded-xl border border-orange-900/50 hover:border-orange-500 transition-colors flex items-start gap-4 hover:shadow-[0_0_15px_rgba(249,115,22,0.2)]">
                        <div className="p-3 bg-orange-900/20 rounded-lg group-hover:bg-orange-900/40 transition-colors">
                            <svg className="w-8 h-8 text-orange-500 group-hover:text-orange-400 group-hover:animate-[float-up_2s_ease-in-out_infinite]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg>
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-white mb-1 group-hover:text-orange-400 transition-colors">Allegro</h3>
                            <p className="text-sm text-gray-400">Bezpośrednia integracja API. Możesz wystawiać oferty jako szkice (Draft) lub publikować je natychmiastowo. Obsługa Sandbox oraz oficjalnych cenników dostaw.</p>
                        </div>
                    </div>

                    {/* BASELINKER - Animation: Spin/Connect */}
                    <div className="group bg-slate-800/30 p-6 rounded-xl border border-blue-900/50 hover:border-blue-500 transition-colors flex items-start gap-4 hover:shadow-[0_0_15px_rgba(59,130,246,0.2)]">
                        <div className="p-3 bg-blue-900/20 rounded-lg group-hover:bg-blue-900/40 transition-colors">
                            <svg className="w-8 h-8 text-blue-500 group-hover:text-blue-400 group-hover:animate-[spin_4s_linear_infinite]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-white mb-1 group-hover:text-blue-400 transition-colors">BaseLinker</h3>
                            <p className="text-sm text-gray-400">Dodaj wygenerowany produkt prosto do katalogu BaseLinker. System automatycznie mapuje kategorie, magazyny i cenniki, umożliwiając dalszą dystrybucję.</p>
                        </div>
                    </div>

                    {/* WOOCOMMERCE - Animation: Shake/Cart */}
                    <div className="group bg-slate-800/30 p-6 rounded-xl border border-purple-900/50 hover:border-purple-500 transition-colors flex items-start gap-4 hover:shadow-[0_0_15px_rgba(168,85,247,0.2)]">
                        <div className="p-3 bg-purple-900/20 rounded-lg group-hover:bg-purple-900/40 transition-colors">
                            <svg className="w-8 h-8 text-purple-500 group-hover:text-purple-400 group-hover:animate-[shake-cart_0.5s_ease-in-out_infinite]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-white mb-1 group-hover:text-purple-400 transition-colors">WooCommerce</h3>
                            <p className="text-sm text-gray-400">Wysyłaj gotowe produkty bezpośrednio do swojego sklepu na WordPress. Automatyczny upload zdjęć do biblioteki mediów i formatowanie opisu HTML.</p>
                        </div>
                    </div>

                    {/* ZIP - Animation: Download Bounce */}
                    <div className="group bg-slate-800/30 p-6 rounded-xl border border-teal-900/50 hover:border-teal-500 transition-colors flex items-start gap-4 hover:shadow-[0_0_15px_rgba(20,184,166,0.2)]">
                        <div className="p-3 bg-teal-900/20 rounded-lg group-hover:bg-teal-900/40 transition-colors">
                            <svg className="w-8 h-8 text-teal-500 group-hover:text-teal-400 group-hover:animate-[download-bounce_1s_ease-in-out_infinite]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-white mb-1 group-hover:text-teal-400 transition-colors">Paczka ZIP</h3>
                            <p className="text-sm text-gray-400">Pobierz wszystko w jednej paczce: wygenerowane zdjęcia (PNG) oraz plik tekstowy z opisem aukcji, gotowe do ręcznego wykorzystania na dowolnej platformie.</p>
                        </div>
                    </div>

                </div>
           </div>
      </div>
  );

  const renderPricing = () => (
    <div className="bg-slate-900 rounded-2xl shadow-2xl p-6 sm:p-10 border border-slate-800 animate-fade-in">
         <h2 className="text-3xl font-bold text-center text-white mb-10">Cennik Tokenów</h2>
         <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {PACKAGES.map((pkg) => (
                <div key={pkg.id} className={`relative bg-slate-800 rounded-xl p-6 border flex flex-col hover:transform hover:scale-105 transition-all duration-300 ${pkg.popular ? 'border-purple-500 ring-1 ring-purple-500/50' : 'border-slate-700 hover:border-gray-500'}`}>
                    {pkg.popular && <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-purple-600 text-white text-[10px] font-bold px-3 py-1 rounded-full shadow-lg">NAJPOPULARNIEJSZY</div>}
                    
                    <h3 className="text-xl font-bold text-gray-200 text-center mb-1">{pkg.label}</h3>
                    <p className="text-xs text-gray-500 text-center mb-4">{pkg.desc}</p>
                    
                    <div className="text-center mb-6 bg-slate-900/50 py-3 rounded-lg">
                        <span className="text-3xl font-extrabold text-white">{pkg.price} zł</span>
                    </div>
                    
                    <ul className="space-y-3 mb-8 flex-1 text-sm">
                        <li className="flex items-center gap-2 text-gray-300">
                            <span className="text-purple-400 font-bold">✓</span> 
                            <strong className="text-white">{pkg.tokens}</strong> generowań
                        </li>
                        <li className="flex items-center gap-2 text-gray-300">
                            <span className="text-purple-400 font-bold">✓</span> 
                            Wsparcie priorytetowe
                        </li>
                         <li className="flex items-center gap-2 text-gray-300">
                            <span className="text-purple-400 font-bold">✓</span> 
                            Faktura VAT 23%
                        </li>
                    </ul>

                    <button 
                        onClick={() => handleBuyPackage(pkg.id)}
                        className={`w-full py-2 rounded-lg font-bold text-white transition-all ${pkg.popular ? 'bg-purple-600 hover:bg-purple-500' : 'bg-slate-700 hover:bg-slate-600'}`}
                    >
                        Kup Teraz
                    </button>
                </div>
            ))}
        </div>
        <p className="text-center text-gray-500 text-sm mt-8">Płatności obsługiwane są przez bezpieczną bramkę Stripe. Tokeny są dodawane do konta natychmiast po zaksięgowaniu wpłaty.</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-gray-100 flex flex-col items-center p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-5xl">
        <Header 
            activeView={mainView} 
            onViewChange={setMainView} 
            onOpenStore={() => { setInitialStorePackage(undefined); setIsTokenStoreOpen(true); }}
        />
        
        {mainView === 'features' && renderFeatures()}
        {mainView === 'pricing' && renderPricing()}

        {mainView === 'app' && (
            <>
                <div className="flex justify-center mt-8 mb-6 px-1 sm:px-0">
                    <div className="bg-slate-900 p-1 rounded-xl border border-gray-700 grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-row gap-2 w-full lg:w-auto">
                        <button
                            onClick={() => setActiveTab('generator')}
                            className={`px-4 py-3 lg:px-6 lg:py-2 rounded-lg font-bold transition-all flex items-center justify-center gap-2 ${activeTab === 'generator' ? 'bg-cyan-600 text-white shadow-lg' : 'text-gray-400 hover:text-white hover:bg-slate-800'}`}
                        >
                            Generator STL+3mf
                            <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded text-white uppercase tracking-tighter">Alfa</span>
                        </button>
                        <button
                            onClick={() => setActiveTab('photo')}
                            className={`px-4 py-3 lg:px-6 lg:py-2 rounded-lg font-bold transition-all flex items-center justify-center gap-2 ${activeTab === 'photo' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400 hover:text-white hover:bg-slate-800'}`}
                        >
                            Generator ze Zdjęcia
                            <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded text-white uppercase tracking-tighter">Alfa</span>
                        </button>
                        <button
                            onClick={() => setActiveTab('studio')}
                            className={`px-4 py-3 lg:px-6 lg:py-2 rounded-lg font-bold transition-all flex items-center justify-center gap-2 ${activeTab === 'studio' ? 'bg-purple-600 text-white shadow-lg' : 'text-gray-400 hover:text-white hover:bg-slate-800'}`}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                            Wirtualne Studio
                            <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded text-white uppercase tracking-tighter">Alfa</span>
                        </button>
                        <button
                            onClick={() => setActiveTab('ean')}
                            className={`px-4 py-3 lg:px-6 lg:py-2 rounded-lg font-bold transition-all flex items-center justify-center gap-2 ${activeTab === 'ean' ? 'bg-emerald-600 text-white shadow-lg' : 'text-gray-400 hover:text-white hover:bg-slate-800'}`}
                        >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" /></svg>
                            Generator EAN
                            <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded text-white uppercase tracking-tighter">Beta</span>
                        </button>
                    </div>
                </div>

                {activeTab === 'studio' && <VirtualStudio />}
                {activeTab === 'ean' && <EanGenerator />}
                {activeTab === 'photo' && <PhotoGenerator />}
                
                {activeTab === 'generator' && (
                    <main className="relative bg-slate-900 rounded-2xl shadow-2xl p-6 sm:p-8 border border-slate-800 animate-fade-in">
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
                        </div>
                        <ImagePreview imageFile={imageFiles[0] || modelFile} />
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
                            {printCost && <PrintCostEstimator cost={printCost} />}
                            <CostAnalysis status={costAnalysisStatus} result={costAnalysisResult} error={costAnalysisError} onAnalyze={handleAnalyzeCost} />
                        </div>
                        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-8">
                            <button onClick={handleDownloadPackage} disabled={isPackaging} className="px-8 py-3 bg-teal-600 hover:bg-teal-500 text-white font-bold rounded-lg shadow-lg transition-all">Pobierz pakiet .zip</button>
                            <button onClick={() => {setExportPlatform('baselinker'); setIsExportModalOpen(true);}} className="px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg shadow-lg">Eksportuj do BaseLinker</button>
                            <button onClick={() => {setExportPlatform('allegro'); setIsExportModalOpen(true);}} className="px-8 py-3 bg-orange-600 hover:bg-orange-500 text-white font-bold rounded-lg shadow-lg">Wystaw na Allegro</button>
                        </div>
                        </div>
                    )}
                    </main>
                )}
            </>
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
        
        {/* MODALS FOR AUTH & TOKENS */}
        <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
        <TokenStore 
            isOpen={isTokenStoreOpen} 
            onClose={() => { setIsTokenStoreOpen(false); setInitialStorePackage(undefined); }} 
            initialPackageId={initialStorePackage}
        />
      </div>
    </div>
  );
};
