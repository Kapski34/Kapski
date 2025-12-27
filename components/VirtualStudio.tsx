
import React, { useState } from 'react';
import { FileUpload } from './FileUpload';
import { generateStudioProImages, addWhiteBackground } from '../services/geminiService';
import { Loader } from './Loader';

// AUTH IMPORTS
import { useAuth } from '../contexts/AuthContext';
import { AuthModal } from './AuthModal';
import { TokenStore } from './TokenStore';

const STYLES = [
    { id: 'white', name: 'Czysta Biel (Allegro)', prompt: 'Pure white background, infinite horizon, commercial product photography, no shadows on walls, soft ground shadow.', icon: '⬜' },
    { id: 'wood', name: 'Natura i Drewno', prompt: 'Placed on a premium oak wood table, soft daylight coming from a window, blurred green plants in the background, eco-friendly vibe.', icon: '🌿' },
    { id: 'concrete', name: 'Beton / Industrial', prompt: 'Raw concrete surface, dramatic side lighting, sharp shadows, high contrast, industrial loft style.', icon: '🧱' },
    { id: 'luxury', name: 'Mroczny Luksus', prompt: 'Dark slate background, gold rim lighting, elegant atmosphere, premium product placement, reflection on the surface.', icon: '💎' },
    { id: 'neon', name: 'Cyberpunk Neon', prompt: 'Dark wet street reflection, pink and blue neon lights reflecting on the product, futuristic tech vibe.', icon: '🌃' },
    { id: 'kitchen', name: 'Nowoczesna Kuchnia', prompt: 'Marble countertop, bright kitchen environment in the background, clean, lifestyle composition.', icon: '🍳' },
];

