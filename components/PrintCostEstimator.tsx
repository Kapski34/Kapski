import React from 'react';
import { PrintCost } from '../App';

interface PrintCostEstimatorProps {
  cost: PrintCost | null;
}

const formatDuration = (hours: number): string => {
  if (hours <= 0) return "0 min";
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  
  let result = '';
  if (h > 0) {
    result += `${h}h `;
  }
  if (m > 0 || h === 0) {
    result += `${m}m`;
  }
  return result.trim();
}

export const PrintCostEstimator: React.FC<PrintCostEstimatorProps> = ({ cost }) => {
  if (!cost) {
    return null;
  }

  const tooltipText = `Szczegóły kalkulacji:\n- Czas druku: ${formatDuration(cost.estimatedTimeHours)}\n- Koszt filamentu: ${cost.filamentCost.toFixed(2)} zł\n- Koszt energii: ${cost.electricityCost.toFixed(2)} zł\n- Marża / inne: ${cost.marginCost.toFixed(2)} zł`;

  return (
    <div className="w-full">
      <h3 className="text-xl font-semibold text-gray-200 mb-4">
        Szacowany Koszt Wydruku
      </h3>
      <div 
        className="relative p-6 bg-slate-900/50 rounded-lg border border-gray-700 flex flex-col items-center justify-center text-center group cursor-help"
      >
        <p className="text-4xl font-bold text-cyan-300 tracking-tight">{cost.totalCost.toFixed(2)} zł</p>
        <p className="mt-1 text-sm text-gray-400">Całkowity koszt wytworzenia</p>
        
        {/* Custom Tooltip */}
        <div 
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-xs p-3 bg-gray-900 text-sm text-left text-gray-300 rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-10 whitespace-pre-line border border-gray-600"
          role="tooltip"
        >
          {tooltipText}
        </div>

        <div className="absolute top-2 right-2 opacity-50" aria-hidden="true">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-500" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
        </div>
      </div>
    </div>
  );
};