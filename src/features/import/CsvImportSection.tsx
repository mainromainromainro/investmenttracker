import React, { useMemo, useRef, useState } from 'react';
import {
  CsvParseError,
  NORMALIZED_TRANSACTION_HEADERS,
  NormalizedTransactionRow,
  parseNormalizedTransactionsCsv,
} from '../../lib/csvImport';
import { adminRepository } from '../../repositories/adminRepository';
import { fxRepository } from '../../repositories/fxRepository';
import { usePlatformStore } from '../../stores/platformStore';
import { useAssetStore } from '../../stores/assetStore';
import { useTransactionStore } from '../../stores/transactionStore';
import { usePriceStore } from '../../stores/priceStore';
import { useFxStore } from '../../stores/fxStore';

const BASE_CURRENCY = 'EUR';
const COMMON_CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'CAD', 'SEK'];

const fetchFxRate = async (currency: string): Promise<number | null> => {
  if (currency === BASE_CURRENCY) return 1;
  try {
    const response = await fetch(
      `https://api.frankfurter.app/latest?from=${currency}&to=${BASE_CURRENCY}`,
    );
    if (!response.ok) {
      return null;
    }
    const data = await response.json();
    const rate = data?.rates?.[BASE_CURRENCY];
    return typeof rate === 'number' ? rate : null;
  } catch {
    return null;
  }
};

const useRefreshStores = () => {
  return useMemo(
    () => async () => {
      await Promise.all([
        usePlatformStore.getState().fetchPlatforms(),
        useAssetStore.getState().fetchAssets(),
        useTransactionStore.getState().fetchTransactions(),
        usePriceStore.getState().fetchPrices(),
        useFxStore.getState().fetchFxSnapshots(),
      ]);
    },
    [],
  );
};

