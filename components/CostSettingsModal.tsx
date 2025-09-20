import React, { useState, useEffect } from 'react';
import { CostSettings } from '../App';

interface CostSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: CostSettings;
  onSave: (settings: CostSettings) => void;
}

interface FormFieldProps {
  id: keyof CostSettings;
  label: string;
  value: number;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  step: string;
  unit: string;
  helpText: string;
}

const FormField: React.FC<FormFieldProps> = ({ id, label, value, onChange, step, unit, helpText }) => (
    <div>
        <label htmlFor={id} className="block text-sm font-medium text-gray-300">{label}</label>
        <div className="mt-1 relative rounded-md shadow-sm">
            <input
                type="number"
                name={id}
                id={id}
                value={value}
                onChange={onChange}
                step={step}
                min="0"
                required
                className="w-full pl-3 pr-12 py-2 bg-gray-900 border border-gray-600 rounded-md focus:ring-cyan-500 focus:border-cyan-500"
            />
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                <span className="text-gray-500 text-sm">{unit}</span>
            </div>
        </div>
        <p className="mt-1 text-xs text-gray-500">{helpText}</p>
    </div>
);


export const CostSettingsModal: React.FC<CostSettingsModalProps> = ({ isOpen, onClose, settings, onSave }) => {
  const [localSettings, setLocalSettings] = useState<CostSettings>(settings);

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings, isOpen]);

  if (!isOpen) {
    return null;
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setLocalSettings(prev => ({
      ...prev,
      [name]: parseFloat(value) || 0
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(localSettings);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50 backdrop-blur-sm" onClick={onClose}>
      <div className="relative bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md p-6 sm:p-8 border border-cyan-500/30" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-gray-200 z-10">
           <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
        
        <form onSubmit={handleSubmit}>
            <h2 className="text-2xl font-bold mb-1 text-gray-100">Ustawienia Kosztów Wydruku</h2>
            <p className="text-sm text-gray-400 mb-6">Twoje ustawienia zostaną zapisane w przeglądarce.</p>

            <div className="space-y-4">
                <FormField
                    id="filamentPricePerKg"
                    label="Cena filamentu"
                    value={localSettings.filamentPricePerKg}
                    onChange={handleChange}
                    step="0.01"
                    unit="PLN/kg"
                    helpText="Średni koszt rolki filamentu o wadze 1 kg (np. 45 PLN)."
                />
                <FormField
                    id="printerSpeedGramsPerHour"
                    label="Średnia prędkość druku"
                    value={localSettings.printerSpeedGramsPerHour}
                    onChange={handleChange}
                    step="1"
                    unit="g/h"
                    helpText="Szacunkowa ilość gramów filamentu, jaką drukarka zużywa na godzinę pracy (np. ~40 g/h dla normalnej jakości)."
                />
                 <FormField
                    id="printerPowerConsumptionWatts"
                    label="Pobór mocy drukarki"
                    value={localSettings.printerPowerConsumptionWatts}
                    onChange={handleChange}
                    step="1"
                    unit="W"
                    helpText="Średni pobór mocy przez drukarkę 3D podczas pracy (np. 90 W)."
                />
                 <FormField
                    id="electricityPricePerKwh"
                    label="Koszt energii elektrycznej"
                    value={localSettings.electricityPricePerKwh}
                    onChange={handleChange}
                    step="0.01"
                    unit="PLN/kWh"
                    helpText="Cena za jedną kilowatogodzinę prądu (np. 1.2 PLN)."
                />
                 <FormField
                    id="otherCostsPercentage"
                    label="Margines na błędy / inne koszty"
                    value={localSettings.otherCostsPercentage}
                    onChange={handleChange}
                    step="1"
                    unit="%"
                    helpText="Dodatkowy procent doliczany do kosztów na pokrycie nieudanych wydruków, zużycia części itp. (np. 15%)."
                />
            </div>
            <div className="mt-8 flex justify-end gap-4">
                <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white font-bold rounded-md transition-colors"
                >
                    Anuluj
                </button>
                 <button
                    type="submit"
                    className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-md transition-colors"
                >
                    Zapisz ustawienia
                </button>
            </div>
        </form>
      </div>
    </div>
  );
};