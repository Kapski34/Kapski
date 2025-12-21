import React, { useState, useCallback, useEffect } from 'react';
import { Header } from './components/Header';
import { FileUpload } from './components/FileUpload';
import { ImagePreview } from './components/ImagePreview';
import { DescriptionOutput } from './components/DescriptionOutput';
import { Loader } from './components/Loader';
import { generateAllegroDescription, addWhiteBackground, analyzePricing, generateAdditionalImages, updateDescriptionColor, getColorsFromImages } from './services/geminiService';
import { generateImagesFromModel } from './services/rendererService';
import { SelectedImagesPreview } from './components/SelectedImagesPreview';
import { ExportModal, ExportPlatform } from './components/ExportModal';
import { exportToWooCommerce, exportToBaseLinker, BaseLinkerCredentials } from './services/exportService';
import { CostAnalysis, CostAnalysisResult } from './components/CostAnalysis';
import { CostSettingsModal } from './components/CostSettingsModal';
import { PrintCostEstimator } from './components/PrintCostEstimator';

// This lets TypeScript know about the JSZip global variable from the script tag
declare const JSZip: any;

type Status = 'idle' | 'loading' | 'success' | 'error';
type ExportStatus = 'idle' | 'exporting' | 'success' | 'error';

const imageHelpText = (
  <>
    Wybierz do 4 zdjęć (<strong className="font-bold text-gray-300">JPG, PNG, GIF, WEBP</strong>) lub jedno archiwum <strong className="font-bold text-gray-300">.ZIP</strong>.
  </>
);
const modelHelpText = "Akceptowane pliki: STL, 3MF, ZIP (z jednym modelem w środku)";

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

