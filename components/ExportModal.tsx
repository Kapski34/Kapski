
import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import { searchAllegroCategories, initiateDeviceAuth, getDeviceToken, getShippingRates, publishOffer } from '../services/allegroService';

export type ExportPlatform = 'woocommerce' | 'baselinker' | 'allegro';

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
  },
  allegro: {
    title: 'Wystaw na Allegro',
    description: 'Połącz konto, wybierz cennik dostawy i wystaw ofertę.'
  }
};

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

// --- ALLEGRO FORM ---
const AllegroForm: React.FC<{ onExport: (credentials: any) => void; status: ExportStatus; onClose: () => void; }> = ({ onExport, status, onClose }) => {
    const [clientId, setClientId] = useState('');
    const [clientSecret, setClientSecret] = useState('');
    const [isSandbox, setIsSandbox] = useState(false); // New Sandbox toggle
    const [token, setToken] = useState(''); 
    const [authStep, setAuthStep] = useState<'credentials' | 'verifying' | 'connected'>('credentials');
    const [deviceCodeData, setDeviceCodeData] = useState<any>(null);
    const [connectError, setConnectError] = useState<string | null>(null);
    const [isConnecting, setIsConnecting] = useState(false);

    const [categoryQuery, setCategoryQuery] = useState('');
    const [categories, setCategories] = useState<{id: string, name: string}[]>([]);
    const [selectedCategoryId, setSelectedCategoryId] = useState('');
    
    // NEW: Shipping Rates
    const [shippingRates, setShippingRates] = useState<{id: string, name: string}[]>([]);
    const [selectedShippingRateId, setSelectedShippingRateId] = useState('');
    const [isLoadingRates, setIsLoadingRates] = useState(false);

    const [price, setPrice] = useState('');
    const [stock, setStock] = useState('1');
    const [isSearching, setIsSearching] = useState(false);
    const [publishImmediately, setPublishImmediately] = useState(false);
    
    const pollIntervalRef = useRef<number | null>(null);

    // Cleanup polling on unmount
    useEffect(() => {
        return () => {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        };
    }, []);

    // Load Shipping Rates when connected
    useEffect(() => {
        if (token && authStep === 'connected') {
            setIsLoadingRates(true);
            getShippingRates(token, isSandbox)
                .then(rates => {
                    setShippingRates(rates);
                    if (rates.length > 0) setSelectedShippingRateId(rates[0].id);
                })
                .catch(err => console.error("Failed to load shipping rates", err))
                .finally(() => setIsLoadingRates(false));
        }
    }, [token, authStep, isSandbox]);

    const handleConnect = async () => {
        setConnectError(null);
        if (!clientId.trim() || !clientSecret.trim()) return alert("Wprowadź Client ID i Client Secret");
        
        setIsConnecting(true);
        try {
            const data = await initiateDeviceAuth(clientId.trim(), clientSecret.trim(), isSandbox);
            setDeviceCodeData(data);
            setAuthStep('verifying');
            
            const interval = data.interval ? data.interval * 1000 : 5000;
            pollIntervalRef.current = window.setInterval(async () => {
                try {
                    const result = await getDeviceToken(clientId.trim(), clientSecret.trim(), data.device_code, isSandbox);
                    if (result.status === 'success' && result.access_token) {
                        setToken(result.access_token);
                        setAuthStep('connected');
                        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
                    }
                } catch (e) {
                    console.error("Polling error", e);
                }
            }, interval);

        } catch (e) {
            setConnectError((e instanceof Error ? e.message : 'Nieznany błąd połączenia'));
        } finally {
            setIsConnecting(false);
        }
    };

    const handleSearchCategory = async () => {
        if (!token) return;
        if (categoryQuery.length < 3) return alert("Wpisz min. 3 znaki");
        setIsSearching(true);
        try {
            const results = await searchAllegroCategories(token, categoryQuery, isSandbox);
            setCategories(results);
            if(results.length > 0) setSelectedCategoryId(results[0].id);
        } catch (e) {
            alert("Błąd wyszukiwania kategorii.");
        } finally {
            setIsSearching(false);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onExport({
            token,
            isSandbox,
            categoryId: selectedCategoryId,
            shippingRateId: selectedShippingRateId,
            price: parseFloat(price),
            stock: parseInt(stock),
            publishImmediately
        });
    };

    // STEP 1: CREDENTIALS INPUT
    if (authStep === 'credentials') {
        return (
            <div className="space-y-4">
                 <div className="bg-slate-900/50 p-4 rounded-lg border border-gray-600 text-sm">
                    <h4 className="font-bold text-orange-400 mb-2">Instrukcja konfiguracji:</h4>
                    <ol className="list-decimal ml-4 mt-1 space-y-2 text-gray-300">
                        <li>
                            Zaloguj się: <a href={isSandbox ? "https://apps.developer.allegro.pl.allegrosandbox.pl/" : "https://apps.developer.allegro.pl/"} target="_blank" className="underline text-cyan-400 font-bold hover:text-cyan-300">{isSandbox ? 'apps...sandbox.pl' : 'apps.developer.allegro.pl'}</a>
                        </li>
                        <li>Kliknij <strong>"Zarejestruj nową aplikację"</strong>.</li>
                        <li>
                            <span className="text-yellow-400 font-bold">WAŻNE:</span> Wybierz typ aplikacji: <br/>
                            <strong className="text-white border border-gray-600 bg-gray-700 px-1 rounded">Aplikacja Desktopowa</strong> (Device Flow).
                        </li>
                        <li>Skopiuj <strong>Client ID</strong> i <strong>Client Secret</strong> poniżej.</li>
                    </ol>
                </div>
                
                {/* Sandbox Toggle */}
                <div className="flex items-center gap-2 p-3 bg-slate-800 rounded-lg border border-gray-700">
                    <input 
                        type="checkbox" 
                        id="sandbox" 
                        checked={isSandbox} 
                        onChange={e => setIsSandbox(e.target.checked)}
                        className="w-5 h-5 rounded border-gray-500 text-orange-600 focus:ring-orange-500 bg-gray-900" 
                    />
                    <label htmlFor="sandbox" className="text-sm font-bold text-orange-300 cursor-pointer select-none">
                        Użyj Sandbox (Środowisko testowe)
                    </label>
                </div>

                <div>
                    <label className="block text-xs uppercase font-bold text-gray-400 mb-1">Client ID</label>
                    <input type="text" value={clientId} onChange={e => setClientId(e.target.value)} className="w-full bg-slate-900 border border-gray-600 rounded-md p-3 font-mono text-sm focus:border-orange-500 outline-none" placeholder="a1b2c3..." />
                </div>
                <div>
                    <label className="block text-xs uppercase font-bold text-gray-400 mb-1">Client Secret</label>
                    <input type="password" value={clientSecret} onChange={e => setClientSecret(e.target.value)} className="w-full bg-slate-900 border border-gray-600 rounded-md p-3 font-mono text-sm focus:border-orange-500 outline-none" placeholder="Pełny sekret..." />
                </div>
                
                {connectError && (
                    <div className="text-red-400 text-sm bg-red-900/20 p-3 rounded border border-red-800 flex items-center gap-2">
                        <span>⚠️</span> {connectError}
                    </div>
                )}

                <button 
                    type="button" 
                    onClick={handleConnect} 
                    disabled={isConnecting}
                    className="w-full py-3 bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 text-white font-bold rounded-lg shadow-lg disabled:opacity-50 transition-all transform hover:scale-[1.02]"
                >
                    {isConnecting ? 'Nawiązywanie połączenia...' : `Połącz z Allegro ${isSandbox ? '(Sandbox)' : ''}`}
                </button>
            </div>
        );
    }

    // STEP 2: VERIFICATION LINK
    if (authStep === 'verifying' && deviceCodeData) {
        return (
            <div className="space-y-6 text-center py-4">
                <div className="animate-pulse">
                    <p className="text-gray-300 text-lg font-semibold mb-4">Wymagana autoryzacja w przeglądarce</p>
                    <a 
                        href={deviceCodeData.verification_uri_complete} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="inline-block px-8 py-4 bg-orange-600 text-white font-bold text-lg rounded-xl hover:bg-orange-500 transition-colors shadow-xl"
                    >
                        🔗 Potwierdź logowanie
                    </a>
                </div>
                <div className="bg-slate-900 p-6 rounded-xl border border-gray-700 inline-block mt-4">
                    <p className="text-xs text-gray-400 mb-2 uppercase tracking-widest">Twój kod weryfikacyjny</p>
                    <p className="text-3xl font-mono text-white tracking-[0.2em] font-bold select-all">{deviceCodeData.user_code}</p>
                </div>
                <div className="flex items-center justify-center gap-2 text-gray-500 text-sm mt-4">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    Oczekiwanie na potwierdzenie przez Allegro API...
                </div>
            </div>
        );
    }

    // STEP 3: DRAFT FORM
    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex items-center gap-2 text-green-400 text-sm bg-green-900/20 p-3 rounded-lg border border-green-800 font-medium">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                Pomyślnie połączono z kontem Allegro {isSandbox ? '(Sandbox)' : ''}
            </div>

            <div className="border-t border-gray-700 pt-4">
                <label className="block text-sm font-medium text-gray-300 mb-1">Kategoria Allegro</label>
                <div className="flex gap-2 mb-2">
                    <input type="text" value={categoryQuery} onChange={e => setCategoryQuery(e.target.value)} className="flex-grow bg-gray-900 border border-gray-600 rounded-md p-2 text-sm" placeholder="np. Obudowa PC, Wazon..." />
                    <button type="button" onClick={handleSearchCategory} disabled={isSearching} className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-md text-sm">{isSearching ? '...' : 'Szukaj'}</button>
                </div>
                {categories.length > 0 && (
                    <select value={selectedCategoryId} onChange={e => setSelectedCategoryId(e.target.value)} className="w-full bg-gray-900 border border-gray-600 rounded-md p-2 text-sm">
                        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                )}
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-300">Cena (PLN)</label>
                    <input type="number" step="0.01" value={price} onChange={e => setPrice(e.target.value)} required className="mt-1 w-full bg-gray-900 border border-gray-600 rounded-md p-2" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-300">Ilość sztuk</label>
                    <input type="number" value={stock} onChange={e => setStock(e.target.value)} required className="mt-1 w-full bg-gray-900 border border-gray-600 rounded-md p-2" />
                </div>
            </div>

            {/* NEW: Shipping Rates Dropdown */}
            <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Cennik Dostaw</label>
                {isLoadingRates ? (
                    <p className="text-xs text-gray-500">Pobieranie cenników...</p>
                ) : (
                    <select 
                        value={selectedShippingRateId} 
                        onChange={e => setSelectedShippingRateId(e.target.value)} 
                        className="w-full bg-gray-900 border border-gray-600 rounded-md p-2 text-sm"
                        required
                    >
                        <option value="">-- Wybierz Cennik --</option>
                        {shippingRates.map(rate => (
                            <option key={rate.id} value={rate.id}>{rate.name}</option>
                        ))}
                    </select>
                )}
                <p className="text-xs text-gray-500 mt-1">Musisz mieć skonfigurowane cenniki dostaw na koncie Allegro.</p>
            </div>

            {/* NEW: Publish Option */}
            <div className="flex items-center gap-2 p-3 bg-slate-800 rounded-lg border border-gray-700">
                <input 
                    type="checkbox" 
                    id="publish" 
                    checked={publishImmediately} 
                    onChange={e => setPublishImmediately(e.target.checked)}
                    className="w-5 h-5 rounded border-gray-500 text-orange-600 focus:ring-orange-500 bg-gray-900" 
                />
                <label htmlFor="publish" className="text-sm text-gray-200 cursor-pointer select-none">
                    Aktywuj ofertę natychmiast (Publikacja)
                </label>
            </div>

            <div className="mt-6 flex justify-end gap-4">
                <button type="button" onClick={onClose} disabled={status === 'exporting'} className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-md">Anuluj</button>
                <button type="submit" disabled={status === 'exporting' || !selectedCategoryId || !selectedShippingRateId} className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white font-bold rounded-md shadow-lg shadow-orange-900/20">
                    {status === 'exporting' ? 'Przetwarzanie...' : (publishImmediately ? 'Wystaw Ofertę' : 'Utwórz Draft')}
                </button>
            </div>
        </form>
    );
};

