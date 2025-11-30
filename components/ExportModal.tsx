
import React, { useState, useEffect, useCallback } from 'react';
import {
  getBaseLinkerInventories,
  getInventoryWarehouses,
  getInventoryPriceGroups,
  getInventoryCategories,
  getInventoryManufacturers,
  Warehouse,
  PriceGroup,
  Category,
  Manufacturer
} from '../services/exportService';

// This type needs to be available to App.tsx as well
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

const platformConfig = {
  woocommerce: {
    title: 'Eksport do WooCommerce',
    description: 'Wprowadź dane uwierzytelniające WooCommerce API, aby wysłać produkt.'
  },
  baselinker: {
    title: 'Eksport do BaseLinker',
    description: 'Wprowadź token API i skonfiguruj szczegóły produktu, aby dodać go do katalogu.'
  }
};

// Fix: Made `children` prop optional to resolve a potential TypeScript error where it's incorrectly reported as missing.
const FormField = ({ id, label, value, onChange, disabled, children }: { id: string, label: string, value: string, onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void, disabled: boolean, children?: React.ReactNode }) => (
    <div>
        <label htmlFor={id} className="block text-sm font-medium text-gray-300">{label}</label>
        <select
            id={id}
            value={value}
            onChange={onChange}
            disabled={disabled}
            className="mt-1 w-full bg-gray-900 border border-gray-600 rounded-md p-2 focus:ring-cyan-500 focus:border-cyan-500 disabled:bg-gray-700"
        >
            {children}
        </select>
    </div>
);


