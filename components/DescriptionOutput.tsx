import React from 'react';
import { CopyableOutput } from './CopyableOutput';
import { ModelDimensions } from '../App';

interface DescriptionOutputProps {
  auctionTitle: string;
  descriptionParts: string[];
  sku: string;
  ean: string;
  colors: string[];
  condition: string;
  dimensions: ModelDimensions | null;
  weight: number | null;
}

const descriptionLabels = ["Opis", "Opis dodatkowy 1", "Opis dodatkowy 2", "Opis dodatkowy 3"];

export const DescriptionOutput: React.FC<DescriptionOutputProps> = ({ auctionTitle, descriptionParts, sku, ean, colors, condition, dimensions, weight }) => {
  const hasContent = auctionTitle || descriptionParts.length > 0;

  if (!hasContent) {
    return null;
  }
    
  const formattedWeightKg = weight !== null ? weight.toFixed(3) : '';
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

        {ean !== undefined && (
            <CopyableOutput
                label="EAN"
                content={ean}
                height="h-20"
            />
        )}

        {colors.length > 0 && (
            <CopyableOutput
                label="Wymagane kolory"
                content={colors.join(', ')}
                height="h-20"
            />
        )}


        {dimensions && (
          <>
            <CopyableOutput
                label="Szerokość (cm)"
                content={(dimensions.x / 10).toFixed(2)}
                height="h-20"
            />
             <CopyableOutput
                label="Wysokość (cm)"
                content={(dimensions.y / 10).toFixed(2)}
                height="h-20"
            />
             <CopyableOutput
                label="Głębokość (cm)"
                content={(dimensions.z / 10).toFixed(2)}
                height="h-20"
            />
          </>
        )}

        <CopyableOutput
            label="Szacowana waga (kg)"
            content={formattedWeightKg}
            height="h-20"
        />
      </div>


      {descriptionParts.map((part, index) => (
          <CopyableOutput
              key={index}
              label={descriptionLabels[index] || `Paragraf ${index + 1}`}
              content={part}
              height="h-32"
          />
      ))}
    </div>
  );
};
