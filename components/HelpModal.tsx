import React from 'react';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-2xl shadow-2xl border border-cyan-500/30 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-slate-800 border-b border-cyan-500/20 p-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-teal-500">
            Co potrafię?
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors p-2 hover:bg-slate-700 rounded-lg"
            aria-label="Zamknij"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-6 text-gray-300">
          <div className="bg-gradient-to-r from-cyan-500/10 to-teal-500/10 border border-cyan-500/20 rounded-lg p-4">
            <p className="text-lg leading-relaxed">
              Jestem <strong className="text-cyan-400">inteligentnym generatorem opisów produktów 3D</strong> stworzonym specjalnie dla sprzedawców na Allegro. Pomagam w automatycznym tworzeniu profesjonalnych opisów aukcji na podstawie plików modeli 3D lub zdjęć produktów.
            </p>
          </div>

          <div>
            <h3 className="text-xl font-semibold text-cyan-400 mb-4 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Moje główne funkcje:
            </h3>
            <ul className="space-y-3">
              <li className="flex items-start gap-3">
                <span className="text-cyan-400 mt-1">•</span>
                <div>
                  <strong className="text-white">Generowanie opisów na podstawie modeli 3D</strong>
                  <p className="text-sm text-gray-400 mt-1">Wgraj plik .STL lub .3MF, a automatycznie wygeneruję profesjonalny, 4-akapitowy opis produktu zoptymalizowany pod kątem sprzedaży.</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-cyan-400 mt-1">•</span>
                <div>
                  <strong className="text-white">Analiza zdjęć produktów</strong>
                  <p className="text-sm text-gray-400 mt-1">Możesz wgrać do 4 zdjęć (JPG, PNG, GIF, WEBP) lub archiwum ZIP ze zdjęciami, a ja stworzę opis na ich podstawie.</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-cyan-400 mt-1">•</span>
                <div>
                  <strong className="text-white">Automatyczne renderowanie modeli 3D</strong>
                  <p className="text-sm text-gray-400 mt-1">Jeśli wgrasz model 3D, automatycznie go wyrenderuję z różnych perspektyw, tworząc atrakcyjne zdjęcia produktowe.</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-cyan-400 mt-1">•</span>
                <div>
                  <strong className="text-white">Obliczanie wymiarów i wagi</strong>
                  <p className="text-sm text-gray-400 mt-1">Automatycznie wyciągam wymiary (szerokość, wysokość, głębokość) i szacuję wagę produktu z pliku modelu 3D.</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-cyan-400 mt-1">•</span>
                <div>
                  <strong className="text-white">Generowanie zdjęć produktowych</strong>
                  <p className="text-sm text-gray-400 mt-1">Tworzę profesjonalne zdjęcie-wizytówkę produktu na białym tle, idealne jako główne zdjęcie aukcji.</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-cyan-400 mt-1">•</span>
                <div>
                  <strong className="text-white">Inteligentny wybór najlepszych zdjęć</strong>
                  <p className="text-sm text-gray-400 mt-1">Z wielu wgranych lub wygenerowanych zdjęć automatycznie wybieram te najlepsze do prezentacji produktu.</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-cyan-400 mt-1">•</span>
                <div>
                  <strong className="text-white">Generowanie SKU i EAN</strong>
                  <p className="text-sm text-gray-400 mt-1">Automatycznie tworzę unikalne kody produktu (SKU) oraz kod kreskowy EAN-13, jeśli nie jest dostępny w produkcie.</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-cyan-400 mt-1">•</span>
                <div>
                  <strong className="text-white">Rozpoznawanie kolorów</strong>
                  <p className="text-sm text-gray-400 mt-1">Identyfikuję kolory produktu na podstawie zdjęć lub renderów modelu 3D.</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-cyan-400 mt-1">•</span>
                <div>
                  <strong className="text-white">Analiza cen konkurencji</strong>
                  <p className="text-sm text-gray-400 mt-1">Analizuję podobne produkty i sugeruję optymalny zakres cenowy dla Twojego produktu.</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-cyan-400 mt-1">•</span>
                <div>
                  <strong className="text-white">Kalkulator kosztów wydruku 3D</strong>
                  <p className="text-sm text-gray-400 mt-1">Obliczam szacunkowe koszty wydruku, uwzględniając cenę filamentu, czas druku, zużycie energii i marżę.</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-cyan-400 mt-1">•</span>
                <div>
                  <strong className="text-white">Edycja wymiarów produktu</strong>
                  <p className="text-sm text-gray-400 mt-1">Możesz ręcznie dostosować wymiary produktu, jeśli automatyczne obliczenia wymagają korekty.</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-cyan-400 mt-1">•</span>
                <div>
                  <strong className="text-white">Pakowanie do pobrania</strong>
                  <p className="text-sm text-gray-400 mt-1">Tworzę kompletną paczkę ZIP zawierającą: opis aukcji, wygenerowane zdjęcia oraz źródłowe pliki.</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-cyan-400 mt-1">•</span>
                <div>
                  <strong className="text-white">Eksport do BaseLinker</strong>
                  <p className="text-sm text-gray-400 mt-1">Bezpośredni eksport produktu do systemu BaseLinker, ułatwiający zarządzanie sprzedażą wielokanałową.</p>
                </div>
              </li>
            </ul>
          </div>

          <div className="bg-teal-500/10 border border-teal-500/20 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-teal-400 mb-2 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              Dodatkowe informacje
            </h3>
            <p className="text-sm text-gray-400">
              Możesz wpisać dodatkowe informacje w dedykowanym polu tekstowym, np. szczegóły dotyczące kompatybilności, cechy specjalne czy zawartość zestawu. AI uwzględni te dane w generowanym opisie.
            </p>
          </div>

          <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-cyan-400 mb-2 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
              </svg>
              Wsparcie dla różnych formatów
            </h3>
            <ul className="text-sm text-gray-400 space-y-1">
              <li>• <strong>Modele 3D:</strong> STL, 3MF, ZIP (zawierający model)</li>
              <li>• <strong>Zdjęcia:</strong> JPG, PNG, GIF, WEBP, ZIP (zawierający zdjęcia)</li>
              <li>• <strong>Maksymalna liczba zdjęć:</strong> 4 zdjęcia na raz</li>
            </ul>
          </div>
        </div>

        <div className="sticky bottom-0 bg-slate-800 border-t border-cyan-500/20 p-6">
          <button
            onClick={onClose}
            className="w-full px-6 py-3 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-lg shadow-lg shadow-cyan-500/30 transition-all duration-300"
          >
            Zamknij
          </button>
        </div>
      </div>
    </div>
  );
};
