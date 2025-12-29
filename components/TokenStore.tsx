import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

interface TokenStoreProps {
    isOpen: boolean;
    onClose: () => void;
    initialPackageId?: string;
}

export const PACKAGES = [
    { id: 'starter', tokens: 10, price: 19, label: 'Starter', popular: false, desc: 'Idealny na start' },
    { id: 'pro', tokens: 50, price: 49, label: 'Pro', popular: true, desc: 'Najlepszy stosunek ceny' },
    { id: 'biz', tokens: 200, price: 149, label: 'Biznes', popular: false, desc: 'Dla agencji i sklepów' },
];

export const TokenStore: React.FC<TokenStoreProps> = ({ isOpen, onClose, initialPackageId }) => {
    const { buyTokens, userData } = useAuth();
    const [selectedPackage, setSelectedPackage] = useState<typeof PACKAGES[0] | null>(null);
    const [processing, setProcessing] = useState(false);
    const [step, setStep] = useState<'selection' | 'payment' | 'success'>('selection');

    // Payment Form State
    const [cardNumber, setCardNumber] = useState('');
    const [expiry, setExpiry] = useState('');
    const [cvc, setCvc] = useState('');
    const [cardName, setCardName] = useState('');

    useEffect(() => {
        if (isOpen && initialPackageId) {
            const pkg = PACKAGES.find(p => p.id === initialPackageId);
            if (pkg) {
                setSelectedPackage(pkg);
                setStep('payment');
            }
        } else if (isOpen) {
             setStep('selection');
             setSelectedPackage(null);
        }
    }, [isOpen, initialPackageId]);

    if (!isOpen) return null;

    const handleSelect = (pkg: typeof PACKAGES[0]) => {
        setSelectedPackage(pkg);
        setStep('payment');
    };

    const handlePay = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedPackage) return;
        
        setProcessing(true);
        
        // Symulacja procesowania płatności (2 sekundy)
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Dodanie tokenów
        await buyTokens(selectedPackage.tokens);
        
        setProcessing(false);
        setStep('success');
    };

    const handleClose = () => {
        setStep('selection');
        setSelectedPackage(null);
        setCardNumber('');
        setExpiry('');
        setCvc('');
        setCardName('');
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-4" onClick={handleClose}>
             <div className="bg-slate-900 border border-gray-700 rounded-2xl w-full max-w-4xl shadow-2xl relative overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                
                {/* HEADER */}
                <div className="p-6 border-b border-gray-800 flex justify-between items-center bg-slate-900/50">
                    <div>
                        <h2 className="text-2xl font-bold text-white">Sklep z Tokenami</h2>
                        {userData && <p className="text-sm text-gray-400">Saldo: <span className="text-emerald-400 font-bold">{userData.tokens} 🪙</span></p>}
                    </div>
                    <button onClick={handleClose} className="text-gray-500 hover:text-white p-2">✕</button>
                </div>

                <div className="overflow-y-auto p-6 md:p-8">
                    
                    {/* STEP 1: SELECTION */}
                    {step === 'selection' && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {PACKAGES.map((pkg) => (
                                <div key={pkg.id} className={`relative bg-slate-800 rounded-xl p-6 border flex flex-col hover:transform hover:scale-105 transition-all duration-300 group cursor-pointer ${pkg.popular ? 'border-purple-500 ring-1 ring-purple-500/50' : 'border-slate-700 hover:border-gray-500'}`} onClick={() => handleSelect(pkg)}>
                                    {pkg.popular && <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-purple-600 text-white text-[10px] font-bold px-3 py-1 rounded-full shadow-lg">NAJPOPULARNIEJSZY</div>}
                                    
                                    <h3 className="text-xl font-bold text-gray-200 text-center mb-1">{pkg.label}</h3>
                                    <p className="text-xs text-gray-500 text-center mb-4">{pkg.desc}</p>
                                    
                                    <div className="text-center mb-6 bg-slate-900/50 py-3 rounded-lg">
                                        <span className="text-3xl font-extrabold text-white">{pkg.price} zł</span>
                                    </div>
                                    
                                    <ul className="space-y-3 mb-8 flex-1 text-sm">
                                        <li className="flex items-center gap-2 text-gray-300">
                                            <span className="text-purple-400 font-bold">✓</span> 
                                            <strong className="text-white">{pkg.tokens}</strong> generowań
                                        </li>
                                        <li className="flex items-center gap-2 text-gray-300">
                                            <span className="text-purple-400 font-bold">✓</span> 
                                            Wsparcie priorytetowe
                                        </li>
                                    </ul>

                                    <button className={`w-full py-2 rounded-lg font-bold text-white transition-all ${pkg.popular ? 'bg-purple-600 group-hover:bg-purple-500' : 'bg-slate-700 group-hover:bg-slate-600'}`}>
                                        Wybierz
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* STEP 2: PAYMENT FORM (MOCK) */}
                    {step === 'payment' && selectedPackage && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-fade-in">
                            {/* Summary */}
                            <div className="bg-slate-800/50 p-6 rounded-xl border border-gray-700 h-fit">
                                <h3 className="text-lg font-bold text-gray-300 mb-4 uppercase tracking-wider">Podsumowanie</h3>
                                <div className="flex justify-between items-center mb-4 pb-4 border-b border-gray-700">
                                    <div>
                                        <p className="font-bold text-white text-lg">Pakiet {selectedPackage.label}</p>
                                        <p className="text-sm text-gray-400">{selectedPackage.tokens} tokenów AI</p>
                                    </div>
                                    <p className="text-xl font-bold text-white">{selectedPackage.price}.00 PLN</p>
                                </div>
                                <div className="flex justify-between items-center text-sm text-gray-400 mb-2">
                                    <span>Podatek VAT (23%)</span>
                                    <span>wliczony</span>
                                </div>
                                <div className="flex justify-between items-center text-lg font-bold text-emerald-400 mt-4">
                                    <span>Do zapłaty:</span>
                                    <span>{selectedPackage.price}.00 PLN</span>
                                </div>
                            </div>

                            {/* Fake Payment Form */}
                            <div>
                                <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                                    <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"></path></svg>
                                    Dane płatności (Symulator)
                                </h3>
                                <form onSubmit={handlePay} className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Posiadacz karty</label>
                                        <input 
                                            type="text" 
                                            value={cardName}
                                            onChange={e => setCardName(e.target.value)}
                                            placeholder="JAN KOWALSKI"
                                            className="w-full bg-slate-950 border border-gray-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-purple-500 outline-none placeholder-gray-600"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Numer karty</label>
                                        <div className="relative">
                                            <input 
                                                type="text" 
                                                value={cardNumber}
                                                onChange={e => setCardNumber(e.target.value.replace(/\D/g,'').substring(0,16))}
                                                placeholder="0000 0000 0000 0000"
                                                className="w-full bg-slate-950 border border-gray-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-purple-500 outline-none placeholder-gray-600 font-mono tracking-wider"
                                                required
                                            />
                                            <div className="absolute right-3 top-3 flex gap-1">
                                                <div className="w-8 h-5 bg-gray-700 rounded"></div>
                                                <div className="w-8 h-5 bg-gray-700 rounded"></div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Data ważności</label>
                                            <input 
                                                type="text" 
                                                value={expiry}
                                                onChange={e => setExpiry(e.target.value)}
                                                placeholder="MM/YY"
                                                className="w-full bg-slate-950 border border-gray-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-purple-500 outline-none placeholder-gray-600 text-center"
                                                required
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">CVC / CVV</label>
                                            <input 
                                                type="text" 
                                                value={cvc}
                                                onChange={e => setCvc(e.target.value.replace(/\D/g,'').substring(0,3))}
                                                placeholder="123"
                                                className="w-full bg-slate-950 border border-gray-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-purple-500 outline-none placeholder-gray-600 text-center"
                                                required
                                            />
                                        </div>
                                    </div>

                                    <div className="pt-4">
                                        <button 
                                            type="submit" 
                                            disabled={processing}
                                            className="w-full py-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-purple-900/20 transform transition-all active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-3"
                                        >
                                            {processing ? (
                                                <>
                                                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                                    Autoryzacja płatności...
                                                </>
                                            ) : (
                                                `Zapłać ${selectedPackage.price} PLN`
                                            )}
                                        </button>
                                        <p className="text-center text-xs text-gray-600 mt-3 flex justify-center items-center gap-1">
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
                                            Szyfrowane połączenie SSL (Symulacja Stripe)
                                        </p>
                                    </div>
                                    <button type="button" onClick={() => setStep('selection')} className="w-full text-center text-sm text-gray-500 hover:text-white mt-2">Wróć do wyboru pakietu</button>
                                </form>
                            </div>
                        </div>
                    )}

                    {/* STEP 3: SUCCESS */}
                    {step === 'success' && (
                        <div className="flex flex-col items-center justify-center py-10 animate-fade-in text-center">
                            <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center border-2 border-green-500 mb-6">
                                <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                            </div>
                            <h3 className="text-3xl font-bold text-white mb-2">Płatność zakończona sukcesem!</h3>
                            <p className="text-gray-400 mb-8">Twoje konto zostało doładowane. Dziękujemy za zakup.</p>
                            <button onClick={handleClose} className="px-8 py-3 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-lg border border-gray-600 transition-all">
                                Wróć do aplikacji
                            </button>
                        </div>
                    )}

                </div>
             </div>
        </div>
    );
};