// ... BaseLinkerForm and WooCommerceForm remain unchanged (but kept in XML context if needed, here I assume they are already there or I can just return the updated file structure if I need to replace the whole file. Since I need to integrate AllegroForm, I will return the whole file to ensure correct structure)

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
    if (!apiToken.trim()) { setFormError("Token API nie może być pusty."); return; }
    setLoading('loading'); setFormError(null); setInventories([]);
    try {
      const fetchedInventories = await getBaseLinkerInventories(apiToken.trim());
      setInventories(fetchedInventories);
      if (fetchedInventories.length > 0) setSelectedInventory(fetchedInventories[0].inventory_id.toString());
      else setFormError("Nie znaleziono żadnych katalogów.");
      setLoading('idle');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Błąd pobierania katalogów.');
      setLoading('error');
    }
  }, [apiToken]);
  
  useEffect(() => {
    const fetchDetails = async () => {
        if (!selectedInventory || !apiToken) return;
        setLoading('loading'); setFormError(null);
        setWarehouses([]); setSelectedWarehouse(''); setPriceGroups([]); setSelectedPriceGroup('');
        setCategories([]); setSelectedCategory(''); setManufacturers([]); setSelectedManufacturer('');

        try {
            const inventoryId = parseInt(selectedInventory, 10);
            const token = apiToken.trim();
            const [fetchedWarehouses, fetchedPriceGroups, fetchedCategories, fetchedManufacturers] = await Promise.all([
                getInventoryWarehouses(token, inventoryId),
                getInventoryPriceGroups(token, inventoryId),
                getInventoryCategories(token, inventoryId),
                getInventoryManufacturers(token),
            ]);
            setWarehouses(fetchedWarehouses); if(fetchedWarehouses.length > 0) setSelectedWarehouse(fetchedWarehouses[0].storage_id);
            setPriceGroups(fetchedPriceGroups); if(fetchedPriceGroups.length > 0) setSelectedPriceGroup(fetchedPriceGroups[0].price_group_id.toString());
            setCategories(fetchedCategories); if (fetchedCategories.length > 0) { const def = fetchedCategories.find(c => c.name.toLowerCase() === 'druk 3d'); if (def) setSelectedCategory(def.category_id.toString()); }
            setManufacturers(fetchedManufacturers); if (fetchedManufacturers.length > 0) { const def = fetchedManufacturers.find(m => m.name.toLowerCase() === 'talakom'); if (def) setSelectedManufacturer(def.manufacturer_id.toString()); }
            setLoading('idle');
        } catch (err) { setFormError(err instanceof Error ? err.message : 'Błąd pobierania szczegółów.'); setLoading('error'); }
    };
    fetchDetails();
  }, [selectedInventory, apiToken]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInventory || !selectedWarehouse || !selectedPriceGroup) { setFormError("Musisz wybrać katalog, magazyn i grupę cenową."); return; }
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
            <input type="text" id="apiToken" value={apiToken} onChange={(e) => setApiToken(e.target.value.trim())} required className="flex-grow bg-gray-900 border border-gray-600 rounded-md p-2 focus:ring-cyan-500" placeholder="Wklej token API" disabled={isExporting} />
            <button type="button" onClick={handleFetchInventories} disabled={!apiToken || loading === 'loading' || isExporting} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-md disabled:bg-gray-500">{loading === 'loading' && inventories.length === 0 ? '...' : 'Pobierz'}</button>
        </div>
      </div>
      {inventories.length > 0 && (
          <>
            <FormField label="Katalog Produktów" id="inventory" value={selectedInventory} onChange={e => setSelectedInventory(e.target.value)} disabled={isExporting || isLoadingDetails}>{inventories.map(inv => <option key={inv.inventory_id} value={inv.inventory_id}>{inv.name}</option>)}</FormField>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label="Magazyn" id="warehouse" value={selectedWarehouse} onChange={e => setSelectedWarehouse(e.target.value)} disabled={isExporting || isLoadingDetails}>{warehouses.map(wh => <option key={wh.storage_id} value={wh.storage_id}>{wh.name}</option>)}</FormField>
                <FormField label="Grupa Cenowa" id="priceGroup" value={selectedPriceGroup} onChange={e => setSelectedPriceGroup(e.target.value)} disabled={isExporting || isLoadingDetails}>{priceGroups.map(pg => <option key={pg.price_group_id} value={pg.price_group_id}>{pg.name} ({pg.currency})</option>)}</FormField>
                <FormField label="Kategoria" id="category" value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)} disabled={isExporting || isLoadingDetails}><option value="">-- Brak --</option>{categories.map(cat => <option key={cat.category_id} value={cat.category_id}>{cat.name}</option>)}</FormField>
                <FormField label="Producent" id="manufacturer" value={selectedManufacturer} onChange={e => setSelectedManufacturer(e.target.value)} disabled={isExporting || isLoadingDetails}><option value="">-- Brak --</option>{manufacturers.map(man => <option key={man.manufacturer_id} value={man.manufacturer_id}>{man.name}</option>)}</FormField>
                <div><label className="block text-sm font-medium text-gray-300">Cena brutto</label><input type="number" value={price} onChange={e => setPrice(e.target.value)} required step="0.01" className="mt-1 w-full bg-gray-900 border border-gray-600 rounded-md p-2" disabled={isExporting || isLoadingDetails}/></div>
                <div><label className="block text-sm font-medium text-gray-300">Ilość</label><input type="number" value={quantity} onChange={e => setQuantity(e.target.value)} required step="1" className="mt-1 w-full bg-gray-900 border border-gray-600 rounded-md p-2" disabled={isExporting || isLoadingDetails}/></div>
            </div>
          </>
      )}
      {formError && <div className="p-3 bg-red-900/50 border border-red-700 text-red-300 rounded-lg text-sm">{formError}</div>}
      <div className="mt-6 flex justify-end gap-4">
        <button type="button" onClick={onClose} disabled={isExporting} className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-md">Anuluj</button>
        <button type="submit" disabled={isExporting || !selectedInventory} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-md">{isExporting ? 'Eksportowanie...' : 'Eksportuj'}</button>
      </div>
    </form>
  )
};

