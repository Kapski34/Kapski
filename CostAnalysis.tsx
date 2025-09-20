import React from 'react';

type Status = 'idle' | 'loading' | 'success' | 'error';

export interface CostAnalysisResult {
  products: {
    productTitle: string;
    pricePln: string;
    productUrl: string;
  }[];
}

interface CostAnalysisProps {
  status: Status;
  result: CostAnalysisResult | null;
  error: string | null;
  onAnalyze: () => void;
}

export const CostAnalysis: React.FC<CostAnalysisProps> = ({ status, result, error, onAnalyze }) => {

  const renderContent = () => {
    switch (status) {
      case 'loading':
        return (
          <div className="flex flex-col items-center justify-center text-center p-4">
            <svg className="animate-spin h-8 w-8 text-cyan-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p className="mt-3 text-sm text-gray-400">Wyszukiwanie podobnych ofert na Allegro...</p>
          </div>
        );
      case 'success':
        if (!result || result.products.length === 0) return (
            <p className="text-center text-gray-400">Nie znaleziono podobnych produktów.</p>
        );
        return (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-gray-400 mb-2">Przykładowe oferty znalezione przez AI:</p>
            <ul className="divide-y divide-gray-700/50">
              {result.products.map((product, index) => (
                <li key={index} className="flex justify-between items-start gap-4 py-3">
                  <a 
                    href={product.productUrl} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="text-sm text-gray-300 flex-1 hover:text-cyan-400 hover:underline transition-colors"
                  >
                    {product.productTitle}
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 inline-block ml-1 opacity-70" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
                      <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
                    </svg>
                  </a>
                  <p className="text-md font-bold text-cyan-400 whitespace-nowrap">{product.pricePln}</p>
                </li>
              ))}
            </ul>
          </div>
        );
      case 'error':
        return (
            <div className="p-4 bg-red-900/50 border border-red-700 text-red-300 rounded-lg text-center">
              <p className="font-semibold">Błąd analizy</p>
              <p className="text-sm">{error}</p>
              <button onClick={onAnalyze} className="mt-3 px-3 py-1.5 text-xs font-medium rounded-md bg-red-700 hover:bg-red-600 text-white">
                Spróbuj ponownie
              </button>
            </div>
        );
      case 'idle':
      default:
        return (
          <div className="text-center">
            <button
              onClick={onAnalyze}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-3 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg shadow-lg shadow-indigo-500/20 transform transition-all duration-300 ease-in-out hover:scale-105 focus:outline-none focus:ring-4 focus:ring-indigo-300"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" /></svg>
              Sprawdź Podobne Oferty
            </button>
             <p className="mt-3 text-xs text-gray-500">AI przeanalizuje zdjęcie i tytuł, aby znaleźć podobne oferty na Allegro.</p>
          </div>
        );
    }
  };

  return (
    <div className="w-full">
      <h3 className="text-xl font-semibold text-gray-200 mb-4">
        Przykładowe Ceny z Allegro
      </h3>
      <div className="p-6 bg-slate-900/50 rounded-lg border border-gray-700">
        {renderContent()}
      </div>
    </div>
  );
};
