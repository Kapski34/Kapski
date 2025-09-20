import React, { useState, useEffect } from 'react';
import { addWhiteBackground } from '../services/geminiService';

interface SelectedImagesPreviewProps {
  images: { name: string; blob: Blob }[];
  onImageUpdate: (originalName: string, newBlob: Blob) => void;
}

export const SelectedImagesPreview: React.FC<SelectedImagesPreviewProps> = ({ images, onImageUpdate }) => {
  const [downloadingImage, setDownloadingImage] = useState<string | null>(null);
  const [editingImage, setEditingImage] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    const newImageUrls: Record<string, string> = {};
    images.forEach(image => {
        // Create a temporary URL for each image blob to display it
        newImageUrls[image.name] = URL.createObjectURL(image.blob);
    });
    setImageUrls(newImageUrls);

    // Cleanup function: this will run when the component unmounts
    // or when the `images` prop changes, preventing memory leaks.
    return () => {
        Object.values(newImageUrls).forEach(url => URL.revokeObjectURL(url));
    };
  }, [images]);

  const handleDownload = async (image: { name: string; blob: Blob }) => {
    if (downloadingImage || editingImage) return;
    setDownloadingImage(image.name);

    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Nie można uzyskać kontekstu canvas.');
      }

      const img = new Image();
      const objectUrl = URL.createObjectURL(image.blob);

      await new Promise<void>((resolve, reject) => {
        img.onload = () => {
          URL.revokeObjectURL(objectUrl);
          resolve();
        };
        img.onerror = () => {
          URL.revokeObjectURL(objectUrl);
          reject(new Error(`Nie można załadować obrazu: ${image.name}`));
        };
        img.src = objectUrl;
      });

      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      ctx.drawImage(img, 0, 0);

      canvas.toBlob((pngBlob) => {
        if (!pngBlob) {
          console.error("Błąd podczas tworzenia pliku PNG.");
          setDownloadingImage(null);
          return;
        }

        const pngUrl = URL.createObjectURL(pngBlob);
        const link = document.createElement('a');
        link.href = pngUrl;
        
        const baseName = image.name.substring(0, image.name.lastIndexOf('.')) || image.name;
        link.download = `${baseName}_white_bg.png`;
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        URL.revokeObjectURL(pngUrl);
        setDownloadingImage(null);
      }, 'image/png', 1.0);

    } catch (error) {
        console.error("Błąd podczas konwersji obrazu do PNG:", error);
        setDownloadingImage(null);
    }
  };

  const handleAddWhiteBg = async (image: { name: string; blob: Blob }) => {
    if (editingImage || downloadingImage) return;
    setEditingImage(image.name);
    setEditError(null);
    try {
        const newBlob = await addWhiteBackground(image.blob);
        onImageUpdate(image.name, newBlob);
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Nie udało się dodać tła. Spróbuj ponownie.';
        setEditError(errorMessage);
        console.error(err);
    } finally {
        setEditingImage(null);
    }
  }

  return (
    <div className="w-full">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-4 gap-2">
        <h3 className="text-xl font-semibold text-gray-200">Wybrane Zdjęcia Produktu</h3>
      </div>
       <div className="mb-4 p-3 bg-gray-800 border border-cyan-700/50 text-cyan-200 rounded-lg text-sm flex items-start gap-3">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 flex-shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
          <p>Allegro wymaga, aby co najmniej jedno zdjęcie miało białe tło. Użyj przycisku 🪄, aby AI automatycznie je dodało.</p>
        </div>
        {editError && <div className="mb-4 p-3 bg-red-900/50 border border-red-700 text-red-300 rounded-lg text-center">{editError}</div>}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {images.map((image) => (
          <div key={image.name} className="relative group aspect-square bg-gray-900/50 rounded-lg overflow-hidden border border-gray-700">
            {imageUrls[image.name] && <img src={imageUrls[image.name]} alt={image.name} className="w-full h-full object-cover" />}
            
            {editingImage === image.name && (
                <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-center">
                    <svg className="animate-spin h-8 w-8 text-cyan-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <p className="mt-2 text-xs text-gray-300">Edytowanie...</p>
                </div>
            )}

            {!editingImage && (
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center gap-3">
                <button
                  onClick={() => handleAddWhiteBg(image)}
                  disabled={!!editingImage || !!downloadingImage}
                  className="p-3 rounded-full bg-purple-500/80 hover:bg-purple-500 text-white disabled:bg-gray-600 disabled:cursor-wait transition-all transform hover:scale-110"
                  aria-label={`Dodaj białe tło do ${image.name}`}
                  title="Dodaj białe tło"
                >
                    🪄
                </button>
                <button
                  onClick={() => handleDownload(image)}
                  disabled={!!downloadingImage || !!editingImage}
                  className="p-3 rounded-full bg-cyan-500/80 hover:bg-cyan-500 text-white disabled:bg-gray-600 disabled:cursor-wait transition-all transform hover:scale-110"
                  aria-label={`Pobierz ${image.name} jako PNG`}
                  title="Pobierz jako PNG"
                >
                  {downloadingImage === image.name ? (
                    <svg className="animate-spin h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                  )}
                </button>
              </div>
            )}

          </div>
        ))}
      </div>
    </div>
  );
};