const WooCommerceForm: React.FC<{ onExport: (credentials: any) => void; status: ExportStatus; onClose: () => void; }> = ({ onExport, status, onClose }) => {
    const [credentials, setCredentials] = useState({ storeUrl: '', consumerKey: '', consumerSecret: '' });
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => setCredentials({ ...credentials, [e.target.name]: e.target.value });
    const isExporting = status === 'exporting';
    return (
        <form onSubmit={e => {e.preventDefault(); onExport(credentials);}} className="space-y-4">
            <div><label className="block text-sm font-medium text-gray-300">URL Sklepu</label><input type="url" name="storeUrl" value={credentials.storeUrl} onChange={handleChange} required className="mt-1 w-full bg-gray-900 border border-gray-600 rounded-md p-2" placeholder="https://twojsklep.pl" disabled={isExporting}/></div>
            <div><label className="block text-sm font-medium text-gray-300">Consumer Key</label><input type="text" name="consumerKey" value={credentials.consumerKey} onChange={handleChange} required className="mt-1 w-full bg-gray-900 border border-gray-600 rounded-md p-2" disabled={isExporting}/></div>
            <div><label className="block text-sm font-medium text-gray-300">Consumer Secret</label><input type="password" name="consumerSecret" value={credentials.consumerSecret} onChange={handleChange} required className="mt-1 w-full bg-gray-900 border border-gray-600 rounded-md p-2" disabled={isExporting}/></div>
             <div className="mt-6 flex justify-end gap-4">
                <button type="button" onClick={onClose} disabled={isExporting} className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-md">Anuluj</button>
                <button type="submit" disabled={isExporting} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-md">{isExporting ? 'Eksportowanie...' : 'Eksportuj'}</button>
            </div>
        </form>
    )
};

