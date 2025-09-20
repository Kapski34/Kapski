import React, { useState, useEffect } from 'react';

interface ImagePreviewProps {
  imageFile: File | null;
}

export const ImagePreview: React.FC<ImagePreviewProps> = ({ imageFile }) => {
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    if (imageFile && imageFile.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (isMounted) {
          setImageUrl(reader.result as string);
        }
      };
      reader.readAsDataURL(imageFile);
    } else {
      setImageUrl(null);
    }
    return () => {
      isMounted = false;
      if (imageUrl) {
        // Clean up the object URL to prevent memory leaks
        URL.revokeObjectURL(imageUrl);
      }
    };
  }, [imageFile]);
  
  const renderContent = () => {
    if (imageUrl) {
        return <img src={imageUrl} alt="Podgląd produktu" className="w-full h-full object-cover" />;
    }
    
    // Handle non-image files like ZIP or 3D models
    if (imageFile) {
        const isZip = imageFile.name.toLowerCase().endsWith('.zip') || imageFile.type.includes('zip');
        const is3dModel = imageFile.name.toLowerCase().endsWith('.stl') || imageFile.name.toLowerCase().endsWith('.3mf');
        
        let icon: React.ReactNode;
        let title: string = "Wybrano plik";

        if (isZip) {
            title = "Wybrano archiwum";
            icon = (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                </svg>
            );
        } else if (is3dModel) {
            title = "Wybrano model 3D";
            icon = (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                   <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-14L4 7m0 0l8 4m-8-4v10l8 4" />
                </svg>
            );
        }

        return (
            <div className="text-center text-gray-400 p-4 flex flex-col items-center justify-center">
                {icon}
                <p className="mt-2 text-sm font-semibold">{title}</p>
                <p className="mt-1 text-xs text-gray-500 break-all">{imageFile.name}</p>
            </div>
        );
    }

    // Default placeholder
    return (
      <div className="text-center text-gray-500">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <p className="mt-2">Podgląd zdjęcia lub modelu</p>
      </div>
    );
  };

  return (
    <div className="w-full aspect-square bg-slate-900/50 rounded-xl flex items-center justify-center border border-gray-700 overflow-hidden">
      {renderContent()}
    </div>
  );
};
