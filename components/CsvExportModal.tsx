
import React, { useState, useEffect } from 'react';

declare const JSZip: any;

interface CsvData {
    title: string;
    sku: string;
    ean: string;
    condition: string;
    colors: string;
    width: string;
    height: string;
    depth: string;
    weight: string;
    description_main: string;
    description_extra1: string;
    description_extra2: string;
    description_extra3: string;
    images: string; // filenames joined by |
}

interface CsvExportModalProps {
    isOpen: boolean;
    onClose: () => void;
    data: CsvData;
    imageBlobs: { name: string; blob: Blob }[];
}

const FIELD_DEFINITIONS = [
    { key: 'title', label: 'Nazwa produktu' },
    { key: 'sku', label: 'SKU' },
    { key: 'condition', label: 'Stan' },
    { key: 'ean', label: 'EAN (GTIN)' },
    { key: 'colors', label: 'Wymagane kolory' },
    { key: 'width', label: 'Szerokość (cm)' },
    { key: 'height', label: 'Wysokość (cm)' },
    { key: 'depth', label: 'Głębokość (cm)' },
    { key: 'weight', label: 'Szacowana waga (kg)' },
    { key: 'description_main', label: 'Opis' },
    { key: 'description_extra1', label: 'Opis dodatkowy 1' },
    { key: 'description_extra2', label: 'Opis dodatkowy 2' },
    { key: 'description_extra3', label: 'Opis dodatkowy 3' },
    { key: 'images', label: 'Zdjęcia' },
] as const;

export const CsvExportModal: React.FC<CsvExportModalProps> = ({ isOpen, onClose, data, imageBlobs }) => {
    const [headers, setHeaders] = useState<Record<string, string>>({});
    const [separator, setSeparator] = useState(';');
    const [isZipping, setIsZipping] = useState(false);

    useEffect(() => {
        if (isOpen) {
            // Initialize headers with default labels
            const initialHeaders: Record<string, string> = {};
            FIELD_DEFINITIONS.forEach(field => {
                initialHeaders[field.key] = field.label;
            });
            setHeaders(initialHeaders);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleHeaderChange = (key: string, value: string) => {
        setHeaders(prev => ({ ...prev, [key]: value }));
    };

    const generateFilename = (extension: string) => {
        const title = data.title || 'produkt';
        // Get first two words, remove special chars, join with underscore
        const cleanName = title
            .split(' ')
            .slice(0, 2)
            .join('_')
            .replace(/[^a-zA-Z0-9ąćęłńóśźżĄĆĘŁŃÓŚŹŻ_]/g, '');
        
        return `${cleanName}.${extension}`;
    };

    const downloadBlob = (blob: Blob, filename: string) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const handleDownloadCsv = () => {
        const headerRow = FIELD_DEFINITIONS.map(field => headers[field.key] || field.label);
        
        const valueRow = FIELD_DEFINITIONS.map(field => {
            let val = (data as any)[field.key] || '';
            if (typeof val === 'string') {
                val = val.replace(/"/g, '""');
                if (val.includes(separator) || val.includes('"') || val.includes('\n')) {
                    val = `"${val}"`;
                }
            }
            return val;
        });

        const csvContent = "\uFEFF" + 
            headerRow.join(separator) + "\n" + 
            valueRow.join(separator);

        const csvBlob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const csvName = generateFilename('csv');
        
        downloadBlob(csvBlob, csvName);
    };

    const handleDownloadZip = async () => {
        if (imageBlobs.length === 0) return;
        
        setIsZipping(true);
        try {
            const zip = new JSZip();
            imageBlobs.forEach(img => {
                zip.file(img.name, img.blob, { binary: true });
            });

            const zipBlob = await zip.generateAsync({ type: "blob" });
            const zipName = generateFilename('zip');
            
            downloadBlob(zipBlob, zipName);
        } catch (error) {
            console.error("Błąd pakowania ZIP:", error);
            alert("Wystąpił błąd podczas tworzenia pliku ZIP.");
        } finally {
            setIsZipping(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-slate-900 border border-emerald-500/30 rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                
                {/* Header */}
                <div className="p-6 border-b border-gray-800 bg-slate-900 rounded-t-2xl">
                    <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        Eksport do CSV / ZIP
                    </h2>
                    <p className="text-sm text-gray-400 mt-1">Dostosuj nagłówki kolumn i pobierz pliki.</p>
                </div>

                {/* Scrollable Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    <div className="grid grid-cols-[1fr,1.5fr] gap-4 items-center mb-2 px-2 text-xs font-bold text-gray-500 uppercase tracking-wider">
                        <div>Pole w generatorze</div>
                        <div>Nagłówek w pliku CSV</div>
                    </div>
                    
                    {FIELD_DEFINITIONS.map((field) => (
                        <div key={field.key} className="grid grid-cols-[1fr,1.5fr] gap-4 items-center bg-slate-800/50 p-3 rounded-lg border border-gray-700 hover:border-gray-500 transition-colors">
                            <div className="text-sm font-medium text-gray-300">
                                {field.label}
                            </div>
                            <input 
                                type="text" 
                                value={headers[field.key] || ''} 
                                onChange={(e) => handleHeaderChange(field.key, e.target.value)}
                                className="w-full bg-slate-900 border border-gray-600 rounded px-3 py-2 text-white focus:ring-2 focus:ring-emerald-500 outline-none text-sm font-mono"
                                placeholder={field.label}
                            />
                        </div>
                    ))}
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-gray-800 bg-slate-900 rounded-b-2xl">
                    <div className="flex flex-col gap-4">
                        <div className="flex items-center gap-3 justify-end">
                            <label htmlFor="separator" className="text-sm font-bold text-gray-400">Separator:</label>
                            <input 
                                id="separator"
                                type="text" 
                                value={separator} 
                                onChange={(e) => setSeparator(e.target.value)}
                                maxLength={1}
                                className="w-10 text-center bg-slate-800 border border-gray-600 rounded px-2 py-1 text-white font-mono focus:ring-2 focus:ring-emerald-500 outline-none"
                            />
                        </div>

                        <div className="flex flex-col sm:flex-row gap-3 w-full">
                            <button onClick={onClose} className="px-4 py-3 text-gray-400 hover:text-white transition-colors border border-transparent hover:border-gray-600 rounded-lg">
                                Zamknij
                            </button>
                            
                            <button 
                                onClick={handleDownloadCsv}
                                className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg shadow-lg shadow-blue-900/20 transform transition-all active:scale-95 flex items-center justify-center gap-2"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                Pobierz .csv
                            </button>

                            <button 
                                onClick={handleDownloadZip}
                                disabled={isZipping || imageBlobs.length === 0}
                                className="flex-1 px-6 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-gray-500 disabled:cursor-not-allowed text-white font-bold rounded-lg shadow-lg shadow-emerald-900/20 transform transition-all active:scale-95 flex items-center justify-center gap-2"
                            >
                                {isZipping ? (
                                    <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                ) : (
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                )}
                                Pobierz zdjęcia .zip
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
