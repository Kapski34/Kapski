
import React, { useState, useEffect } from 'react';
import { addWhiteBackground, changeImageColor } from '../services/geminiService';

interface SelectedImagesPreviewProps {
  images: { name: string; blob: Blob }[];
  onImageUpdate: (originalName: string, newBlob: Blob) => void;
  onColorChange: (updatedImages: { name: string; blob: Blob }[]) => Promise<void>;
  onRegenerate?: (index: number) => Promise<void>;
}

const BASIC_COLORS = [
  { name: 'Czarny', hex: '#222222' },
  { name: 'Biały', hex: '#FFFFFF' },
  { name: 'Szary', hex: '#808080' },
  { name: 'Czerwony', hex: '#D92323' },
  { name: 'Niebieski', hex: '#1E40AF' },
  { name: 'Zielony', hex: '#166534' },
  { name: 'Żółty', hex: '#EAB308' },
  { name: 'Pomarańczowy', hex: '#F97316' },
  { name: 'Fioletowy', hex: '#7E22CE' },
  { name: 'Brązowy', hex: '#78350F' },
  { name: 'Srebrny', hex: '#C0C0C0' },
  { name: 'Złoty', hex: '#E5B124' },
  { name: 'Różowy', hex: '#EC4899' },
  { name: 'Morski', hex: '#14B8A6' },
  { name: 'Limonkowy', hex: '#84CC16' },
  { name: 'Błękitny', hex: '#38BDF8' },
];

