import React, { useState, useEffect, useMemo } from 'react';
// Fix: Import PriceGroup and getInventoryPriceGroups to manage price group selection.
import { getBaseLinkerInventories, getInventoryWarehouses, Warehouse, getInventoryPriceGroups, PriceGroup } from '../services/exportService';

export type ExportPlatform = 'woocommerce' | 'baselinker';
type ExportStatus = 'idle' | 'exporting' | 'success' | 'error';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  platform: ExportPlatform;
  onExport: (credentials: any) => void;
  status: ExportStatus;
  error: string | null;
}

const platformNames: Record<ExportPlatform, string> = {
    woocommerce: 'WooCommerce',
    baselinker: 'BaseLinker'
};

const BaseLinkerForm: React.FC<{ onExport: (credentials: any) => void; }> = ({ onExport }) => {
    const [step, setStep] = useState<'token' | 'options'>('token');
    const [apiToken, setApiToken] = useState('');
    
    const [inventories, setInventories] = useState<any[]>([]);
    const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
    // Fix: Added state to store and manage price groups.
    const [priceGroups, setPriceGroups] = useState<PriceGroup[]>([]);
    
    const [selectedInventoryId, setSelectedInventoryId] = useState<string>('');
    const [selectedStorageId, setSelectedStorageId] = useState<string>('');
    // Fix: Added state for the selected price group ID.
    const [selectedPriceGroupId, setSelectedPriceGroupId] = useState<string>('');
    
    const [quantity, setQuantity] = useState<number>(10);
    const [price, setPrice] = useState<string>('29.99');

    const [isVerifyingToken, setIsVerifyingToken] = useState(false);
    const [isWarehousesLoading, setIsWarehousesLoading] = useState(false);
    // Fix: Added a loading state for fetching price groups.
    const [isPriceGroupsLoading, setIsPriceGroupsLoading] = useState(false);
    const [fetchError, setFetchError] = useState<string | null>(null);

    // Fix: This effect now fetches both warehouses and price groups in parallel when the selected inventory changes.
    useEffect(() => {
        if (!apiToken || !selectedInventoryId) {
            setWarehouses([]);
            setSelectedStorageId('');
            setPriceGroups([]);
            setSelectedPriceGroupId('');
            return;
        }

        const numericInventoryId = parseInt(selectedInventoryId, 10);
        
        const fetchDataForInventory = async () => {
            setIsWarehousesLoading(true);
            setIsPriceGroupsLoading(true);
            setFetchError(null);
            
            try {
                const [fetchedWarehouses, fetchedPriceGroups] = await Promise.all([
                    getInventoryWarehouses(apiToken, numericInventoryId),
                    getInventoryPriceGroups(apiToken, numericInventoryId)
                ]);

                setWarehouses(fetchedWarehouses);
                setSelectedStorageId(fetchedWarehouses[0]?.storage_id || '');
                
                setPriceGroups(fetchedPriceGroups);
                setSelectedPriceGroupId(fetchedPriceGroups[0]?.price_group_id.toString() || '');
            } catch (err) {
                 const errorMessage = err instanceof Error ? err.message : "Wystąpił błąd podczas pobierania danych katalogu.";
                 setFetchError(errorMessage);
                 setWarehouses([]);
                 setSelectedStorageId('');
                 setPriceGroups([]);
                 setSelectedPriceGroupId('');
            } finally {
                setIsWarehousesLoading(false);
                setIsPriceGroupsLoading(false);
            }
        };

        fetchDataForInventory();
    }, [apiToken, selectedInventoryId]);


    const handleVerifyTokenAndFetchData = async () => {
        if (!apiToken) {
            setFetchError("Proszę wprowadzić token API.");
            return;
        }
        setIsVerifyingToken(true);
        setFetchError(null);
        try {
            // Step 1: Fetch only the list of inventories.
            const fetchedInventories = await getBaseLinkerInventories(apiToken);

            if (fetchedInventories.length === 0) {
                 setFetchError("Nie znaleziono żadnych katalogów produktów. Upewnij się, że masz co najmniej jeden w panelu BaseLinker.");
                 setIsVerifyingToken(false);
                 return;
            }
            
            setInventories(fetchedInventories);

            // Step 2: Set the first inventory as selected. This will trigger the `useEffect` hook
            // to fetch the warehouses specifically for this inventory.
            if (fetchedInventories[0]) {
                setSelectedInventoryId(fetchedInventories[0].inventory_id.toString());
            }

            setStep('options');

        } catch (err) {
            let errorMessage = err instanceof Error ? err.message : "Wystąpił nieznany błąd podczas pobierania danych.";
            if (errorMessage.includes("ERROR_BAD_TOKEN")) {
              errorMessage = "Wprowadzony token API jest nieprawidłowy. Sprawdź go i spróbuj ponownie.";
            }
            setFetchError(errorMessage);
        } finally {
            setIsVerifyingToken(false);
        }
    };
    
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onExport({
            apiToken,
            inventoryId: parseInt(selectedInventoryId, 10),
            storageId: selectedStorageId,
            priceGroupId: parseInt(selectedPriceGroupId, 10),
            quantity,
            price: parseFloat(price) || 0,
        });
    };
    
    if (step === 'token') {
        return (
            <div className="space-y-4">
                <div>
                    <label htmlFor="apiToken" className="block text-sm font-medium text-gray-300 mb-1">BaseLinker API Token</label>
                    <input
                        type="password"
                        name="apiToken"
                        id="apiToken"
                        value={apiToken}
                        onChange={(e) => setApiToken(e.target.value.trim())}
                        placeholder="Wprowadź swój token API"
                        required
                        className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-md focus:ring-cyan-500 focus:border-cyan-500"
                    />
                     <a href="https://pomoc.baselinker.com/pl-PL/a/298-API-BaseLinker" target="_blank" rel="noopener noreferrer" className="mt-1 text-xs text-cyan-400 hover:underline">Jak znaleźć token API?</a>
                </div>
                {fetchError && <p className="text-sm text-red-400 bg-red-900/30 p-3 rounded-md">{fetchError}</p>}
                <button
                    onClick={handleVerifyTokenAndFetchData}
                    disabled={isVerifyingToken || !apiToken}
                    className="w-full flex justify-center items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-md disabled:bg-gray-600 transition-colors"
                >
                    {isVerifyingToken ? 'Weryfikowanie...' : 'Dalej'}
                </button>
            </div>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div>
                <label htmlFor="inventoryId" className="block text-sm font-medium text-gray-300 mb-1">Katalog Produktów</label>
                <select
                    id="inventoryId"
                    value={selectedInventoryId}
                    onChange={(e) => setSelectedInventoryId(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-md focus:ring-cyan-500 focus:border-cyan-500"
                >
                    {inventories.map(inv => <option key={inv.inventory_id} value={inv.inventory_id}>{inv.name}</option>)}
                </select>
            </div>
            <div>
                <label htmlFor="storageId" className="block text-sm font-medium text-gray-300 mb-1">Magazyn</label>
                <select
                    id="storageId"
                    value={selectedStorageId}
                    onChange={(e) => setSelectedStorageId(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-md focus:ring-cyan-500 focus:border-cyan-500"
                    disabled={isWarehousesLoading || warehouses.length === 0}
                >
                   {isWarehousesLoading ? (
                        <option>Ładowanie magazynów...</option>
                   ) : warehouses.length > 0 ? (
                        warehouses.map(st => <option key={st.storage_id} value={st.storage_id}>{st.name} ({st.storage_id})</option>)
                    ) : (
                        <option value="">Brak magazynów dla tego katalogu</option>
                    )}
                </select>
                 {warehouses.length === 0 && !isWarehousesLoading && (
                    <p className="mt-1 text-xs text-yellow-400">Wybrany katalog nie ma przypisanych żadnych magazynów. Proszę przypisać magazyn w panelu BaseLinker.</p>
                )}
            </div>
            {/* Fix: Added a dropdown to select the price group, making the export process compatible with custom price group configurations in BaseLinker. */}
            <div>
                <label htmlFor="priceGroupId" className="block text-sm font-medium text-gray-300 mb-1">Grupa Cenowa</label>
                <select
                    id="priceGroupId"
                    value={selectedPriceGroupId}
                    onChange={(e) => setSelectedPriceGroupId(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-md focus:ring-cyan-500 focus:border-cyan-500"
                    disabled={isPriceGroupsLoading || priceGroups.length === 0}
                >
                   {isPriceGroupsLoading ? (
                        <option>Ładowanie grup cenowych...</option>
                   ) : priceGroups.length > 0 ? (
                        priceGroups.map(pg => <option key={pg.price_group_id} value={pg.price_group_id}>{pg.name} ({pg.currency})</option>)
                    ) : (
                        <option value="">Brak grup cenowych</option>
                    )}
                </select>
                 {priceGroups.length === 0 && !isPriceGroupsLoading && (
                    <p className="mt-1 text-xs text-yellow-400">Wybrany katalog nie ma przypisanych żadnych grup cenowych. Proszę dodać grupę cenową w panelu BaseLinker.</p>
                )}
            </div>
            {fetchError && <p className="text-sm text-red-400 bg-red-900/30 p-3 rounded-md whitespace-pre-wrap">{fetchError}</p>}
            <div className="grid grid-cols-2 gap-4">
                 <div>
                    <label htmlFor="price" className="block text-sm font-medium text-gray-300 mb-1">Cena brutto</label>
                    <input
                        type="number"
                        id="price"
                        step="0.01"
                        min="0.01"
                        value={price}
                        onChange={(e) => setPrice(e.target.value)}
                        required
                        className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-md focus:ring-cyan-500 focus:border-cyan-500"
                    />
                </div>
                <div>
                    <label htmlFor="quantity" className="block text-sm font-medium text-gray-300 mb-1">Ilość sztuk</label>
                    <input
                        type="number"
                        id="quantity"
                        min="0"
                        step="1"
                        value={quantity}
                        onChange={(e) => setQuantity(parseInt(e.target.value, 10))}
                        required
                        className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-md focus:ring-cyan-500 focus:border-cyan-500"
                    />
                </div>
            </div>
            <button
                type="submit"
                // Fix: The export button is now disabled until both a warehouse and a price group have been successfully selected.
                disabled={!selectedStorageId || !selectedPriceGroupId || isWarehousesLoading || isPriceGroupsLoading}
                className="w-full flex justify-center items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-md disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors"
            >
                Wyślij do BaseLinker
            </button>
        </form>
    );
};

export const ExportModal: React.FC<ExportModalProps> = ({ isOpen, onClose, platform, onExport, status, error }) => {
  if (!isOpen) return null;

  const renderContent = () => {
    switch (status) {
      case 'exporting':
        return (
          <div className="text-center p-8">
            <svg className="animate-spin h-10 w-10 text-cyan-400 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p className="mt-4 text-lg">Eksportowanie produktu...</p>
            <p className="text-sm text-gray-400">To może chwilę potrwać.</p>
          </div>
        );
      case 'success':
        return (
          <div className="text-center p-8">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-green-400 mx-auto" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <p className="mt-4 text-lg font-semibold">Eksport zakończony pomyślnie!</p>
            <p className="text-sm text-gray-400">Produkt został dodany w panelu {platformNames[platform]}.</p>
            <button onClick={onClose} className="mt-6 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-md">
              Zamknij
            </button>
          </div>
        );
      case 'error':
        return (
          <div className="text-center p-8">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-red-400 mx-auto" viewBox="0 0 20 20" fill="currentColor">
               <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <p className="mt-4 text-lg font-semibold">Wystąpił błąd</p>
            <pre className="mt-2 text-sm text-left text-red-300 bg-gray-900 p-3 rounded-md whitespace-pre-wrap">{error}</pre>
            <button onClick={onClose} className="mt-6 px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white font-bold rounded-md">
              Zamknij
            </button>
          </div>
        );
      case 'idle':
      default:
        return (
          <>
            <h2 className="text-2xl font-bold mb-4 text-gray-100">Eksport do {platformNames[platform]}</h2>
            {platform === 'baselinker' && <BaseLinkerForm onExport={onExport} />}
            {/* {platform === 'woocommerce' && <WooCommerceFields onChange={() => {}} />} */}
          </>
        );
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50 backdrop-blur-sm" onClick={onClose}>
      <div className="relative bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md p-6 sm:p-8 border border-cyan-500/30" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-gray-200 z-10">
           <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
        {renderContent()}
      </div>
    </div>
  );
};