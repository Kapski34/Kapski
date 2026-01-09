
import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

interface ApiKeys {
    baselinkerToken: string;
    allegroClientId: string;
    allegroClientSecret: string;
    wooUrl: string;
    wooKey: string;
    wooSecret: string;
}

export const SettingsView: React.FC = () => {
    const { user, userData, logout } = useAuth();
    const [activeTab, setActiveTab] = useState<'account' | 'api'>('account');
    const [keys, setKeys] = useState<ApiKeys>({
        baselinkerToken: '',
        allegroClientId: '',
        allegroClientSecret: '',
        wooUrl: '',
        wooKey: '',
        wooSecret: ''
    });
    const [showSaved, setShowSaved] = useState(false);

    useEffect(() => {
        // Load keys from localStorage
        const savedKeys = localStorage.getItem('userApiKeys');
        if (savedKeys) {
            try {
                setKeys(JSON.parse(savedKeys));
            } catch (e) { console.error("Error parsing keys", e); }
        }
    }, []);

    const handleSave = () => {
        localStorage.setItem('userApiKeys', JSON.stringify(keys));
        setShowSaved(true);
        setTimeout(() => setShowSaved(false), 3000);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setKeys(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    return (
        <div className="w-full max-w-4xl mx-auto bg-slate-900 rounded-2xl shadow-2xl border border-slate-800 overflow-hidden animate-fade-in">
            <div className="flex border-b border-gray-800">
                <button
                    onClick={() => setActiveTab('account')}
                    className={`flex-1 py-4 text-center font-bold transition-colors ${activeTab === 'account' ? 'bg-slate-800 text-cyan-400 border-b-2 border-cyan-400' : 'text-gray-400 hover:text-gray-200 hover:bg-slate-800/50'}`}
                >
                    👤 Moje Konto
                </button>
                <button
                    onClick={() => setActiveTab('api')}
                    className={`flex-1 py-4 text-center font-bold transition-colors ${activeTab === 'api' ? 'bg-slate-800 text-cyan-400 border-b-2 border-cyan-400' : 'text-gray-400 hover:text-gray-200 hover:bg-slate-800/50'}`}
                >
                    🔑 Integracje API
                </button>
            </div>

            <div className="p-8">
                {activeTab === 'account' && (
                    <div className="space-y-8">
                        <div className="flex items-center gap-6">
                            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-cyan-600 to-blue-700 flex items-center justify-center text-3xl font-bold text-white shadow-xl">
                                {user?.photoURL ? (
                                    <img src={user.photoURL} alt="Avatar" className="w-full h-full rounded-full object-cover" />
                                ) : (
                                    user?.email?.substring(0, 2).toUpperCase() || 'US'
                                )}
                            </div>
                            <div>
                                <h3 className="text-2xl font-bold text-white">{user?.displayName || 'Użytkownik'}</h3>
                                <p className="text-gray-400">{user?.email}</p>
                                <div className="mt-3 inline-flex items-center gap-2 bg-slate-800 px-4 py-2 rounded-lg border border-slate-700">
                                    <span className="text-sm text-gray-400">Twoje saldo:</span>
                                    <span className="text-lg font-bold text-emerald-400">{userData?.tokens || 0} 🪙</span>
                                </div>
                            </div>
                        </div>

                        <div className="border-t border-gray-800 pt-6">
                            <h4 className="text-lg font-semibold text-gray-200 mb-4">Bezpieczeństwo</h4>
                            <div className="flex gap-4">
                                <button onClick={() => logout()} className="px-6 py-3 bg-red-900/30 text-red-400 hover:bg-red-900/50 border border-red-900 rounded-lg font-bold transition-all">
                                    Wyloguj się z urządzenia
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'api' && (
                    <div className="space-y-8">
                        <div className="bg-blue-900/20 p-4 rounded-lg border border-blue-800/50 flex gap-3">
                            <span className="text-2xl">ℹ️</span>
                            <div className="text-sm text-blue-200">
                                <p className="font-bold mb-1">Bezpieczeństwo Kluczy API</p>
                                <p>Twoje klucze są zapisywane <strong>tylko lokalnie</strong> w przeglądarce (localStorage). Nie są wysyłane na nasze serwery, dopóki nie użyjesz funkcji eksportu.</p>
                            </div>
                        </div>

                        {/* BASELINKER */}
                        <div className="space-y-4">
                            <h4 className="text-lg font-bold text-blue-400 flex items-center gap-2">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-14L4 7m0 0l8 4m-8-4v10l8 4" /></svg>
                                BaseLinker
                            </h4>
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">Token API</label>
                                <input 
                                    type="password" 
                                    name="baselinkerToken" 
                                    value={keys.baselinkerToken} 
                                    onChange={handleChange}
                                    placeholder="Wklej swój token BaseLinker"
                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                            </div>
                        </div>

                        <div className="h-px bg-gray-800"></div>

                        {/* ALLEGRO */}
                        <div className="space-y-4">
                            <h4 className="text-lg font-bold text-orange-400 flex items-center gap-2">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg>
                                Allegro (API App)
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-1">Client ID</label>
                                    <input 
                                        type="text" 
                                        name="allegroClientId" 
                                        value={keys.allegroClientId} 
                                        onChange={handleChange}
                                        className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-orange-500 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-1">Client Secret</label>
                                    <input 
                                        type="password" 
                                        name="allegroClientSecret" 
                                        value={keys.allegroClientSecret} 
                                        onChange={handleChange}
                                        className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-orange-500 outline-none"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="h-px bg-gray-800"></div>

                        {/* WOOCOMMERCE */}
                        <div className="space-y-4">
                            <h4 className="text-lg font-bold text-purple-400 flex items-center gap-2">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                                WooCommerce
                            </h4>
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">Adres Sklepu URL</label>
                                <input 
                                    type="url" 
                                    name="wooUrl" 
                                    value={keys.wooUrl} 
                                    onChange={handleChange}
                                    placeholder="https://twojsklep.pl"
                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-purple-500 outline-none"
                                />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-1">Consumer Key</label>
                                    <input 
                                        type="text" 
                                        name="wooKey" 
                                        value={keys.wooKey} 
                                        onChange={handleChange}
                                        className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-purple-500 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-1">Consumer Secret</label>
                                    <input 
                                        type="password" 
                                        name="wooSecret" 
                                        value={keys.wooSecret} 
                                        onChange={handleChange}
                                        className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-purple-500 outline-none"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end pt-4">
                            <button 
                                onClick={handleSave}
                                className="px-8 py-3 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-lg shadow-lg shadow-cyan-500/20 transform transition-all active:scale-95 flex items-center gap-2"
                            >
                                {showSaved ? 'Zapisano! ✓' : 'Zapisz ustawienia'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