export const VirtualStudio: React.FC = () => {
    // AUTH STATE
    const { user, userData, deductToken } = useAuth();
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
    const [isTokenStoreOpen, setIsTokenStoreOpen] = useState(false);

    const [file, setFile] = useState<File | null>(null);
    const [selectedStyle, setSelectedStyle] = useState<string>(STYLES[1].id);
    const [customPrompt, setCustomPrompt] = useState<string>('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [results, setResults] = useState<{ name: string; blob: Blob }[]>([]);
    const [error, setError] = useState<string | null>(null);

    const handleGenerate = async () => {
        // 1. Check Login
        if (!user) {
            setIsAuthModalOpen(true);
            return;
        }
        // 2. Check Tokens
        if (!userData || userData.tokens < 1) {
            setIsTokenStoreOpen(true);
            return;
        }

        if (!file) {
            setError('Najpierw wgraj zdjęcie produktu.');
            return;
        }
        setIsGenerating(true);
        setError(null);
        setResults([]);

        try {
            const styleDef = STYLES.find(s => s.id === selectedStyle);
            
            // FIX: Prioritize custom prompt. 
            // If custom prompt is present, we make it the primary instruction (SUBJECT/SCENE).
            // The selected style becomes secondary (AESTHETIC VIBE).
            let finalPrompt = styleDef?.prompt || '';
            if (customPrompt && customPrompt.trim().length > 0) {
                 finalPrompt = `SUBJECT/SCENE: ${customPrompt}. \n AESTHETIC VIBE: ${styleDef?.prompt || ''}`;
            }
            
            // Generate 3 styled images + 1 white background image
            const styledPromise = generateStudioProImages(file, finalPrompt, 3);
            const whiteBgPromise = selectedStyle === 'white' 
                ? generateStudioProImages(file, STYLES[0].prompt, 1) // Generate variation
                : addWhiteBackground(file).then(blob => [{ name: 'white_bg_studio.png', blob }]);

            const [styled, white] = await Promise.all([styledPromise, whiteBgPromise]);
            
            setResults([...white, ...styled]);
            
            // 3. Deduct Token
            deductToken(1);

        } catch (err) {
            setError(err instanceof Error ? err.message : 'Wystąpił błąd podczas generowania.');
        } finally {
            setIsGenerating(false);
        }
    };

    const handleDownload = (blob: Blob, name: string) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    return (
        <div className="bg-slate-900 rounded-2xl shadow-2xl p-6 md:p-8 border border-slate-800">
            <div className="text-center mb-10">
                <div className="inline-flex items-center gap-3 mb-3">
                    <h2 className="text-4xl font-bold text-white">Wirtualne Studio Fotograficzne</h2>
                    <span className="bg-purple-500/20 text-purple-400 text-xs font-bold px-2 py-1 rounded border border-purple-500/30 uppercase tracking-tighter">Wersja Alfa</span>
                </div>
                <p className="text-gray-400 text-lg">Przekształć zwykłe zdjęcie z telefonu w profesjonalną ofertę sprzedażową.</p>
            </div>

            {/* TOP SECTION: INPUTS & CONTROLS */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 border-b border-gray-800 pb-10 mb-10">
                {/* LEFT: UPLOAD & PREVIEW */}
                <div className="space-y-6">
                    <FileUpload 
                        id="studio-upload" 
                        label="Krok 1: Wgraj zdjęcie produktu" 
                        accept="image/*" 
                        onChange={e => setFile(e.target.files?.[0] || null)} 
                        fileName={file?.name}
                        icon={<svg className="h-12 w-12 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
                    />
                    
                    {file && (
                        <div className="bg-black/40 p-4 rounded-xl border border-gray-700">
                             <p className="text-sm font-semibold text-gray-400 mb-2">Podgląd oryginału:</p>
                             <div className="aspect-video rounded-lg overflow-hidden flex items-center justify-center bg-slate-950">
                                <img src={URL.createObjectURL(file)} alt="Preview" className="h-full object-contain" />
                            </div>
                        </div>
                    )}
                </div>

                {/* RIGHT: SETTINGS */}
                <div className="space-y-6 flex flex-col justify-between">
                    <div>
                        <label className="block text-lg font-semibold text-purple-300 mb-4">Krok 2: Wybierz Styl Otoczenia</label>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            {STYLES.map(style => (
                                <button
                                    key={style.id}
                                    onClick={() => setSelectedStyle(style.id)}
                                    className={`p-4 rounded-xl border text-left transition-all flex flex-col items-center justify-center gap-2 text-center h-28 ${selectedStyle === style.id ? 'bg-purple-900/40 border-purple-500 ring-2 ring-purple-500 shadow-lg shadow-purple-900/20' : 'bg-slate-800 border-gray-700 hover:border-gray-500 hover:bg-slate-700'}`}
                                >
                                    <span className="text-3xl">{style.icon}</span>
                                    <span className="text-sm font-medium text-gray-200 leading-tight">{style.name}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-semibold text-gray-400 mb-2">Własny opis (opcjonalnie)</label>
                            <input 
                                type="text"
                                value={customPrompt}
                                onChange={e => setCustomPrompt(e.target.value)}
                                placeholder="Np. 'Na plaży przy zachodzie słońca'..."
                                className="w-full p-4 bg-slate-800 border border-gray-700 rounded-xl text-white focus:ring-2 focus:ring-purple-500 focus:outline-none placeholder-gray-500"
                            />
                        </div>

                        <button 
                            onClick={handleGenerate}
                            disabled={isGenerating || !file}
                            className="w-full py-5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-lg font-bold rounded-xl shadow-xl shadow-purple-500/20 transform transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:scale-100 disabled:cursor-not-allowed"
                        >
                            {isGenerating ? (
                                <span className="flex items-center justify-center gap-2">
                                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                    AI pracuje nad zdjęciami...
                                </span>
                            ) : '✨ Generuj Profesjonalną Sesję'}
                        </button>
                        {error && <div className="text-red-400 text-center bg-red-900/20 p-3 rounded-lg border border-red-500/30">{error}</div>}
                    </div>
                </div>
            </div>

            {/* BOTTOM SECTION: RESULTS GALLERY */}
            <div>
                 <div className="flex items-center justify-between mb-6">
                    <h3 className="text-2xl font-bold text-white flex items-center gap-3">
                        📸 Wyniki Sesji
                        {results.length > 0 && <span className="text-base font-normal text-purple-300 bg-purple-900/30 px-3 py-1 rounded-full">{results.length} zdjęcia</span>}
                    </h3>
                 </div>

                 {isGenerating && (
                    <div className="py-20">
                        <Loader message="Wirtualny fotograf ustawia światła i renderuje scenę..." />
                    </div>
                 )}
                 
                 {!isGenerating && results.length > 0 && (
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                         {results.map((res, idx) => (
                             <div key={idx} className="group relative rounded-2xl overflow-hidden border border-gray-700 shadow-2xl bg-black">
                                 {/* Image Container - Removed aspect restriction to show full image, but minimum height added */}
                                 <div className="min-h-[400px] w-full flex items-center justify-center bg-zinc-900">
                                     <img src={URL.createObjectURL(res.blob)} alt="Generated" className="w-full h-auto max-h-[800px] object-contain" />
                                 </div>
                                 
                                 {/* Overlay */}
                                 <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-4">
                                     <button 
                                        onClick={() => handleDownload(res.blob, res.name)}
                                        className="bg-white text-gray-900 px-6 py-3 rounded-full font-bold shadow-lg hover:bg-gray-200 transform hover:scale-105 transition-all flex items-center gap-2"
                                     >
                                         <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                         Pobierz w pełnej jakości
                                     </button>
                                 </div>
                                 <div className="absolute bottom-4 left-4 right-4 pointer-events-none">
                                     <div className="bg-black/60 backdrop-blur-md text-white text-xs py-1 px-3 rounded-lg inline-block">
                                         Wariant #{idx + 1}
                                     </div>
                                 </div>
                             </div>
                         ))}
                     </div>
                 )}
                 
                 {!isGenerating && results.length === 0 && (
                     <div className="border-3 border-dashed border-gray-800 rounded-3xl h-64 flex flex-col items-center justify-center text-gray-600 bg-slate-900/50">
                         <span className="text-6xl mb-4 grayscale opacity-30">🖼️</span>
                         <p className="text-lg font-medium">Tutaj pojawią się Twoje wygenerowane zdjęcia w dużej rozdzielczości</p>
                     </div>
                 )}
            </div>
            <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
            <TokenStore isOpen={isTokenStoreOpen} onClose={() => setIsTokenStoreOpen(false)} />
        </div>
    );
};