// Sub-component for BaseLinker form to keep logic separate
const BaseLinkerForm: React.FC<{ onExport: (credentials: any) => void; status: ExportStatus; onClose: () => void; }> = ({ onExport, status, onClose }) => {
  const [apiToken, setApiToken] = useState('');
  const [inventories, setInventories] = useState<any[]>([]);
  const [selectedInventory, setSelectedInventory] = useState('');
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  const [priceGroups, setPriceGroups] = useState<PriceGroup[]>([]);
  const [selectedPriceGroup, setSelectedPriceGroup] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [selectedManufacturer, setSelectedManufacturer] = useState('');
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState('10');
  
  const [loading, setLoading] = useState<'idle' | 'loading' | 'error'>('idle');
  const [formError, setFormError] = useState<string | null>(null);

  const handleFetchInventories = useCallback(async () => {
    if (!apiToken.trim()) {
      setFormError("Token API nie może być pusty.");
      return;
    }
    setLoading('loading');
    setFormError(null);
    setInventories([]); // Reset previous results
    try {
      const fetchedInventories = await getBaseLinkerInventories(apiToken.trim());
      setInventories(fetchedInventories);
      if (fetchedInventories.length > 0) {
        setSelectedInventory(fetchedInventories[0].inventory_id.toString());
      } else {
        setFormError("Nie znaleziono żadnych katalogów dla podanego tokena.");
      }
      setLoading('idle');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Nie udało się pobrać katalogów. Sprawdź token API i połączenie.';
      setFormError(errorMessage);
      setLoading('error');
    }
  }, [apiToken]);
  
  useEffect(() => {
    const fetchDetails = async () => {
        if (!selectedInventory || !apiToken) return;
        
        setLoading('loading');
        setFormError(null);
        // Reset details for the new inventory selection
        setWarehouses([]);
        setSelectedWarehouse('');
        setPriceGroups([]);
        setSelectedPriceGroup('');
        setCategories([]);
        setSelectedCategory('');
        setManufacturers([]);
        setSelectedManufacturer('');

        try {
            const inventoryId = parseInt(selectedInventory, 10);
            const token = apiToken.trim();
            
            // Fetch all data in parallel
            const [fetchedWarehouses, fetchedPriceGroups, fetchedCategories, fetchedManufacturers] = await Promise.all([
                getInventoryWarehouses(token, inventoryId),
                getInventoryPriceGroups(token, inventoryId),
                getInventoryCategories(token, inventoryId),
                getInventoryManufacturers(token),
            ]);

            // Set Warehouses
            setWarehouses(fetchedWarehouses);
            if(fetchedWarehouses.length > 0) {
                setSelectedWarehouse(fetchedWarehouses[0].storage_id);
            }

            // Set Price Groups
            setPriceGroups(fetchedPriceGroups);
            if(fetchedPriceGroups.length > 0) {
                setSelectedPriceGroup(fetchedPriceGroups[0].price_group_id.toString());
            }
            
            // Set Categories and apply default
            setCategories(fetchedCategories);
            if (fetchedCategories.length > 0) {
                const defaultCategory = fetchedCategories.find(cat => cat.name.toLowerCase() === 'druk 3d');
                if (defaultCategory) {
                    setSelectedCategory(defaultCategory.category_id.toString());
                }
            }

            // Set Manufacturers and apply default
            setManufacturers(fetchedManufacturers);
            if (fetchedManufacturers.length > 0) {
                const defaultManufacturer = fetchedManufacturers.find(man => man.name.toLowerCase() === 'talakom');
                if (defaultManufacturer) {
                    setSelectedManufacturer(defaultManufacturer.manufacturer_id.toString());
                }
            }

            setLoading('idle');
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Nie udało się pobrać szczegółów katalogu.';
            setFormError(errorMessage);
            setLoading('error');
        }
    };
    fetchDetails();
  }, [selectedInventory, apiToken]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInventory || !selectedWarehouse || !selectedPriceGroup) {
      setFormError("Musisz wybrać katalog, magazyn i grupę cenową.");
      return;
    }
    onExport({
      apiToken: apiToken.trim(),
      inventoryId: parseInt(selectedInventory, 10),
      storageId: selectedWarehouse,
      priceGroupId: parseInt(selectedPriceGroup, 10),
      categoryId: selectedCategory ? parseInt(selectedCategory, 10) : undefined,
      manufacturerId: selectedManufacturer ? parseInt(selectedManufacturer, 10) : undefined,
      price: parseFloat(price) || 0,
      quantity: parseInt(quantity, 10) || 0,
    });
  };

  const isExporting = status === 'exporting';
  const isLoadingDetails = loading === 'loading' && inventories.length > 0;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="apiToken" className="block text-sm font-medium text-gray-300">Token API BaseLinker</label>
        <div className="mt-1 flex gap-2">
            <input
                type="text"
                id="apiToken"
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value.trim())}
                required
                className="flex-grow bg-gray-900 border border-gray-600 rounded-md p-2 focus:ring-cyan-500 focus:border-cyan-500"
                placeholder="Wklej token API"
                disabled={isExporting}
            />
            <button
                type="button"
                onClick={handleFetchInventories}
                disabled={!apiToken || loading === 'loading' || isExporting}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-md transition-colors disabled:bg-gray-500"
            >
                {loading === 'loading' && inventories.length === 0 ? 'Pobieranie...' : 'Pobierz'}
            </button>
        </div>
      </div>
      
      {inventories.length > 0 && (
          <>
            <FormField label="Katalog Produktów" id="inventory" value={selectedInventory} onChange={e => setSelectedInventory(e.target.value)} disabled={isExporting || isLoadingDetails}>
                {inventories.map(inv => <option key={inv.inventory_id} value={inv.inventory_id}>{inv.name}</option>)}
            </FormField>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label="Magazyn" id="warehouse" value={selectedWarehouse} onChange={e => setSelectedWarehouse(e.target.value)} disabled={isExporting || isLoadingDetails}>
                     {warehouses.length === 0 && <option>Ładowanie...</option>}
                    {warehouses.map(wh => <option key={wh.storage_id} value={wh.storage_id}>{wh.name}</option>)}
                </FormField>
                <FormField label="Grupa Cenowa" id="priceGroup" value={selectedPriceGroup} onChange={e => setSelectedPriceGroup(e.target.value)} disabled={isExporting || isLoadingDetails}>
                    {priceGroups.length === 0 && <option>Ładowanie...</option>}
                    {priceGroups.map(pg => <option key={pg.price_group_id} value={pg.price_group_id}>{pg.name} ({pg.currency})</option>)}
                </FormField>
                <FormField label="Kategoria (opcjonalnie)" id="category" value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)} disabled={isExporting || isLoadingDetails}>
                    <option value="">-- Brak --</option>
                     {categories.length === 0 && !isLoadingDetails && <option disabled>Brak kategorii</option>}
                     {isLoadingDetails && <option disabled>Ładowanie...</option>}
                    {categories.map(cat => <option key={cat.category_id} value={cat.category_id}>{cat.name}</option>)}
                </FormField>
                <FormField label="Producent (opcjonalnie)" id="manufacturer" value={selectedManufacturer} onChange={e => setSelectedManufacturer(e.target.value)} disabled={isExporting || isLoadingDetails}>
                    <option value="">-- Brak --</option>
                    {manufacturers.length === 0 && !isLoadingDetails && <option disabled>Brak producentów</option>}
                    {isLoadingDetails && <option disabled>Ładowanie...</option>}
                    {manufacturers.map(man => <option key={man.manufacturer_id} value={man.manufacturer_id}>{man.name}</option>)}
                </FormField>
                <div>
                  <label htmlFor="price" className="block text-sm font-medium text-gray-300">Cena brutto</label>
                  <input type="number" id="price" value={price} onChange={e => setPrice(e.target.value)} required min="0" step="0.01" className="mt-1 w-full bg-gray-900 border border-gray-600 rounded-md p-2 focus:ring-cyan-500 focus:border-cyan-500" disabled={isExporting || isLoadingDetails}/>
                </div>
                <div>
                  <label htmlFor="quantity" className="block text-sm font-medium text-gray-300">Ilość w magazynie</label>
                  <input type="number" id="quantity" value={quantity} onChange={e => setQuantity(e.target.value)} required min="0" step="1" className="mt-1 w-full bg-gray-900 border border-gray-600 rounded-md p-2 focus:ring-cyan-500 focus:border-cyan-500" disabled={isExporting || isLoadingDetails}/>
                </div>
            </div>
          </>
      )}

      {formError && <div className="p-3 bg-red-900/50 border border-red-700 text-red-300 rounded-lg text-sm">{formError}</div>}
      
      <div className="mt-6 flex justify-end gap-4">
        <button type="button" onClick={onClose} disabled={isExporting} className="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white font-bold rounded-md transition-colors disabled:opacity-50">Anuluj</button>
        <button type="submit" disabled={isExporting || !selectedInventory || !selectedWarehouse || !selectedPriceGroup || loading === 'loading'} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-md transition-colors disabled:bg-gray-500">
            {isExporting ? 'Eksportowanie...' : 'Eksportuj'}
        </button>
      </div>
    </form>
  )
};