// Fix: Export App component to be used in index.tsx
export const App: React.FC = () => {
  const [modelFile, setModelFile] = useState<File | null>(null);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [additionalInfo, setAdditionalInfo] = useState<string>('');
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
  const [loadingMessage, setLoadingMessage] = useState<string>('Sztuczna inteligencja analizuje Twoje pliki...');
  const [isPackaging, setIsPackaging] = useState<boolean>(false);
  
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
            // Basic validation to ensure we don't crash if localStorage has old/bad data
            if (typeof parsedSettings.filamentPricePerKg === 'number') {
                 setCostSettings(parsedSettings);
            }
        }
    } catch (e) {
        console.error("Failed to load cost settings from localStorage", e);
    }
  }, []);

  const handleSaveCostSettings = (newSettings: CostSettings) => {
    setCostSettings(newSettings);
    try {
        localStorage.setItem('printCostSettings', JSON.stringify(newSettings));
    } catch(e) {
        console.error("Failed to save cost settings to localStorage", e);
    }
    // Re-calculate cost if weight is available
    if (weight) {
        calculatePrintCost(weight, newSettings);
    }
  };

  const calculatePrintCost = (modelWeightKg: number, settings: CostSettings) => {
    if (modelWeightKg <= 0) {
      setPrintCost(null);
      return;
    }

    const modelWeightGrams = modelWeightKg * 1000;

    const estimatedTimeHours = modelWeightGrams / settings.printerSpeedGramsPerHour;
    const filamentCost = modelWeightKg * settings.filamentPricePerKg;
    const electricityCost = (estimatedTimeHours * (settings.printerPowerConsumptionWatts / 1000)) * settings.electricityPricePerKwh;
    
    const baseCost = filamentCost + electricityCost;
    const marginCost = baseCost * (settings.otherCostsPercentage / 100);
    const totalCost = baseCost + marginCost;

    setPrintCost({
      estimatedTimeHours,
      filamentCost,
      electricityCost,
      marginCost,
      totalCost,
    });
  };

  const handleModelFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    resetState();
    setModelFile(file);
  };
  
  const resetState = () => {
      setAuctionTitle('');
      setDescriptionParts([]);
      setSku('');
      setEan('');
      setColors([]);
      setProductCondition('new');
      setDimensions(null);
      setWeight(null);
      setSelectedImages([]);
      setError(null);
      setCostAnalysisStatus('idle');
      setCostAnalysisResult(null);
      setCostAnalysisError(null);
      setPrintCost(null);
      setAdditionalInfo('');
  }

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Fix: Cast to File[] to avoid 'unknown' type errors
    const files = e.target.files ? Array.from(e.target.files) as File[] : [];
    
    resetState();

    if (files.length === 0) {
        setImageFiles([]);
        return;
    }
    
    const zipFile = files.find(f => f.name.toLowerCase().endsWith('.zip'));
    
    if (zipFile) {
        setImageFiles([zipFile]);
        if (files.length > 1) {
            setError("Wybrano plik ZIP. Inne pliki zostały zignorowane.");
        } else {
            setError(null);
        }
        return;
    }
    
    const supportedImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    const selectedImages = files.filter(f => supportedImageTypes.includes(f.type));
    
    let currentError: string | null = null;
    if (selectedImages.length !== files.length) {
        currentError = "Niektóre pliki zostały zignorowane, ponieważ nie są obsługiwanymi obrazami (JPG, PNG, GIF, WEBP).";
    }

    if (selectedImages.length === 0) {
        setImageFiles([]);
        setError("Wybrane pliki nie są obsługiwanymi obrazami. Proszę wybrać pliki JPG, PNG, GIF lub WEBP.");
        return;
    }
    
    if (selectedImages.length > 4) {
        setImageFiles(selectedImages.slice(0, 4));
        currentError = (currentError ? currentError + " " : "") + "Możesz wybrać maksymalnie 4 zdjęcia. Wybrano pierwsze cztery.";
    } else {
        setImageFiles(selectedImages);
    }

    setError(currentError);
  };

  const handleImageUpdate = (originalName: string, newBlob: Blob) => {
    setSelectedImages(currentImages => {
        if (!currentImages) return [];
        return currentImages.map(img => {
            if (img.name === originalName) {
                return { ...img, blob: newBlob };
            }
            return img;
        });
    });
  };

  const handleColorUpdate = async (updatedImages: { name: string; blob: Blob }[]) => {
    try {
      const colorsPromise = getColorsFromImages(updatedImages);
      
      const descriptionPromise = (descriptionParts.length > 0)
        ? colorsPromise.then(newColors => {
            if (newColors.length > 0) {
              return updateDescriptionColor(descriptionParts, newColors);
            }
            return descriptionParts;
          })
        : Promise.resolve(descriptionParts);

      const [newColors, newDescriptionParts] = await Promise.all([colorsPromise, descriptionPromise]);
      
      setDescriptionParts(newDescriptionParts);
      setColors(newColors);

    } catch (err) {
      console.error("Error updating colors and description:", err);
      const errorMessage = err instanceof Error ? err.message : 'Wystąpił błąd podczas aktualizacji opisu na podstawie nowego koloru.';
      setError(errorMessage);
    }
  };

  const handleDimensionsChange = (axis: keyof ModelDimensions, valueInCm: number) => {
    if (!dimensions || isNaN(valueInCm)) return;
  
    const valueInMm = valueInCm * 10;
  
    setDimensions(prevDimensions => {
      if (!prevDimensions) return null;
      return {
        ...prevDimensions,
        [axis]: valueInMm,
      };
    });
  };

  const handleWeightChange = (newWeightKg: number) => {
    setWeight(newWeightKg);
    if (newWeightKg > 0) {
      calculatePrintCost(newWeightKg, costSettings);
    } else {
      setPrintCost(null);
    }
  };

  const handleEanChange = (newEan: string) => {
    setEan(newEan);
  };

  const handleGenerate = useCallback(async () => {
    if (!modelFile && imageFiles.length === 0) {
      setError('Proszę wgrać plik modelu 3D lub przynajmniej jedno zdjęcie.');
      return;
    }

    setIsLoading(true);
    // Keep additionalInfo, but reset everything else
    const currentAdditionalInfo = additionalInfo;
    resetState();
    setAdditionalInfo(currentAdditionalInfo);
    
    try {
      let filesToProcess: File[] = [];
      let modelFileForContext: File | null = null;
      let renderedImagesFromModel: File[] = []; // Store rendered images here temporarily

      // --- STEP 1: Process the 3D model file FIRST if it exists ---
      // This ensures we always get dimensions and weight, and have rendered images as a fallback.
      if (modelFile) {
        let modelToProcess: File = modelFile;

        // Handle ZIP archives for the model file
        if (modelFile.type.includes('zip') || modelFile.name.toLowerCase().endsWith('.zip')) {
            setLoadingMessage('Rozpakowywanie archiwum modelu 3D...');
            const zip = await JSZip.loadAsync(modelFile);
            const modelPromises: Promise<File>[] = [];

            // Fix: Explicitly type `zipEntry` as `any` to avoid "unknown" type errors in strict mode.
            zip.forEach((_: string, zipEntry: any) => {
                const isMacJunk = zipEntry.name.startsWith('__MACOSX/') || zipEntry.name.split('/').pop()?.startsWith('._');
                if (!zipEntry.dir && !isMacJunk && /\.(stl|3mf)$/i.test(zipEntry.name)) {
                    const promise = zipEntry.async('blob').then((blob: any) => {
                        const fileName = zipEntry.name.substring(zipEntry.name.lastIndexOf('/') + 1);
                        const fileType = fileName.toLowerCase().endsWith('.stl') ? 'model/stl' : 'model/3mf';
                        return new File([blob], fileName, { type: fileType });
                    });
                    modelPromises.push(promise);
                }
            });

            const extractedModels = await Promise.all(modelPromises);
            if (extractedModels.length === 0) {
                throw new Error("Archiwum ZIP nie zawiera żadnego obsługiwanego pliku modelu 3D (.stl, .3mf).");
            }
            modelToProcess = extractedModels[0];
        }
        
        modelFileForContext = modelToProcess; // The model itself will provide context to Gemini.

        // Render images and get metrics from the 3D model
        setLoadingMessage('Renderowanie modelu 3D i obliczanie wymiarów...');
        try {
            const { images, dimensions: modelDimensions, weight: modelWeight } = await generateImagesFromModel(modelToProcess);
            renderedImagesFromModel = images; // Save for potential use
            setDimensions(modelDimensions);
            setWeight(modelWeight);
            if (modelWeight) {
                calculatePrintCost(modelWeight, costSettings);
            }
        } catch (renderError) {
            throw new Error(`Nie udało się wczytać lub wyrenderować pliku modelu. Sprawdź, czy plik nie jest uszkodzony. Błąd: ${renderError instanceof Error ? renderError.message : String(renderError)}`);
        }
      }

      // --- STEP 2: Determine which images to send to the AI ---
      // Priority is given to user-uploaded images.
      if (imageFiles.length > 0) {
          setLoadingMessage('Analizowanie wgranych zdjęć...');
          
          const isSingleZip = imageFiles.length === 1 && (imageFiles[0].type.includes('zip') || imageFiles[0].name.toLowerCase().endsWith('.zip'));

          if (isSingleZip) {
              const zip = await JSZip.loadAsync(imageFiles[0]);
              const imagePromises: Promise<File>[] = [];
              // Fix: Explicitly type `zipEntry` as `any` to avoid "unknown" type errors.
              zip.forEach((_: string, zipEntry: any) => {
                  const isMacJunk = zipEntry.name.startsWith('__MACOSX/') || zipEntry.name.split('/').pop()?.startsWith('._');
                  if (!zipEntry.dir && !isMacJunk && /\.(jpe?g|png|gif|webp)$/i.test(zipEntry.name)) {
                      const promise = zipEntry.async('blob').then((blob: any) => {
                          const fileName = zipEntry.name.substring(zipEntry.name.lastIndexOf('/') + 1);
                          return new File([blob], fileName, { type: blob.type });
                      });
                      imagePromises.push(promise);
                  }
              });
              filesToProcess = await Promise.all(imagePromises);

              if (filesToProcess.length === 0) {
                  throw new Error("Archiwum ZIP nie zawiera żadnych obsługiwanych plików graficznych (jpg, png, gif, webp).");
              }
          } else {
              filesToProcess = imageFiles;
          }
          
          // If a model was processed, modelFileForContext is already set.
          // If not, we set it now in case a model file was provided but not processed (e.g., if it was a ZIP).
          if (!modelFileForContext && modelFile) {
            modelFileForContext = modelFile;
          }

      } else if (renderedImagesFromModel.length > 0) {
          // Fallback to using the images rendered from the 3D model.
          setLoadingMessage('Analizowanie wyrenderowanych zdjęć...');
          filesToProcess = renderedImagesFromModel;
      }
      
      // --- STEP 3: Generate Description ---
      if (filesToProcess.length === 0) {
        throw new Error("Brak zdjęć do przetworzenia. Wgraj zdjęcia lub plik modelu 3D.");
      }
      
      setLoadingMessage('Generowanie opisu i wybór zdjęć...');
      const { auctionTitle: generatedTitle, descriptionParts: generatedParts, selectedImageNames, sku: generatedSku, ean: generatedEan, colors: generatedColors } = await generateAllegroDescription(filesToProcess, modelFileForContext, additionalInfo);
      
      setAuctionTitle(generatedTitle);
      setDescriptionParts(generatedParts);
      setSku(generatedSku);
      setEan(generatedEan || '');
      setColors(generatedColors);
      
      let finalSelectedImageNames = selectedImageNames;

      // Fallback: If AI fails to return selected image names, use the first available images.
      if ((!finalSelectedImageNames || finalSelectedImageNames.length === 0) && filesToProcess.length > 0) {
        console.warn("AI did not return selected images. Falling back to the first available images (up to 4).");
        finalSelectedImageNames = filesToProcess.slice(0, 4).map(f => f.name);
      }

      if (finalSelectedImageNames && finalSelectedImageNames.length > 0) {
        const getBaseName = (path: string) => path.substring(path.lastIndexOf('/') + 1);
        const fileMap = new Map<string, File>(filesToProcess.map(file => [getBaseName(file.name).toLowerCase(), file]));

        const initialSelectedImages = finalSelectedImageNames
            .map(selectedName => {
                const file = fileMap.get(getBaseName(selectedName).toLowerCase());
                return file ? { name: file.name, blob: file as Blob } : null;
            })
            .filter((item): item is { name: string; blob: Blob } => !!item);

        let finalImages: { name: string; blob: Blob }[] = [];

        if (initialSelectedImages.length > 0) {
            const mainImage = initialSelectedImages[0];
            const otherSelectedImages = initialSelectedImages.slice(1);

            // 1. Generate the showcase image which includes a white background. This will be the main image.
            setLoadingMessage('Generowanie profesjonalnego zdjęcia produktowego...');
            try {
                const showcaseImageList = await generateAdditionalImages(mainImage.blob, generatedTitle, 1);
                if (showcaseImageList.length > 0) {
                    finalImages.push(showcaseImageList[0]); // Add showcase image first
                }
            } catch (genError) {
                console.warn('Nie udało się wygenerować zdjęcia-wizytówki.', genError);
                // Fallback: If showcase generation fails, create a simple white background version.
                setLoadingMessage('Generowanie zdjęcia-wizytówki nie powiodło się. Tworzenie prostego białego tła...');
                try {
                    const whiteBgBlob = await addWhiteBackground(mainImage.blob);
                    const whiteBgImage = {
                        name: `${mainImage.name.substring(0, mainImage.name.lastIndexOf('.')) || mainImage.name}_white_bg.png`,
                        blob: whiteBgBlob,
                    };
                    finalImages.push(whiteBgImage); // Add simple white BG image first
                } catch (fallbackError) {
                    console.error("Fallback for white background also failed.", fallbackError);
                }
            }

            // 2. Add the original version of the main image.
            finalImages.push(mainImage);

            // 3. Add other selected images, ensuring we don't exceed the limit.
            const remainingSlots = 4 - finalImages.length;
            if (remainingSlots > 0 && otherSelectedImages.length > 0) {
                finalImages.push(...otherSelectedImages.slice(0, remainingSlots));
            }
            
            setSelectedImages(finalImages.slice(0, 4)); // Final trim to ensure max 4 images
        }
      }

    } catch (err) {
      console.error(err);
      const errorMessage = err instanceof Error ? err.message : 'Wystąpił błąd podczas generowania opisu. Spróbuj ponownie.';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [modelFile, imageFiles, costSettings, additionalInfo]);

  const handleAnalyzeCost = async () => {
    if (!selectedImages[0] || !auctionTitle) {
      setCostAnalysisError("Nie można przeanalizować ceny bez zdjęcia głównego i tytułu.");
      setCostAnalysisStatus('error');
      return;
    }
    setCostAnalysisStatus('loading');
    setCostAnalysisError(null);
    try {
      const result = await analyzePricing(selectedImages[0].blob, auctionTitle);
      setCostAnalysisResult(result);
      setCostAnalysisStatus('success');
    } catch (err) {
      console.error(err);
      const errorMessage = err instanceof Error ? err.message : 'Wystąpił nieoczekiwany błąd podczas analizy cen.';
      setCostAnalysisError(errorMessage);
      setCostAnalysisStatus('error');
    }
  };
  
  const handleDownloadPackage = async () => {
    if (!selectedImages || !auctionTitle || descriptionParts.length === 0) return;

    setIsPackaging(true);

    try {
        const zip = new JSZip();

        // 1. Create folders for organization
        const sourceFolder = zip.folder("_ZRODLOWE");
        const generatedFolder = zip.folder("_WYGENEROWANE");

        // 2. Add source files
        if (modelFile) {
            sourceFolder.file(modelFile.name, modelFile);
        }
        if (imageFiles.length > 0) {
            for (const file of imageFiles) {
                sourceFolder.file(file.name, file);
            }
        }

        // 3. Add generated images
        for (const image of selectedImages) {
            generatedFolder.file(image.name, image.blob, { binary: true });
        }

        // 4. Add description file to the root
        const finalDescriptionParts = [...descriptionParts];
        
        let descriptionContent = `TYTUŁ AUKCJI:\n${auctionTitle}\n\n`;
        if (sku) descriptionContent += `SKU: ${sku}\n`;
        if (ean) descriptionContent += `EAN: ${ean}\n`;
        if (colors.length > 0) descriptionContent += `KOLORY: ${colors.join(', ')}\n`;
        if (dimensions) {
            descriptionContent += `WYMIARY (SxWxG): ${(dimensions.x / 10).toFixed(2)} x ${(dimensions.y / 10).toFixed(2)} x ${(dimensions.z / 10).toFixed(2)} cm\n`;
        }
        if (weight !== null) {
            descriptionContent += `SZAC. WAGA: ${weight.toFixed(3)} kg\n`;
        }
        descriptionContent += "========================================\n\n";
        finalDescriptionParts.forEach((part, index) => {
            descriptionContent += `PARAGRAF ${index + 1}:\n${part}\n\n`;
        });
        zip.file("opis_aukcji.txt", descriptionContent);

        // 5. Generate and download the zip
        const zipBlob = await zip.generateAsync({ type: "blob" });
        const url = URL.createObjectURL(zipBlob);
        const link = document.createElement('a');
        link.href = url;
        
        const fileName = ean || sku || auctionTitle.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').substring(0, 50) || "pakiet-aukcji";
        link.download = `${fileName}.zip`;
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

    } catch (err) {
        console.error("Błąd podczas tworzenia paczki ZIP:", err);
        setError("Nie udało się utworzyć paczki .zip. Spróbuj ponownie.");
    } finally {
        setIsPackaging(false);
    }
  };

  const handleExportClick = (platform: ExportPlatform) => {
    setExportPlatform(platform);
    setIsExportModalOpen(true);
    setExportStatus('idle');
    setExportError(null);
  };

  const handlePerformExport = async (credentials: any) => {
    if (!exportPlatform) return;
    
    setExportStatus('exporting');
    setExportError(null);
    
    const finalDescriptionParts = [...descriptionParts];

    const productData = {
        title: auctionTitle,
        description: finalDescriptionParts.join('<br /><br />'),
        descriptionParts: finalDescriptionParts, // Pass the array for BaseLinker
        images: selectedImages,
        sku: sku,
        ean: ean,
        condition: productCondition,
        dimensions: dimensions,
        weight: weight, // Add weight in KG
    };

    try {
        if (exportPlatform === 'woocommerce') {
            await exportToWooCommerce(credentials, productData);
        } else if (exportPlatform === 'baselinker') {
            await exportToBaseLinker(credentials as BaseLinkerCredentials, productData);
        }
        setExportStatus('success');
    } catch (err) {
        let errorMessage = err instanceof Error ? err.message : 'Wystąpił nieznany błąd podczas eksportu.';
        // Provide a more user-friendly message for the specific bad token error
        if (errorMessage.includes("ERROR_BAD_TOKEN") || errorMessage.includes("Invalid user token")) {
            errorMessage = `Błąd autoryzacji: Podany token API jest nieprawidłowy.\n\nProszę, sprawdź dokładnie poniższe punkty:\n1. Poprawność tokena: Upewnij się, że token został skopiowany z panelu BaseLinker w całości.\n2. Brak spacji: Sprawdź, czy na początku lub na końcu wklejonego tokena nie ma przypadkowych spacji (aplikacja próbuje je usuwać, ale warto to zweryfikować).\n3. Aktywny token: Upewnij się, że token jest aktywny na Twoim koncie BaseLinker.\n4. Uprawnienia: Token musi mieć uprawnienia do metod z grupy "Katalog produktów".`;
        }
        setExportError(errorMessage);
        setExportStatus('error');
    }
  };

  const isButtonDisabled = !modelFile && imageFiles.length === 0 || isLoading;
  const hasContent = auctionTitle || descriptionParts.length > 0 || selectedImages.length > 0;
  
  const getImageFileNamesText = () => {
    if (imageFiles.length === 0) return undefined;
    if (imageFiles.length === 1) return imageFiles[0].name;
    return `${imageFiles.length} plików wybrano`;
  }

  return (
    <div className="min-h-screen bg-slate-900 text-gray-200 flex flex-col items-center p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-5xl">
        <Header />
        <main className="relative mt-8 bg-slate-800/50 rounded-2xl shadow-2xl shadow-cyan-500/10 p-6 sm:p-8 backdrop-blur-sm border border-cyan-500/20">
          
          <div className="absolute top-4 right-4">
             <button
                onClick={() => setIsCostSettingsModalOpen(true)}
                className="p-2 rounded-full text-gray-400 hover:bg-slate-700 hover:text-cyan-300 transition-colors"
                title="Ustawienia kosztów wydruku"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924-1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="flex flex-col gap-6">
              <FileUpload 
                id="model-upload" 
                label="Wgraj plik modelu 3D" 
                accept=".stl,.3mf,.zip" 
                onChange={handleModelFileChange} 
                fileName={modelFile?.name} 
                icon={
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-14L4 7m0 0l8 4m-8-4v10l8 4" />
                    </svg>
                }
                helpText={modelHelpText}
              />
              <FileUpload 
                id="image-upload" 
                label="LUB wgraj zdjęcia" 
                accept="image/jpeg,image/png,image/gif,image/webp,.zip" 
                onChange={handleImageFileChange} 
                fileName={getImageFileNamesText()} 
                icon={
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                } 
                helpText={imageHelpText}
                multiple
              />
              <div className="flex flex-col gap-2">
                <label htmlFor="additional-info" className="text-md font-semibold text-gray-300">
                  Dodatkowe informacje do opisu (opcjonalnie)
                </label>
                <textarea
                  id="additional-info"
                  value={additionalInfo}
                  onChange={(e) => setAdditionalInfo(e.target.value)}
                  placeholder="Np. 'Produkt pasuje do modelu X i Y', 'Dostępne również w kolorze niebieskim', 'W zestawie znajdują się śruby montażowe'"
                  className="w-full h-24 p-3 bg-slate-900/70 border border-gray-700 rounded-lg text-gray-300 text-sm focus:ring-2 focus:ring-cyan-400 focus:outline-none resize-y"
                  disabled={isLoading}
                />
                <p className="text-xs text-gray-500">Wpisz kluczowe dane, które AI ma zawrzeć w opisie, np. kompatybilność, cechy specjalne, zawartość zestawu.</p>
              </div>
              <button
                onClick={handleGenerate}
                disabled={isButtonDisabled}
                className="w-full inline-flex items-center justify-center gap-3 px-6 py-4 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-lg shadow-lg shadow-cyan-500/30 transform transition-all duration-300 ease-in-out hover:scale-105 disabled:bg-gray-600 disabled:shadow-none disabled:cursor-not-allowed disabled:scale-100"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className={`h-6 w-6 ${isLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.293 2.293a1 1 0 01-1.414 1.414L12 6.414l-2.293 2.293a1 1 0 01-1.414-1.414L10 5m4 14l-2.293-2.293a1 1 0 00-1.414 1.414L12 17.586l2.293-2.293a1 1 0 00-1.414-1.414L14 19m-4-5a2 2 0 114 0 2 2 0 01-4 0z" /></svg>
                <span>{isLoading ? 'Generowanie...' : 'Generuj Opis i Zdjęcia'}</span>
              </button>
            </div>
            <div className="flex flex-col gap-6">
              <ImagePreview imageFile={imageFiles.length > 0 ? imageFiles[0] : modelFile} />
            </div>
          </div>

          {isLoading && <div className="mt-8"><Loader message={loadingMessage} /></div>}

          {error && (
            <div className="mt-6 p-4 bg-red-900/50 border border-red-700 text-red-300 rounded-lg text-center" role="alert">
              <p className="font-semibold">Wystąpił błąd</p>
              <p className="text-sm mt-1">{error}</p>
            </div>
          )}

          {hasContent && !isLoading && (
            <div className="mt-10 pt-8 border-t border-cyan-500/20 space-y-10">
              <DescriptionOutput 
                auctionTitle={auctionTitle} 
                descriptionParts={descriptionParts} 
                sku={sku} 
                ean={ean} 
                onEanChange={handleEanChange}
                colors={colors} 
                condition={productCondition} 
                dimensions={dimensions} 
                onDimensionsChange={handleDimensionsChange} 
                weight={weight}
                onWeightChange={handleWeightChange}
              />
              {selectedImages.length > 0 && <SelectedImagesPreview images={selectedImages} onImageUpdate={handleImageUpdate} onColorChange={handleColorUpdate} />}
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                {printCost && <PrintCostEstimator cost={printCost} />}
                {selectedImages.length > 0 && <CostAnalysis status={costAnalysisStatus} result={costAnalysisResult} error={costAnalysisError} onAnalyze={handleAnalyzeCost} />}
              </div>
              
              <div className="mt-8 pt-8 border-t border-cyan-500/20">
                <h3 className="text-xl font-semibold text-gray-200 mb-4">Pobierz lub wyślij</h3>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  <button 
                    onClick={handleDownloadPackage} 
                    disabled={isPackaging || selectedImages.length === 0}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-teal-600 hover:bg-teal-500 text-white font-bold rounded-lg shadow-lg shadow-teal-500/20 transition-all duration-300 disabled:bg-gray-500 disabled:cursor-not-allowed"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                    <span>{isPackaging ? 'Pakowanie...' : 'Pobierz paczkę .zip'}</span>
                  </button>
                  <button 
                    onClick={() => handleExportClick('baselinker')} 
                     disabled={selectedImages.length === 0}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg shadow-lg shadow-blue-500/20 transition-all disabled:bg-gray-500 disabled:cursor-not-allowed"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" /><path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" /></svg>
                    <span>Wyślij do BaseLinker</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
        
        {isExportModalOpen && (
          <ExportModal
            isOpen={isExportModalOpen}
            onClose={() => setIsExportModalOpen(false)}
            platform={exportPlatform!}
            onExport={handlePerformExport}
            status={exportStatus}
            error={exportError}
          />
        )}
        
        {isCostSettingsModalOpen && (
            <CostSettingsModal
                isOpen={isCostSettingsModalOpen}
                onClose={() => setIsCostSettingsModalOpen(false)}
                settings={costSettings}
                onSave={handleSaveCostSettings}
            />
        )}
      </div>
    </div>
  );
};