
import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

interface BarcodeScannerModalProps {
    isOpen: boolean;
    onClose: () => void;
    onDetected: (code: string) => void;
}

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({ isOpen, onClose, onDetected }) => {
    const [error, setError] = useState<string | null>(null);
    const scannerRef = useRef<Html5Qrcode | null>(null);
    const isRunning = useRef<boolean>(false);

    useEffect(() => {
        if (!isOpen) return;

        let isMounted = true;
        setError(null);

        const initScanner = async () => {
            // Czekamy chwilę na wyrenderowanie DOM
            await new Promise(r => setTimeout(r, 150));
            if (!isMounted) return;

            const elementId = "reader";
            if (!document.getElementById(elementId)) {
                setError("Błąd inicjalizacji widoku kamery.");
                return;
            }

            try {
                // Jeśli istnieje stara instancja, próbujemy ją wyczyścić
                if (scannerRef.current) {
                    try {
                        if (isRunning.current) {
                            await scannerRef.current.stop();
                        }
                        scannerRef.current.clear();
                    } catch (e) { console.warn("Cleanup error", e); }
                    scannerRef.current = null;
                    isRunning.current = false;
                }

                const scanner = new Html5Qrcode(elementId);
                scannerRef.current = scanner;

                const config = {
                    fps: 10,
                    qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
                        const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
                        const dim = Math.floor(minEdge * 0.7);
                        return { width: dim, height: dim / 1.5 }; // Prostokąt dla kodów kreskowych
                    },
                    aspectRatio: 1.0,
                    formatsToSupport: [
                        Html5QrcodeSupportedFormats.EAN_13,
                        Html5QrcodeSupportedFormats.EAN_8,
                        Html5QrcodeSupportedFormats.UPC_A,
                        Html5QrcodeSupportedFormats.UPC_E,
                        Html5QrcodeSupportedFormats.CODE_128,
                    ]
                };

                await scanner.start(
                    { facingMode: "environment" },
                    config,
                    (decodedText) => {
                        if (!isMounted) return;
                        
                        // Dźwięk sukcesu
                        const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
                        audio.volume = 0.5;
                        audio.play().catch(() => {});
                        
                        onDetected(decodedText);
                        onClose();
                    },
                    (errorMessage) => {
                        // Ignorujemy błędy skanowania pojedynczych klatek
                    }
                );
                
                isRunning.current = true;

            } catch (err: any) {
                if (!isMounted) return;
                console.error("Camera Error:", err);
                
                let msg = "Nie udało się uruchomić kamery.";
                const errStr = err?.toString() || "";
                
                if (err?.name === 'NotAllowedError' || errStr.includes("permission")) {
                    msg = "Brak dostępu do kamery. Zezwól w ustawieniach przeglądarki.";
                } else if (err?.name === 'NotFoundError' || errStr.includes("found")) {
                    msg = "Nie wykryto kamery w urządzeniu.";
                } else if (err?.name === 'NotReadableError' || errStr.includes("readable")) {
                    msg = "Kamera jest zajęta przez inną aplikację lub zablokowana.";
                } else if (errStr.includes("secure context")) {
                    msg = "Kamera wymaga połączenia HTTPS (lub localhost).";
                }
                
                setError(msg);
            }
        };

        initScanner();

        return () => {
            isMounted = false;
            if (scannerRef.current) {
                const scanner = scannerRef.current;
                // Wywołujemy stop w tle, nie blokując unmount
                scanner.stop().then(() => {
                    scanner.clear();
                }).catch(err => {
                     // Ignoruj błędy stopowania przy zamykaniu
                    console.warn("Stop error", err);
                });
                scannerRef.current = null;
                isRunning.current = false;
            }
        };
    }, [isOpen, onDetected, onClose]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/95 z-[60] flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-md bg-slate-900 rounded-2xl border border-slate-700 shadow-2xl overflow-hidden relative flex flex-col h-[60vh] md:h-[500px]">
                <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900 z-10 shrink-0">
                    <h3 className="text-white font-bold text-lg flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-emerald-400" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M3 4a1 1 0 011-1h3a1 1 0 011 1v3a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm2 2V5h1v1H5zM3 13a1 1 0 011-1h3a1 1 0 011 1v3a1 1 0 01-1 1H4a1 1 0 01-1-1v-3zm2 2v-1h1v1H5zM13 3a1 1 0 00-1 1v3a1 1 0 001 1h3a1 1 0 001-1V4a1 1 0 00-1-1h-3zm1 2v1h1V5h-1z" clipRule="evenodd" />
                            <path d="M11 4a1 1 0 10-2 0v1a1 1 0 102 0V4zM10 7a1 1 0 011 1v1h2a1 1 0 110 2h-3a1 1 0 01-1-1V8a1 1 0 011-1zM16 9a1 1 0 100 2 1 1 0 000-2zM9 13a1 1 0 011-1h1a1 1 0 110 2v2a1 1 0 11-2 0v-3zM7 11a1 1 0 100-2H4a1 1 0 100 2h3zM17 13a1 1 0 01-1 1h-2a1 1 0 110-2h2a1 1 0 011 1zM16 17a1 1 0 100-2h-3a1 1 0 100 2h3z" />
                        </svg>
                        Skaner EAN
                    </h3>
                    <button onClick={onClose} className="p-2 bg-slate-800 rounded-full hover:bg-slate-700 text-white transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                    </button>
                </div>
                
                <div className="relative bg-black flex-1 w-full overflow-hidden flex items-center justify-center">
                    {error ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center text-red-400 z-20 bg-slate-900">
                             <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                            <p className="font-bold mb-2">Błąd dostępu</p>
                            <p className="text-sm text-gray-400">{error}</p>
                            <button onClick={onClose} className="mt-6 px-4 py-2 bg-slate-800 text-white rounded hover:bg-slate-700">Zamknij</button>
                        </div>
                    ) : (
                        <>
                            <div id="reader" className="w-full h-full"></div>
                            
                            {/* Overlay graficzny */}
                            <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10">
                                <div className="w-[80%] h-[40%] max-w-[300px] border-2 border-red-500/50 rounded-lg relative shadow-[0_0_100px_rgba(239,68,68,0.2)]">
                                    <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-red-500/80 animate-pulse"></div>
                                </div>
                            </div>
                        </>
                    )}
                </div>
                
                <div className="p-4 bg-slate-900 text-center text-xs text-gray-500 border-t border-slate-800 shrink-0">
                    Nakieruj kamerę na kod EAN.
                </div>
            </div>
            <style>{`
                #reader video { object-fit: cover; width: 100% !important; height: 100% !important; }
            `}</style>
        </div>
    );
};
