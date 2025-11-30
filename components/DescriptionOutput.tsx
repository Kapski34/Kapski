import React, { useState, useEffect } from 'react';
import { CopyableOutput } from './CopyableOutput';
import { ModelDimensions } from '../App';

interface DescriptionOutputProps {
  auctionTitle: string;
  descriptionParts: string[];
  sku: string;
  ean: string;
  onEanChange: (newEan: string) => void;
  colors: string[];
  condition: string;
  dimensions: ModelDimensions | null;
  weight: number | null;
  onDimensionsChange: (axis: keyof ModelDimensions, valueInCm: number) => void;
  onWeightChange: (weightInKg: number) => void;
  includeHiveId: boolean;
  onIncludeHiveIdChange: (checked: boolean) => void;
}

const descriptionLabels = ["Opis", "Opis dodatkowy 1", "Opis dodatkowy 2", "Opis dodatkowy 3"];

export const DescriptionOutput: React.FC<DescriptionOutputProps> = ({ auctionTitle, descriptionParts, sku, ean, onEanChange, colors, condition, dimensions, weight, onDimensionsChange, onWeightChange, includeHiveId, onIncludeHiveIdChange }) => {
  const hasContent = auctionTitle || descriptionParts.length > 0;

  const [widthCm, setWidthCm] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [depthCm, setDepthCm] = useState('');
  const [localWeightKg, setLocalWeightKg] = useState('');

  useEffect(() => {
    if (dimensions) {
      setWidthCm((dimensions.x / 10).toFixed(2));
      setHeightCm((dimensions.y / 10).toFixed(2));
      setDepthCm((dimensions.z / 10).toFixed(2));
    } else {
        setWidthCm('');
        setHeightCm('');
        setDepthCm('');
    }
  }, [dimensions]);
  
  useEffect(() => {
    setLocalWeightKg(weight !== null ? weight.toFixed(3) : '');
  }, [weight]);

  const handleDimensionBlur = (axis: keyof ModelDimensions, value: string) => {
    const numericValue = parseFloat(value);
    if (!isNaN(numericValue)) {
      onDimensionsChange(axis, numericValue);
    } else {
      // Revert if invalid input
      if (dimensions) {
        if (axis === 'x') setWidthCm((dimensions.x / 10).toFixed(2));
        if (axis === 'y') setHeightCm((dimensions.y / 10).toFixed(2));
        if (axis === 'z') setDepthCm((dimensions.z / 10).toFixed(2));
      }
    }
  };
  
  const handleWeightBlur = (value: string) => {
    const numericValue = parseFloat(value);
    if (!isNaN(numericValue) && numericValue >= 0) {
        onWeightChange(numericValue);
    } else {
        // Revert if invalid input
        setLocalWeightKg(weight !== null ? weight.toFixed(3) : '');
    }
  };


  if (!hasContent) {
    return null;
  }
    
  const formattedCondition = condition === 'new' ? 'Nowy' : (condition === 'used' ? 'Używany' : 'Odnowiony');

  return (
    <div className="w-full space-y-6">
        <h3 className="text-xl font-semibold text-gray-200">
            Nazwa i opisy
        </h3>

      {auctionTitle && (
        <CopyableOutput
          label="Nazwa produktu"
          content={auctionTitle}
          height="h-20"
        />
      )}
      
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {sku && (
            <CopyableOutput
            label="SKU"
            content={sku}
            height="h-20"
            />
        )}
        
        <CopyableOutput
          label="Stan"
          content={formattedCondition}
          height="h-20"
        />

        <div>
          <label htmlFor="ean-input" className="block text-md font-semibold text-gray-300 mb-2">EAN (GTIN)</label>
          <input
            id="ean-input"
            type="text"
            value={ean}
            onChange={(e) => onEanChange(e.target.value)}
            placeholder="Wprowadź oficjalny kod EAN"
            className="w-full p-3 bg-slate-900/70 border border-gray-700 rounded-lg text-gray-300 font-mono text-sm focus:ring-2 focus:ring-cyan-400 focus:outline-none"
          />
        </div>

        {colors.length > 0 && (
            <CopyableOutput
                label="Wymagane kolory"
                content={colors.join(', ')}
                height="h-20"
            />
        )}


        {dimensions && (
          <>
            <div>
              <label htmlFor="width-input" className="block text-md font-semibold text-gray-300 mb-2">Szerokość (cm)</label>
              <input
                id="width-input"
                type="number"
                step="0.01"
                value={widthCm}
                onChange={(e) => setWidthCm(e.target.value)}
                onBlur={() => handleDimensionBlur('x', widthCm)}
                className="w-full p-3 bg-slate-900/70 border border-gray-700 rounded-lg text-gray-300 font-mono text-sm focus:ring-2 focus:ring-cyan-400 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="height-input" className="block text-md font-semibold text-gray-300 mb-2">Wysokość (cm)</label>
              <input
                id="height-input"
                type="number"
                step="0.01"
                value={heightCm}
                onChange={(e) => setHeightCm(e.target.value)}
                onBlur={() => handleDimensionBlur('y', heightCm)}
                className="w-full p-3 bg-slate-900/70 border border-gray-700 rounded-lg text-gray-300 font-mono text-sm focus:ring-2 focus:ring-cyan-400 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="depth-input" className="block text-md font-semibold text-gray-300 mb-2">Głębokość (cm)</label>
              <input
                id="depth-input"
                type="number"
                step="0.01"
                value={depthCm}
                onChange={(e) => setDepthCm(e.target.value)}
                onBlur={() => handleDimensionBlur('z', depthCm)}
                className="w-full p-3 bg-slate-900/70 border border-gray-700 rounded-lg text-gray-300 font-mono text-sm focus:ring-2 focus:ring-cyan-400 focus:outline-none"
              />
            </div>
          </>
        )}

         <div>
          <label htmlFor="weight-input" className="block text-md font-semibold text-gray-300 mb-2">Szacowana waga (kg)</label>
          <input
            id="weight-input"
            type="number"
            step="0.001"
            value={localWeightKg}
            onChange={(e) => setLocalWeightKg(e.target.value)}
            onBlur={() => handleWeightBlur(localWeightKg)}
            className="w-full p-3 bg-slate-900/70 border border-gray-700 rounded-lg text-gray-300 font-mono text-sm focus:ring-2 focus:ring-cyan-400 focus:outline-none"
          />
        </div>
      </div>


      {descriptionParts.map((part, index) => {
          let action: React.ReactNode | null = null;
          let finalContent = part;

          if (index === 3) { // "Opis dodatkowy 3"
              action = (
                  <div className="flex items-center gap-2 text-sm text-gray-400">
                      <input
                          type="checkbox"
                          id="hive-id-checkbox"
                          checked={includeHiveId}
                          onChange={(e) => onIncludeHiveIdChange(e.target.checked)}
                          className="h-4 w-4 rounded bg-gray-800 border-gray-600 text-cyan-600 focus:ring-cyan-500 cursor-pointer"
                      />
                      <label htmlFor="hive-id-checkbox" className="cursor-pointer select-none">
                          Dołącz Hive ID
                      </label>
                  </div>
              );

              if (includeHiveId) {
                  finalContent = `${part}\n\nHive ID: R256CX12EK`;
              }
          }

          return (
              <CopyableOutput
                  key={index}
                  label={descriptionLabels[index] || `Paragraf ${index + 1}`}
                  content={finalContent}
                  height="h-32"
                  action={action}
              />
          );
      })}
    </div>
  );
};