export const SelectedImagesPreview: React.FC<SelectedImagesPreviewProps> = ({ images, onImageUpdate, onColorChange, onRegenerate }) => {
  const [downloadingImage, setDownloadingImage] = useState<string | null>(null);
  const [processingImages, setProcessingImages] = useState<string[]>([]);
  const [editError, setEditError] = useState<string | null>(null);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});

  const [colorReplaceState, setColorReplaceState] = useState<{
    stage: 'selecting-source' | 'selecting-target';
    imageName: string;
    sourceColor?: string;
  } | null>(null);
  
  const [applyToAll, setApplyToAll] = useState(true);

  useEffect(() => {
    const newImageUrls: Record<string, string> = {};
    images.forEach(image => {
        newImageUrls[image.name] = URL.createObjectURL(image.blob);
    });
    setImageUrls(newImageUrls);

    return () => {
        Object.values(newImageUrls).forEach(url => URL.revokeObjectURL(url));
    };
  }, [images]);

  const handleDownload = async (image: { name: string; blob: Blob }) => {
    if (processingImages.length > 0 || downloadingImage || colorReplaceState) return;
    setDownloadingImage(image.name);
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Nie można uzyskać kontekstu canvas.');
      const img = new Image();
      img.crossOrigin = "anonymous"; // v60: Fix dla CORS przy pobieraniu
      
      const objectUrl = URL.createObjectURL(image.blob);
      await new Promise<void>((resolve, reject) => {
        img.onload = () => { URL.revokeObjectURL(objectUrl); resolve(); };
        img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error(`Nie można załadować obrazu`)); };
        img.src = objectUrl;
      });

      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      ctx.drawImage(img, 0, 0);
      
      canvas.toBlob((pngBlob) => {
        if (!pngBlob) { setDownloadingImage(null); return; }
        const pngUrl = URL.createObjectURL(pngBlob);
        const link = document.createElement('a');
        link.href = pngUrl;
        const baseName = image.name.substring(0, image.name.lastIndexOf('.')) || image.name;
        link.download = `${baseName}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(pngUrl);
        setDownloadingImage(null);
      }, 'image/png', 1.0);
    } catch (error) { 
        setDownloadingImage(null);
        setEditError("Błąd pobierania zdjęcia.");
    }
  };

  const handleAddWhiteBg = async (image: { name: string; blob: Blob }) => {
    if (processingImages.length > 0 || downloadingImage || colorReplaceState) return;
    setProcessingImages([image.name]);
    setEditError(null);
    try {
        const newBlob = await addWhiteBackground(image.blob);
        onImageUpdate(image.name, newBlob);
    } catch (err) {
        setEditError('Nie udało się dodać tła.');
    } finally {
        setProcessingImages([]);
    }
  }

  const handleRegenerate = async (index: number, imageName: string) => {
    if (!onRegenerate || processingImages.length > 0 || downloadingImage || colorReplaceState) return;
    setProcessingImages([imageName]);
    try {
        await onRegenerate(index);
    } catch (err) {
        setEditError('Nie udało się zregenerować zdjęcia.');
    } finally {
        setProcessingImages([]);
    }
  };

  const handleInitiateColorReplace = (imageName: string) => {
    if (processingImages.length > 0 || downloadingImage) return;
    setColorReplaceState({ stage: 'selecting-source', imageName: imageName });
  };

  const handleSourceColorSelect = async (event: React.MouseEvent<HTMLImageElement>, image: { name: string; blob: Blob }) => {
    if (!colorReplaceState || colorReplaceState.stage !== 'selecting-source' || colorReplaceState.imageName !== image.name) return;
    const imgElement = event.currentTarget;
    const canvas = document.createElement('canvas');
    canvas.width = imgElement.naturalWidth;
    canvas.height = imgElement.naturalHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(imgElement, 0, 0, imgElement.naturalWidth, imgElement.naturalHeight);
    const rect = imgElement.getBoundingClientRect();
    const naturalWidth = imgElement.naturalWidth;
    const naturalHeight = imgElement.naturalHeight;
    const clientWidth = rect.width;
    const clientHeight = rect.height;
    const naturalRatio = naturalWidth / naturalHeight;
    const clientRatio = clientWidth / clientHeight;
    let renderedWidth, renderedHeight, offsetX = 0, offsetY = 0;
    if (naturalRatio > clientRatio) {
        renderedHeight = clientHeight;
        renderedWidth = renderedHeight * naturalRatio;
        offsetX = (clientWidth - renderedWidth) / 2;
    } else {
        renderedWidth = clientWidth;
        renderedHeight = renderedWidth / naturalRatio;
        offsetY = (clientHeight - renderedHeight) / 2;
    }
    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;
    if (clickX < offsetX || clickX > offsetX + renderedWidth || clickY < offsetY || clickY > offsetY + renderedHeight) return;
    const relativeX = clickX - offsetX;
    const relativeY = clickY - offsetY;
    const canvasX = (relativeX / renderedWidth) * naturalWidth;
    const canvasY = (relativeY / renderedHeight) * naturalHeight;
    const pixel = ctx.getImageData(canvasX, canvasY, 1, 1).data;
    const toHex = (c: number) => ('0' + c.toString(16)).slice(-2);
    const sourceColorHex = `#${toHex(pixel[0])}${toHex(pixel[1])}${toHex(pixel[2])}`;
    setColorReplaceState({ ...colorReplaceState, stage: 'selecting-target', sourceColor: sourceColorHex });
  };
  
  const handleApplyColorChange = async (newTargetColor: string) => {
    const sourceColor = colorReplaceState?.sourceColor;
    const initiatingImageName = colorReplaceState?.imageName;
    if (!sourceColor || !initiatingImageName || processingImages.length > 0) return;
    const imagesToProcess = applyToAll ? images : images.filter(img => img.name === initiatingImageName);
    setProcessingImages(imagesToProcess.map(img => img.name));
    setColorReplaceState(null);
    try {
        const updatePromises = imagesToProcess.map(image => changeImageColor(image.blob, sourceColor, newTargetColor).then(newBlob => ({ name: image.name, blob: newBlob, status: 'fulfilled' as const })).catch(error => ({ name: image.name, error, status: 'rejected' as const })));
        const results = await Promise.all(updatePromises);
        const successfulUpdates = results.filter((r): r is { name: string; blob: Blob; status: 'fulfilled' } => r.status === 'fulfilled');
        const updatedBlobs = new Map<string, Blob>();
        successfulUpdates.forEach(update => { updatedBlobs.set(update.name, update.blob); onImageUpdate(update.name, update.blob); });
        if (successfulUpdates.length > 0) {
            const nextImagesState = images.map(img => { const updatedBlob = updatedBlobs.get(img.name); return updatedBlob ? { ...img, blob: updatedBlob } : img; });
            await onColorChange(nextImagesState);
        }
    } catch (err) { setEditError('Wystąpił błąd podczas zmiany kolorów.'); } finally { setProcessingImages([]); }
  };

  return (
    <div className="w-full">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-4 gap-2">
        <h3 className="text-xl font-semibold text-gray-200">Wybrane Zdjęcia Produktu</h3>
      </div>
       <div className="mb-4 p-3 bg-gray-800 border border-cyan-700/50 text-cyan-200 rounded-lg text-sm flex items-start gap-3">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 flex-shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" /></svg>
          <p>Użyj przycisków akcji, aby dodać białe tło (🪄), zmienić kolor obiektu (🎨), regenerować zdjęcie (🔄) lub pobrać obraz (⬇️).</p>
        </div>
        {editError && <div className="mb-4 p-3 bg-red-900/50 border border-red-700 text-red-300 rounded-lg text-center">{editError}</div>}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {images.map((image, index) => {
          const isSelectingSource = colorReplaceState?.stage === 'selecting-source' && colorReplaceState.imageName === image.name;
          const isSelectingTarget = colorReplaceState?.stage === 'selecting-target' && colorReplaceState.imageName === image.name;
          const isProcessing = processingImages.includes(image.name);

          return (
            <div key={image.name} className="relative group aspect-square bg-gray-900/50 rounded-lg overflow-hidden border border-gray-700">
              {imageUrls[image.name] && 
                <img 
                  src={imageUrls[image.name]} 
                  alt={image.name} 
                  className={`w-full h-full object-contain p-1 ${isSelectingSource ? 'cursor-crosshair' : ''}`}
                  onClick={(e) => handleSourceColorSelect(e, image)}
                  crossOrigin="anonymous" 
                />}
              
              {isProcessing && (
                  <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-center">
                      <svg className="animate-spin h-8 w-8 text-cyan-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                      <p className="mt-2 text-xs text-gray-300">Przetwarzanie...</p>
                  </div>
              )}
              
              {isSelectingSource && (
                <>
                  <div className="absolute top-2 left-2 bg-black/70 text-white text-xs font-semibold px-3 py-1.5 rounded-md pointer-events-none z-10">Kliknij kolor</div>
                  <button type="button" onClick={() => setColorReplaceState(null)} className="absolute top-2 right-2 bg-gray-800/80 hover:bg-gray-700 text-white text-xs font-bold px-3 py-1.5 rounded-md z-10">Anuluj</button>
                </>
              )}

              {isSelectingTarget && colorReplaceState.sourceColor && (
                  <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center p-3 z-10 gap-2">
                      <div className="flex items-center gap-2">
                          <div className="w-5 h-5 rounded-full border border-white" style={{ backgroundColor: colorReplaceState.sourceColor }}></div>
                          <span className="text-sm text-gray-400">→</span>
                      </div>
                      <div className="grid grid-cols-8 gap-1.5 my-1">
                          {BASIC_COLORS.map(color => (
                              <button key={color.hex} title={color.name} type="button" onClick={() => handleApplyColorChange(color.hex)} className="w-6 h-6 rounded-full border border-gray-400 hover:border-white transition-transform transform hover:scale-110" style={{ backgroundColor: color.hex }} />
                          ))}
                      </div>
                      <button type="button" onClick={() => setColorReplaceState(null)} className="mt-1 px-3 py-1 text-xs font-bold text-white bg-gray-600 rounded-md">Anuluj</button>
                  </div>
              )}

              {!isProcessing && !colorReplaceState && (
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center gap-2">
                  <button onClick={() => handleInitiateColorReplace(image.name)} className="p-2 rounded-full bg-orange-500/80 hover:bg-orange-500 text-white" title="Kolor"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" /></svg></button>
                  <button onClick={() => handleAddWhiteBg(image)} className="p-2 rounded-full bg-purple-500/80 hover:bg-purple-500 text-white" title="Tło">🪄</button>
                  {onRegenerate && (
                    <button onClick={() => handleRegenerate(index, image.name)} className="p-2 rounded-full bg-blue-500/80 hover:bg-blue-500 text-white" title="Regeneruj">🔄</button>
                  )}
                  <button onClick={() => handleDownload(image)} className="p-2 rounded-full bg-cyan-500/80 hover:bg-cyan-500 text-white" title="Pobierz">
                    {downloadingImage === image.name ? <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> : <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>}
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  );
};
