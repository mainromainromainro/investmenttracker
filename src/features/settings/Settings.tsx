import React, { useState } from 'react';
import { PageHeading } from '../../components/PageHeading';
import { usePlatformStore } from '../../stores/platformStore';
import { useAssetStore } from '../../stores/assetStore';
import { useTransactionStore } from '../../stores/transactionStore';
import { usePriceStore } from '../../stores/priceStore';
import { useFxStore } from '../../stores/fxStore';
import { adminRepository } from '../../repositories/adminRepository';
import CsvImportSection from '../import/CsvImportSection';
import {
  getLiveDataApiKey,
  hasCustomLiveDataApiKey,
  saveLiveDataApiKey,
} from '../../lib/liveDataConfig';

const Settings: React.FC = () => {
  const cardClass =
    'rounded-[28px] border border-[#cdd6c2] bg-white/65 p-6 shadow-[0_18px_45px_rgba(95,109,78,0.08)] backdrop-blur';
  const [resetting, setResetting] = useState(false);
  const [seedingData, setSeedingData] = useState(false);
  const [liveDataApiKey, setLiveDataApiKey] = useState(() => getLiveDataApiKey());
  const [liveDataMessage, setLiveDataMessage] = useState<string | null>(null);

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
        'Supprimer toutes les données locales ? Cette action efface positions, prix et taux de change.',
      )
    ) {
      return;
    }

    setResetting(true);
    try {
      await adminRepository.resetDatabase();
      await fetchAll();
      alert('Base locale réinitialisée.');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      alert(`Erreur pendant la réinitialisation : ${message}`);
    } finally {
      setResetting(false);
    }
  };

  const handleSeedData = async () => {
    setSeedingData(true);
    try {
      await adminRepository.seedSampleData();
      await fetchAll();
      alert('Données de démonstration ajoutées.');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      alert(`Erreur pendant l’ajout des données : ${message}`);
    } finally {
      setSeedingData(false);
    }
  };

  const handleSaveLiveDataKey = () => {
    saveLiveDataApiKey(liveDataApiKey);
    const hasCustomKey = hasCustomLiveDataApiKey();
    setLiveDataMessage(
      hasCustomKey
        ? 'Clé Twelve Data enregistrée. Les prix et les taux de change live utiliseront maintenant votre compte.'
        : 'Aucune clé personnalisée enregistrée. L’application repasse sur la clé de démonstration, très limitée.',
    );
  };

  const handleClearLiveDataKey = () => {
    setLiveDataApiKey('');
    saveLiveDataApiKey('');
    setLiveDataMessage(
      'Clé supprimée. L’application utilisera la clé de démonstration jusqu’à la prochaine configuration.',
    );
  };

  return (
    <div className="space-y-6">
      <PageHeading
        title="Réglages"
        subtitle="Import mensuel, source live Twelve Data et outils avancés."
      />

      <CsvImportSection />

      <div className={cardClass}>
        <h3 className="text-lg font-semibold text-[#173326]">Twelve Data</h3>
        <p className="mt-2 text-sm text-[#607060]">
          Une seule source pour les prix live et les taux de change. Ajoutez votre clé pour
          fiabiliser la couverture sur l’ensemble du suivi.
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <input
            type="password"
            value={liveDataApiKey}
            onChange={(e) => setLiveDataApiKey(e.target.value)}
            placeholder="Enter Twelve Data API key"
            className="flex-1 rounded-2xl border border-[#c7cfbe] bg-[#faf6ee] px-4 py-3 text-[#173326] outline-none transition focus:border-[#4b775d]"
          />
          <button
            onClick={handleSaveLiveDataKey}
            className="rounded-2xl bg-[#2e6a4c] px-4 py-3 text-sm font-semibold text-[#f8f3e9] transition hover:bg-[#25563d]"
          >
            Enregistrer
          </button>
          <button
            onClick={handleClearLiveDataKey}
            className="rounded-2xl border border-[#c7cfbe] bg-white/55 px-4 py-3 text-sm font-semibold text-[#4f6051] transition hover:bg-white/75"
          >
            Effacer
          </button>
        </div>
        {liveDataMessage && (
          <p className="mt-3 rounded-2xl border border-[#c7d9c8] bg-[#edf6ee] px-4 py-3 text-sm text-[#275339]">
            {liveDataMessage}
          </p>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className={cardClass}>
          <h3 className="text-lg font-semibold text-[#173326]">Données de démonstration</h3>
          <p className="mt-2 text-sm text-[#607060]">
            Utile pour tester l’application rapidement si vous voulez vérifier le rendu sans
            réimporter un relevé tout de suite.
          </p>
          <button
            onClick={handleSeedData}
            disabled={seedingData}
            className="mt-4 rounded-2xl bg-[#5b8c63] px-4 py-3 text-sm font-semibold text-[#f8f3e9] transition hover:bg-[#4f7a57] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {seedingData ? 'Ajout en cours...' : 'Ajouter des données de test'}
          </button>
        </div>

        <div className={cardClass}>
          <h3 className="text-lg font-semibold text-[#173326]">Réinitialiser la base locale</h3>
          <p className="mt-2 text-sm text-[#607060]">
            Efface toutes les données importées et synchronisées. À garder pour un reset complet.
          </p>
          <button
            onClick={handleResetDB}
            disabled={resetting}
            className="mt-4 rounded-2xl bg-[#8a4b42] px-4 py-3 text-sm font-semibold text-[#fbf5ed] transition hover:bg-[#743d36] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {resetting ? 'Réinitialisation...' : 'Vider la base locale'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Settings;
