import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

interface TokenStoreProps {
    isOpen: boolean;
    onClose: () => void;
}

const PACKAGES = [
    { tokens: 10, price: 19, label: 'Starter', popular: false },
    { tokens: 50, price: 49, label: 'Pro', popular: true },
    { tokens: 200, price: 149, label: 'Biznes', popular: false },
];

export const TokenStore: React.FC<TokenStoreProps> = ({ isOpen, onClose }) => {
    const { buyTokens, userData } = useAuth();
    const [processing, setProcessing] = useState<number | null>(null);

    if (!isOpen) return null;

    const handleBuy = async (amount: number, index: number) => {
        setProcessing(index);
        // Simulate API delay / Payment Gateway
        await new Promise(resolve => setTimeout(resolve, 1500));
        await buyTokens(amount);
        setProcessing(null);
        onClose();
        alert(`Dziękujemy! Dodano ${amount} tokenów do Twojego konta.`);
    };

    return (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-4" onClick={onClose}>
             <div className="bg-slate-900 border border-purple-500/30 rounded-2xl w-full max-w-4xl p-8 shadow-2xl relative overflow-hidden" onClick={e => e.stopPropagation()}>
                
                <div className="text-center mb-8">
                    <h2 className="text-3xl font-bold text-white mb-2">Doładuj Tokeny AI</h2>
                    <p className="text-gray-400">Jeden token = Jedno wygenerowanie pełnej oferty.</p>
                    {userData && <p className="mt-4 text-emerald-400 font-bold">Twoje saldo: {userData.tokens} 🪙</p>}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {PACKAGES.map((pkg, idx) => (
                        <div key={idx} className={`relative bg-slate-800 rounded-xl p-6 border ${pkg.popular ? 'border-purple-500 ring-2 ring-purple-500/20' : 'border-slate-700'} flex flex-col hover:transform hover:scale-105 transition-all duration-300`}>
                            {pkg.popular && <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-purple-600 text-white text-xs font-bold px-3 py-1 rounded-full">NAJPOPULARNIEJSZY</div>}
                            
                            <h3 className="text-xl font-bold text-gray-200 text-center mb-2">{pkg.label}</h3>
                            <div className="text-center mb-6">
                                <span className="text-4xl font-extrabold text-white">{pkg.price} zł</span>
                            </div>
                            
                            <ul className="space-y-3 mb-8 flex-1">
                                <li className="flex items-center gap-2 text-gray-300">
                                    <span className="text-purple-400">✓</span> 
                                    <strong className="text-white">{pkg.tokens}</strong> generowań
                                </li>
                                <li className="flex items-center gap-2 text-gray-300">
                                    <span className="text-purple-400">✓</span> 
                                    Wysoka jakość zdjęć
                                </li>
                                <li className="flex items-center gap-2 text-gray-300">
                                    <span className="text-purple-400">✓</span> 
                                    Bez reklam
                                </li>
                            </ul>

                            <button 
                                onClick={() => handleBuy(pkg.tokens, idx)}
                                disabled={processing !== null}
                                className={`w-full py-3 rounded-lg font-bold text-white transition-all ${pkg.popular ? 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500' : 'bg-slate-700 hover:bg-slate-600'}`}
                            >
                                {processing === idx ? 'Przetwarzanie...' : 'Wybierz'}
                            </button>
                        </div>
                    ))}
                </div>

                <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-white">✕</button>
             </div>
        </div>
    );
};