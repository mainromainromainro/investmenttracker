import React, { useState } from 'react';
import { PageHeading } from '../../components/PageHeading';
import { usePlatformStore } from '../../stores/platformStore';
import { useAssetStore } from '../../stores/assetStore';
import { useTransactionStore } from '../../stores/transactionStore';
import { usePriceStore } from '../../stores/priceStore';
import { useFxStore } from '../../stores/fxStore';
import { adminRepository } from '../../repositories/adminRepository';
import CsvImportSection from '../import/CsvImportSection';

const Settings: React.FC = () => {
  const [resetting, setResetting] = useState(false);
  const [seedingData, setSeedingData] = useState(false);

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
    if (
      !window.confirm(
        'Are you sure? This will permanently delete ALL data (platforms, assets, transactions, prices, FX rates).',
      )
    ) {
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

  return (
    <div className="space-y-6">
      <PageHeading title="Settings" subtitle="Manage your database" />

      {/* CSV Import */}
      <CsvImportSection />

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
