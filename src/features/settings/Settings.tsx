import React, { useRef, useState } from 'react';
import { PageHeading } from '../../components/PageHeading';
import { usePlatformStore } from '../../stores/platformStore';
import { useAssetStore } from '../../stores/assetStore';
import { useTransactionStore } from '../../stores/transactionStore';
import { usePriceStore } from '../../stores/priceStore';
import { useFxStore } from '../../stores/fxStore';
import { adminRepository } from '../../repositories/adminRepository';
import {
  CsvParseError,
  NORMALIZED_TRANSACTION_HEADERS,
  NormalizedTransactionRow,
  parseNormalizedTransactionsCsv,
} from '../../lib/csvImport';

const Settings: React.FC = () => {
  const [resetting, setResetting] = useState(false);
  const [seedingData, setSeedingData] = useState(false);
  const [csvStatus, setCsvStatus] = useState<'idle' | 'parsing' | 'ready' | 'importing' | 'error'>('idle');
  const [csvRows, setCsvRows] = useState<NormalizedTransactionRow[]>([]);
  const [csvErrors, setCsvErrors] = useState<CsvParseError[]>([]);
  const [csvMessage, setCsvMessage] = useState<string | null>(null);
  const csvInputRef = useRef<HTMLInputElement | null>(null);

  const fetchAll = async () => {
    await Promise.all([
      usePlatformStore.getState().fetchPlatforms(),
      useAssetStore.getState().fetchAssets(),
      useTransactionStore.getState().fetchTransactions(),
      usePriceStore.getState().fetchPrices(),
      useFxStore.getState().fetchFxSnapshots(),
    ]);
  };

  const handleResetDB = async () => {
    if (!window.confirm(
      'Are you sure? This will permanently delete ALL data (platforms, assets, transactions, prices, FX rates).'
    )) {
      return;
    }

    setResetting(true);
    try {
      await adminRepository.resetDatabase();
      await fetchAll();
      alert('Database reset successfully!');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      alert(`Error resetting database: ${message}`);
    } finally {
      setResetting(false);
    }
  };

  const handleSeedData = async () => {
    setSeedingData(true);
    try {
      await adminRepository.seedSampleData();
      await fetchAll();
      alert('Seed data added successfully!');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      alert(`Error seeding data: ${message}`);
    } finally {
      setSeedingData(false);
    }
  };

  const handleCsvFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    setCsvErrors([]);
    setCsvRows([]);
    setCsvMessage(null);
    const file = event.target.files?.[0];
    if (!file) {
      setCsvStatus('idle');
      return;
    }
    setCsvStatus('parsing');
    try {
      const text = await file.text();
      const result = parseNormalizedTransactionsCsv(text);
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

  const resetCsvState = (clearMessage: boolean) => {
    setCsvRows([]);
    setCsvErrors([]);
    if (clearMessage) {
      setCsvMessage(null);
    }
    setCsvStatus('idle');
    if (csvInputRef.current) {
      csvInputRef.current.value = '';
    }
  };

  const handleImportCsv = async () => {
    if (!csvRows.length || csvStatus === 'importing') {
      return;
    }
    setCsvStatus('importing');
    try {
      const result = await adminRepository.importNormalizedTransactions(csvRows);
      await fetchAll();
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

  const csvHeaderExample = NORMALIZED_TRANSACTION_HEADERS.join(',');
  const importDisabled =
    csvStatus === 'importing' ||
    csvStatus === 'parsing' ||
    csvRows.length === 0 ||
    csvErrors.length > 0;

  return (
    <div className="space-y-6">
      <PageHeading
        title="Settings"
        subtitle="Manage your database"
      />

      {/* Seed Data */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Seed Sample Data</h3>
        <p className="text-sm text-gray-600 mb-4">
          Add sample platforms, assets, transactions, and prices to test the app.
        </p>
        <button
          onClick={handleSeedData}
          disabled={seedingData}
          className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition disabled:bg-gray-400"
        >
          {seedingData ? 'Seeding...' : 'Add Sample Data'}
        </button>
      </div>

      {/* CSV Import */}
      <div className="bg-white rounded-lg shadow p-6 space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Import CSV normalisé</h3>
          <p className="text-sm text-gray-600">
            Fournissez un fichier CSV avec les colonnes suivantes (ordre libre) :
            <span className="block font-mono text-xs text-gray-700 mt-2 break-all">
              {csvHeaderExample}
            </span>
          </p>
          <p className="text-sm text-gray-600 mt-2">
            Les types de transaction autorisés sont BUY, SELL, DEPOSIT, WITHDRAW, FEE. Pour BUY /
            SELL, les colonnes <em>asset_*</em>, qty et price sont obligatoires.
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

      {/* Reset Database */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Reset Database</h3>
        <p className="text-sm text-gray-600 mb-4">
          This will permanently delete all data. This action cannot be undone.
        </p>
        <button
          onClick={handleResetDB}
          disabled={resetting}
          className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition disabled:bg-gray-400"
        >
          {resetting ? 'Resetting...' : 'Reset Database'}
        </button>
      </div>

      {/* Database Info */}
      <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">About</h3>
        <ul className="space-y-2 text-sm text-gray-700">
          <li>
            <strong>Storage:</strong> IndexedDB (browser local storage)
          </li>
          <li>
            <strong>Database:</strong> InvestmentTrackerDB
          </li>
          <li>
            <strong>Base Currency:</strong> EUR
          </li>
          <li>
            <strong>Last Updated:</strong> {new Date().toLocaleString()}
          </li>
        </ul>
      </div>
    </div>
  );
};

export default Settings;