export const ExportModal: React.FC<ExportModalProps> = ({ isOpen, onClose, platform, onExport, status, error }) => {
  if (!isOpen) return null;
  const config = platformConfig[platform];

  const renderForm = () => {
    switch (platform) {
      case 'woocommerce': return <WooCommerceForm onExport={onExport} status={status} onClose={onClose} />;
      case 'baselinker': return <BaseLinkerForm onExport={onExport} status={status} onClose={onClose} />;
      case 'allegro': return <AllegroForm onExport={onExport} status={status} onClose={onClose} />;
      default: return null;
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
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                </div>
                <h3 className="mt-4 text-xl font-bold text-gray-100">Gotowe!</h3>
                <p className="text-gray-400 mt-1">{platform === 'allegro' ? 'Oferta została pomyślnie przetworzona.' : 'Eksport zakończony sukcesem.'}</p>
                <button onClick={onClose} className="mt-6 px-6 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-md">Zamknij</button>
             </div>
        ) : (
            <>
                {error && <div className="mb-4 p-4 bg-red-900/50 border border-red-700 text-red-300 rounded-lg whitespace-pre-wrap"><p className="font-semibold">Błąd eksportu</p><p className="text-sm mt-1">{error}</p></div>}
                {renderForm()}
            </>
        )}
      </div>
    </div>
  );
};
