import React from 'react';

interface HeaderProps {
  onHelpClick?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onHelpClick }) => {
  return (
    <header className="text-center relative">
      <div className="flex items-center justify-center gap-3">
        <h1 className="text-4xl sm:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-teal-500">
          Generator Opisów Aukcji 3D
        </h1>
        <span className="text-xs font-bold text-cyan-400 bg-cyan-900/50 border border-cyan-700 rounded-full px-2 py-0.5">AI</span>
      </div>
      <p className="mt-3 text-lg text-gray-400 max-w-2xl mx-auto">
        Wgraj plik modelu 3D lub zdjęcie, aby AI wygenerowało profesjonalny opis produktu gotowy do wstawienia na Allegro.
      </p>
      {onHelpClick && (
        <button
          onClick={onHelpClick}
          className="absolute top-0 right-0 p-2 text-cyan-400 hover:text-cyan-300 hover:bg-slate-800/50 rounded-lg transition-colors group"
          title="Co potrafię?"
          aria-label="Pomoc - Co potrafię?"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="absolute -bottom-8 right-0 text-xs text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
            Co potrafię?
          </span>
        </button>
      )}
    </header>
  );
};