// Sub-component for WooCommerce form
const WooCommerceForm: React.FC<{ onExport: (credentials: any) => void; status: ExportStatus; onClose: () => void; }> = ({ onExport, status, onClose }) => {
    const [credentials, setCredentials] = useState({
        storeUrl: '',
        consumerKey: '',
        consumerSecret: ''
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setCredentials({ ...credentials, [e.target.name]: e.target.value });
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onExport(credentials);
    };
    
    const isExporting = status === 'exporting';

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div>
                <label htmlFor="storeUrl" className="block text-sm font-medium text-gray-300">URL Sklepu</label>
                <input type="url" name="storeUrl" id="storeUrl" value={credentials.storeUrl} onChange={handleChange} required className="mt-1 w-full bg-gray-900 border border-gray-600 rounded-md p-2 focus:ring-cyan-500 focus:border-cyan-500" placeholder="https://twojsklep.pl" disabled={isExporting}/>
            </div>
            <div>
                <label htmlFor="consumerKey" className="block text-sm font-medium text-gray-300">Klucz klienta (Consumer Key)</label>
                <input type="text" name="consumerKey" id="consumerKey" value={credentials.consumerKey} onChange={handleChange} required className="mt-1 w-full bg-gray-900 border border-gray-600 rounded-md p-2 focus:ring-cyan-500 focus:border-cyan-500" disabled={isExporting}/>
            </div>
            <div>
                <label htmlFor="consumerSecret" className="block text-sm font-medium text-gray-300">Klucz klienta (Consumer Secret)</label>
                <input type="password" name="consumerSecret" id="consumerSecret" value={credentials.consumerSecret} onChange={handleChange} required className="mt-1 w-full bg-gray-900 border border-gray-600 rounded-md p-2 focus:ring-cyan-500 focus:border-cyan-500" disabled={isExporting}/>
            </div>
             <div className="mt-6 flex justify-end gap-4">
                <button type="button" onClick={onClose} disabled={isExporting} className="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white font-bold rounded-md transition-colors disabled:opacity-50">Anuluj</button>
                <button type="submit" disabled={isExporting} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-md transition-colors disabled:bg-gray-500">
                    {isExporting ? 'Eksportowanie...' : 'Eksportuj'}
                </button>
            </div>
        </form>
    )
};


export const ExportModal: React.FC<ExportModalProps> = ({ isOpen, onClose, platform, onExport, status, error }) => {
  if (!isOpen) return null;

  const config = platformConfig[platform];

  const renderForm = () => {
    switch (platform) {
      case 'woocommerce':
        return <WooCommerceForm onExport={onExport} status={status} onClose={onClose} />;
      case 'baselinker':
        return <BaseLinkerForm onExport={onExport} status={status} onClose={onClose} />;
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50 backdrop-blur-sm" onClick={onClose}>
      <div className="relative bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg p-6 sm:p-8 border border-cyan-500/30" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-gray-200 z-10" disabled={status === 'exporting'}>
           <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
        
        <h2 className="text-2xl font-bold mb-1 text-gray-100">{config.title}</h2>
        <p className="text-sm text-gray-400 mb-6">{config.description}</p>
        
        {status === 'success' ? (
             <div className="text-center p-8">
                <div className="mx-auto w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center border-2 border-green-500">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                </div>
                <h3 className="mt-4 text-xl font-bold text-gray-100">Eksport zakończony sukcesem!</h3>
                <p className="text-gray-400 mt-1">Produkt został dodany do Twojego systemu.</p>
                <button onClick={onClose} className="mt-6 px-6 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-md">
                    Zamknij
                </button>
             </div>
        ) : (
            <>
                {error && (
                    <div className="mb-4 p-4 bg-red-900/50 border border-red-700 text-red-300 rounded-lg whitespace-pre-wrap">
                        <p className="font-semibold">Błąd eksportu</p>
                        <p className="text-sm mt-1">{error}</p>
                    </div>
                )}
                {renderForm()}
            </>
        )}
      </div>
    </div>
  );
};
