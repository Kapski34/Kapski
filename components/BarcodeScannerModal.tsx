
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

interface BarcodeScannerModalProps {
    isOpen: boolean;
    onClose: () => void;
    onDetected: (code: string) => void;
}

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({ isOpen, onClose, onDetected }) => {
    const [error, setError] = useState<string | null>(null);
    const [cameras, setCameras] = useState<Array<{ id: string; label: string }>>([]);
    const [activeCameraId, setActiveCameraId] = useState<string | null>(null);
    const [isSwitching, setIsSwitching] = useState(false);
    
    const scannerRef = useRef<Html5Qrcode | null>(null);
    const isRunning = useRef<boolean>(false);

    // 1. Fetch Cameras on Mount
    useEffect(() => {
        if (!isOpen) return;

        let mounted = true;
        Html5Qrcode.getCameras().then(devices => {
            if (!mounted) return;
            if (devices && devices.length > 0) {
                setCameras(devices);
                
                // Try to find the back camera automatically
                const backCamera = devices.find(d => 
                    d.label.toLowerCase().includes('back') || 
                    d.label.toLowerCase().includes('tył') || 
                    d.label.toLowerCase().includes('rear') ||
                    d.label.toLowerCase().includes('environment')
                );

                // Default to back camera if found, otherwise use the last one (often back on Android), or first one
                if (backCamera) {
                    setActiveCameraId(backCamera.id);
                } else if (devices.length > 1) {
                    // On many mobile devices, the last camera in the list is the main back camera
                    setActiveCameraId(devices[devices.length - 1].id);
                } else {
                    setActiveCameraId(devices[0].id);
                }
            } else {
                setError("Nie wykryto kamer.");
            }
        }).catch(err => {
            console.error("Error getting cameras", err);
            setError("Brak dostępu do listy kamer.");
        });

        return () => { mounted = false; };
    }, [isOpen]);

    // 2. Start Scanner when activeCameraId changes
    useEffect(() => {
        if (!isOpen || !activeCameraId) return;

        const startScanner = async () => {
            const elementId = "reader";
            if (!document.getElementById(elementId)) return;

            // Cleanup existing instance
            if (scannerRef.current) {
                try {
                    if (isRunning.current) {
                        await scannerRef.current.stop();
                    }
                    scannerRef.current.clear();
                } catch (e) { console.warn("Cleanup error", e); }
                isRunning.current = false;
            }

            // Create new instance
            const scanner = new Html5Qrcode(elementId, { verbose: false });
            scannerRef.current = scanner;

            const config = {
                fps: 30,
                qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
                    const width = Math.floor(viewfinderWidth * 0.85);
                    const height = Math.floor(viewfinderWidth * 0.40); 
                    return { width, height };
                },
                aspectRatio: 1.0,
                experimentalFeatures: { useBarCodeDetectorIfSupported: true },
                videoConstraints: {
                    deviceId: { exact: activeCameraId }, // Use specific ID
                    width: { min: 720, ideal: 1280, max: 1920 },
                    height: { min: 480, ideal: 720, max: 1080 },
                    focusMode: "continuous"
                },
                formatsToSupport: [
                    Html5QrcodeSupportedFormats.EAN_13,
                    Html5QrcodeSupportedFormats.EAN_8,
                    Html5QrcodeSupportedFormats.UPC_A,
                    Html5QrcodeSupportedFormats.UPC_E,
                    Html5QrcodeSupportedFormats.CODE_128,
                ]
            };

            try {
                await scanner.start(
                    { deviceId: { exact: activeCameraId } }, 
                    config,
                    (decodedText) => {
                        const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
                        audio.volume = 0.5;
                        audio.play().catch(() => {});
                        onDetected(decodedText);
                        onClose();
                    },
                    () => {}
                );
                isRunning.current = true;
                setIsSwitching(false);
            } catch (err: any) {
                console.error("Camera Start Error:", err);
                setIsSwitching(false);
                setError("Nie udało się uruchomić wybranej kamery.");
            }
        };

        startScanner();

        return () => {
            if (scannerRef.current && isRunning.current) {
                scannerRef.current.stop().catch(() => {}).finally(() => {
                    try { scannerRef.current?.clear(); } catch(e){}
                });
                isRunning.current = false;
            }
        };
    }, [isOpen, activeCameraId, onDetected, onClose]);

    const handleSwitchCamera = () => {
        if (cameras.length < 2 || isSwitching) return;
        setIsSwitching(true);
        
        const currentIndex = cameras.findIndex(c => c.id === activeCameraId);
        const nextIndex = (currentIndex + 1) % cameras.length;
        setActiveCameraId(cameras[nextIndex].id);
    };

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
                    <div className="flex gap-2">
                        {cameras.length > 1 && (
                            <button 
                                onClick={handleSwitchCamera} 
                                disabled={isSwitching}
                                className="p-2 bg-slate-800 rounded-full hover:bg-slate-700 text-white transition-colors"
                                title="Przełącz kamerę"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 ${isSwitching ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                            </button>
                        )}
                        <button onClick={onClose} className="p-2 bg-slate-800 rounded-full hover:bg-slate-700 text-white transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                        </button>
                    </div>
                </div>
                
                <div className="relative bg-black flex-1 w-full overflow-hidden flex items-center justify-center">
                    {error ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center text-red-400 z-20 bg-slate-900">
                             <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                            <p className="font-bold mb-2">Problem z kamerą</p>
                            <p className="text-sm text-gray-400">{error}</p>
                            <button onClick={onClose} className="mt-6 px-4 py-2 bg-slate-800 text-white rounded hover:bg-slate-700">Zamknij</button>
                        </div>
                    ) : (
                        <>
                            <div id="reader" className="w-full h-full"></div>
                            
                            {/* Overlay graficzny z czerwoną linią */}
                            <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10">
                                <div className="w-[85%] h-[40%] border-2 border-red-500/50 rounded-lg relative shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]">
                                    <div className="absolute top-1/2 left-4 right-4 h-0.5 bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)] animate-pulse"></div>
                                    <p className="absolute -top-8 left-0 right-0 text-center text-white text-xs font-bold shadow-black drop-shadow-md">Umieść kod w ramce</p>
                                </div>
                            </div>
                        </>
                    )}
                </div>
                
                <div className="p-4 bg-slate-900 text-center text-xs text-gray-500 border-t border-slate-800 shrink-0">
                    Skaner HD. Jeśli obraz jest nieostry, oddal telefon.
                </div>
            </div>
            <style>{`
                #reader video { object-fit: cover; width: 100% !important; height: 100% !important; }
            `}</style>
        </div>
    );
};
