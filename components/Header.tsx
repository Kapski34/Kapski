
import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { AuthModal } from './AuthModal';
import { TokenStore } from './TokenStore';

interface HeaderProps {
    activeView: 'app' | 'features' | 'pricing' | 'settings';
    onViewChange: (view: 'app' | 'features' | 'pricing' | 'settings') => void;
    onOpenStore: () => void;
}

export const Header: React.FC<HeaderProps> = ({ activeView, onViewChange, onOpenStore }) => {
  const { user, userData, logout } = useAuth();
  const [isAuthOpen, setIsAuthOpen] = useState(false);

  return (
    <>
    <header className="w-full mb-8 flex flex-col relative z-10">
       {/* TOP BAR: Settings (Left) & User Controls (Right) */}
       <div className="w-full flex justify-between items-center gap-3 mb-2 min-h-[40px]">
            {/* SETTINGS BUTTON (LEFT TOP) */}
            <button
                onClick={() => onViewChange('settings')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all ${activeView === 'settings' ? 'bg-slate-700 border-slate-500 text-white' : 'bg-slate-900/50 border-gray-700 text-gray-400 hover:text-white hover:bg-slate-800'}`}
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924-1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                Ustawienia
            </button>

            {/* USER CONTROLS (RIGHT TOP) */}
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
                        onClick={onOpenStore}
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

       {/* GŁÓWNA NAWIGACJA */}
       <div className="flex justify-center mb-8">
            <nav className="bg-slate-900/90 backdrop-blur-md p-1.5 rounded-2xl border border-gray-700 shadow-2xl flex items-center gap-1">
                <button 
                    onClick={() => onViewChange('app')}
                    className={`px-6 py-2.5 rounded-xl font-bold transition-all duration-300 text-sm flex items-center gap-2 ${activeView === 'app' ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-900/50' : 'text-gray-400 hover:text-white hover:bg-slate-800'}`}
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                    Generator
                </button>
                <button 
                    onClick={() => onViewChange('features')}
                    className={`px-6 py-2.5 rounded-xl font-bold transition-all duration-300 text-sm flex items-center gap-2 ${activeView === 'features' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/50' : 'text-gray-400 hover:text-white hover:bg-slate-800'}`}
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"></path></svg>
                    Funkcje
                </button>
                <button 
                    onClick={() => onViewChange('pricing')}
                    className={`px-6 py-2.5 rounded-xl font-bold transition-all duration-300 text-sm flex items-center gap-2 ${activeView === 'pricing' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/50' : 'text-gray-400 hover:text-white hover:bg-slate-800'}`}
                >
                     <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    Cennik
                </button>
            </nav>
       </div>

      {/* Show Title only when NOT in settings to keep UI clean */}
      {activeView !== 'settings' && (
          <div 
            className="text-center cursor-pointer hover:opacity-90 transition-opacity" 
            onClick={() => onViewChange('app')}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onViewChange('app'); }}
          >
            <div className="flex items-center justify-center gap-3">
              <h1 className="text-4xl sm:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">
                Generator Opisów Aukcji
              </h1>
              <span className="text-xs font-bold text-slate-900 bg-cyan-400 rounded-full px-2 py-0.5">AI</span>
            </div>
            <p className="mt-3 text-lg text-gray-400 max-w-2xl mx-auto">
                {activeView === 'app' && "Wgraj plik modelu 3D lub zdjęcie, aby AI wygenerowało profesjonalny opis produktu."}
                {activeView === 'features' && "Poznaj narzędzia, które zautomatyzują Twoją sprzedaż na Allegro."}
                {activeView === 'pricing' && "Wybierz pakiet tokenów dopasowany do Twoich potrzeb."}
            </p>
          </div>
      )}
      
      {activeView === 'settings' && (
          <div className="text-center mb-6">
              <h1 className="text-3xl font-extrabold text-white">Ustawienia Aplikacji</h1>
              <p className="text-gray-400 mt-2">Zarządzaj kontem i kluczami integracji</p>
          </div>
      )}
    </header>
    
    <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} />
    </>
  );
};