const CsvImportSection: React.FC = () => {
  const [csvStatus, setCsvStatus] = useState<'idle' | 'parsing' | 'ready' | 'importing' | 'error'>(
    'idle',
  );
  const [csvRows, setCsvRows] = useState<NormalizedTransactionRow[]>([]);
  const [csvErrors, setCsvErrors] = useState<CsvParseError[]>([]);
  const [csvMessage, setCsvMessage] = useState<string | null>(null);
  const [defaultCurrency, setDefaultCurrency] = useState<string>(BASE_CURRENCY);
  const [fxMessage, setFxMessage] = useState<string | null>(null);
  const csvInputRef = useRef<HTMLInputElement | null>(null);
  const refreshStores = useRefreshStores();

  const csvHeaderExample = NORMALIZED_TRANSACTION_HEADERS.join(',');

  const resetCsvState = (clearMessage: boolean) => {
    setCsvRows([]);
    setCsvErrors([]);
    if (clearMessage) {
      setCsvMessage(null);
      setFxMessage(null);
    }
    setCsvStatus('idle');
    if (csvInputRef.current) {
      csvInputRef.current.value = '';
    }
  };

  const handleCsvFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    setCsvErrors([]);
    setCsvRows([]);
    setCsvMessage(null);
    setFxMessage(null);
    const file = event.target.files?.[0];
    if (!file) {
      setCsvStatus('idle');
      return;
    }
    setCsvStatus('parsing');
    try {
      const text = await file.text();
      const result = parseNormalizedTransactionsCsv(text, {
        defaultCurrency,
      });
      if (result.errors.length > 0) {
        setCsvErrors(result.errors);
        setCsvStatus('error');
        return;
      }
      if (result.records.length === 0) {
        setCsvStatus('error');
        setCsvMessage('Aucune ligne valide détectée dans ce fichier.');
        return;
      }
      setCsvRows(result.records);
      setCsvStatus('ready');
      setCsvMessage(`${result.records.length} transactions prêtes à être importées.`);
    } catch (error) {
      setCsvStatus('error');
      setCsvErrors([
        {
          row: 0,
          message:
            error instanceof Error
              ? error.message
              : 'Erreur inattendue lors du parsing du CSV.',
        },
      ]);
    }
  };

  const ensureFxRates = async (rows: NormalizedTransactionRow[]) => {
    const uniqueCurrencies = Array.from(new Set(rows.map((row) => row.currency))).filter(
      (currency) => currency && currency !== BASE_CURRENCY,
    );
    if (uniqueCurrencies.length === 0) return;

    const messages: string[] = [];
    for (const currency of uniqueCurrencies) {
      const rate = await fetchFxRate(currency);
      if (!rate) {
        messages.push(`FX introuvable pour ${currency}/${BASE_CURRENCY}. Ajoutez-le manuellement.`);
        continue;
      }
      await fxRepository.create({
        id: `fx_${currency}_${Date.now()}`,
        pair: `${currency}/${BASE_CURRENCY}`,
        date: Date.now(),
        rate,
      });
      messages.push(`FX ${currency}/${BASE_CURRENCY} mis à jour (${rate.toFixed(4)}).`);
    }
    setFxMessage(messages.join(' '));
  };

  const handleImportCsv = async () => {
    if (!csvRows.length || csvStatus === 'importing') {
      return;
    }
    setCsvStatus('importing');
    try {
      const result = await adminRepository.importNormalizedTransactions(csvRows);
      await ensureFxRates(csvRows);
      await refreshStores();
      setCsvMessage(
        `Import terminé : ${result.transactionsCreated} transactions, ${result.assetsCreated} nouveaux actifs, ${result.platformsCreated} nouvelles plateformes.`,
      );
      resetCsvState(false);
    } catch (error) {
      setCsvStatus('error');
      setCsvErrors([
        {
          row: 0,
          message:
            error instanceof Error ? error.message : 'Erreur inattendue lors de l’import.',
        },
      ]);
    }
  };

  const importDisabled =
    csvStatus === 'importing' ||
    csvStatus === 'parsing' ||
    csvRows.length === 0 ||
    csvErrors.length > 0;

  return (
    <div className="bg-white rounded-lg shadow p-6 space-y-4">
      <div className="space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Import CSV normalisé</h3>
            <p className="text-sm text-gray-600">
              Fournissez un CSV: les noms de colonnes sont reconnus automatiquement (ordre libre) :
            </p>
            <span className="block font-mono text-xs text-gray-700 mt-2 break-all">
              {csvHeaderExample}
            </span>
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-gray-600 font-medium mb-1">Devise par défaut</label>
            <select
              value={defaultCurrency}
              onChange={(e) => setDefaultCurrency(e.target.value)}
              className="px-2 py-1 border border-gray-300 rounded text-sm text-gray-900"
            >
              {COMMON_CURRENCIES.map((currency) => (
                <option key={currency} value={currency}>
                  {currency}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="text-sm text-gray-600">
          Les types de transaction autorisés sont BUY, SELL, DEPOSIT, WITHDRAW, FEE. Pour BUY / SELL,
          les colonnes <em>asset_*</em>, qty et price sont obligatoires. La devise par défaut est
          utilisée si aucune colonne liée n’est fournie et qu’aucune devise n’est déduite du ticker.
        </p>
      </div>

      <input
        ref={csvInputRef}
        type="file"
        accept=".csv,text/csv"
        onChange={handleCsvFile}
        className="block w-full text-sm text-gray-700"
      />

      {csvMessage && (
        <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          {csvMessage}
        </div>
      )}

      {fxMessage && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {fxMessage}
        </div>
      )}

      {csvErrors.length > 0 && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 space-y-2">
          <p>Erreurs détectées :</p>
          <ul className="list-disc pl-5 space-y-1">
            {csvErrors.slice(0, 5).map((error) => (
              <li key={`${error.row}-${error.message}`}>
                {error.row > 0 ? `Ligne ${error.row}: ` : ''}
                {error.message}
              </li>
            ))}
            {csvErrors.length > 5 && (
              <li>… {csvErrors.length - 5} erreurs supplémentaires</li>
            )}
          </ul>
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleImportCsv}
          disabled={importDisabled}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition disabled:bg-gray-400"
        >
          {csvStatus === 'importing'
            ? 'Import en cours…'
            : `Importer${csvRows.length ? ` (${csvRows.length})` : ''}`}
        </button>
        <button
          type="button"
          onClick={() => resetCsvState(true)}
          className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
        >
          Réinitialiser
        </button>
      </div>
    </div>
  );
};

export default CsvImportSection;
