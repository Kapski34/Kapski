import React from 'react';

export const Header: React.FC = () => {
  return (
    <header className="text-center">
      <div className="flex items-center justify-center gap-3">
        <h1 className="text-4xl sm:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-teal-500">
          Generator Opisów Aukcji 3D
        </h1>
        <span className="text-xs font-bold text-cyan-400 bg-cyan-900/50 border border-cyan-700 rounded-full px-2 py-0.5">AI</span>
      </div>
      <p className="mt-3 text-lg text-gray-400 max-w-2xl mx-auto">
        Wgraj plik modelu 3D lub zdjęcie, aby AI wygenerowało profesjonalny opis produktu gotowy do wstawienia na Allegro.
      </p>
    </header>
  );
};
