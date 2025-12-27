import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { AuthModal } from './AuthModal';
import { TokenStore } from './TokenStore';

export const Header: React.FC = () => {
  const { user, userData, logout } = useAuth();
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isStoreOpen, setIsStoreOpen] = useState(false);

  return (
    <>
    <header className="w-full mb-8 flex flex-col">
       {/* User Controls - Pasek na samej górze, wyrównany do prawej */}
       <div className="w-full flex justify-end items-center gap-3 mb-4 min-h-[40px]">
            {user ? (
                <div className="flex items-center gap-3 bg-slate-900/80 p-1.5 pr-4 rounded-full border border-gray-700 backdrop-blur-sm">
                    {/* Avatar */}
                    {user.photoURL ? (
                        <img src={user.photoURL} alt="User" className="w-8 h-8 rounded-full border border-gray-600" />
                    ) : (
                        <div className="w-8 h-8 rounded-full bg-cyan-800 flex items-center justify-center text-xs font-bold text-white">
                            {user.email?.substring(0,2).toUpperCase()}
                        </div>
                    )}
                    
                    {/* Token Balance */}
                    <button 
                        onClick={() => setIsStoreOpen(true)}
                        className="flex flex-col items-start hover:opacity-80 transition-opacity"
                        title="Kliknij, aby doładować"
                    >
                        <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Twoje Tokeny</span>
                        <div className="flex items-center gap-1">
                             <span className="text-sm font-bold text-white">{userData?.tokens ?? 0}</span>
                             <span className="text-yellow-400 text-xs">🪙</span>
                             <span className="bg-purple-600 text-[9px] px-1.5 rounded text-white font-bold ml-1">+</span>
                        </div>
                    </button>

                    <div className="h-6 w-px bg-gray-700 mx-1"></div>

                    <button onClick={() => logout()} className="text-gray-400 hover:text-white text-xs font-medium">
                        Wyloguj
                    </button>
                </div>
            ) : (
                <button 
                    onClick={() => setIsAuthOpen(true)}
                    className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg font-bold transition-all border border-gray-600 shadow-lg"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
                    Zaloguj się
                </button>
            )}
       </div>

      <div className="text-center">
        <div className="flex items-center justify-center gap-3">
          <h1 className="text-4xl sm:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">
            Generator Opisów Aukcji
          </h1>
          <span className="text-xs font-bold text-slate-900 bg-cyan-400 rounded-full px-2 py-0.5">AI</span>
        </div>
        <p className="mt-3 text-lg text-gray-400 max-w-2xl mx-auto">
          Wgraj plik modelu 3D lub zdjęcie, aby AI wygenerowało profesjonalny opis produktu gotowy do wstawienia na Allegro.
        </p>
      </div>
    </header>
    
    <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} />
    <TokenStore isOpen={isStoreOpen} onClose={() => setIsStoreOpen(false)} />
    </>
  );
};