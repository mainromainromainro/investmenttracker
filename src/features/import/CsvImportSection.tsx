import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CsvParseError,
  NORMALIZED_POSITION_SNAPSHOT_HEADERS,
  NormalizedPositionSnapshotRow,
  parseNormalizedPositionSnapshotsCsv,
} from '../../lib/csvImport';
import { fetchFxRatesToEur } from '../../lib/liveMarketData';
import { adminRepository } from '../../repositories/adminRepository';
import { fxRepository } from '../../repositories/fxRepository';
import { useAssetStore } from '../../stores/assetStore';
import { useFxStore } from '../../stores/fxStore';
import { usePlatformStore } from '../../stores/platformStore';
import { usePriceStore } from '../../stores/priceStore';
import { useTransactionStore } from '../../stores/transactionStore';
import { buildFileFingerprint, formatFileSize, formatLongDateTime } from './importUx';

const BASE_CURRENCY = 'EUR';
const COMMON_CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'CAD', 'SEK'];

const formatShortDate = (value: number | null): string => {
  if (value === null) return 'n/a';
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(value);
};

const buildScopeKey = (defaultPlatform: string, accountName: string): string =>
  [defaultPlatform.trim(), accountName.trim()]
    .filter(Boolean)
    .join('|') || '__default__';

const useRefreshStores = () =>
  useMemo(
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

const CsvImportSection: React.FC = () => {
  const fetchPlatforms = usePlatformStore((state) => state.fetchPlatforms);

  const [status, setStatus] = useState<'idle' | 'parsing' | 'ready' | 'importing' | 'error'>(
    'idle',
  );
  const [csvText, setCsvText] = useState<string | null>(null);
  const [rows, setRows] = useState<NormalizedPositionSnapshotRow[]>([]);
  const [errors, setErrors] = useState<CsvParseError[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [defaultCurrency, setDefaultCurrency] = useState(BASE_CURRENCY);
  const [defaultPlatform, setDefaultPlatform] = useState('');
  const [targetAccountName, setTargetAccountName] = useState('');
  const [selectedFile, setSelectedFile] = useState<{
    name: string;
    size: number;
    lastModified: number;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const csvInputRef = useRef<HTMLInputElement | null>(null);
  const refreshStores = useRefreshStores();

  useEffect(() => {
    void fetchPlatforms();
  }, [fetchPlatforms]);

  useEffect(() => {
    if (!csvText) {
      setRows([]);
      setErrors([]);
      return;
    }

    const result = parseNormalizedPositionSnapshotsCsv(csvText, {
      defaultCurrency,
      defaultPlatform: defaultPlatform.trim() || undefined,
    });

    setRows(result.records);
    setErrors(result.errors);

    if (result.records.length === 0) {
      setStatus('error');
      setMessage(
        result.errors[0]?.message ??
          'Aucune ligne exploitable n’a été reconnue dans ce fichier mensuel.',
      );
      return;
    }

    if (result.errors.length > 0) {
      setStatus('error');
      setMessage(
        `${result.records.length} ligne(s) reconnue(s), mais ${result.errors.length} erreur(s) bloquent encore l’import.`,
      );
      return;
    }

    setStatus('ready');
    setMessage(`${result.records.length} ligne(s) prêtes à être importées.`);
  }, [csvText, defaultCurrency, defaultPlatform]);

  const fileFingerprint = useMemo(() => {
    if (!csvText) return null;
    return buildFileFingerprint(
      csvText,
      'monthly_positions',
      buildScopeKey(defaultPlatform, targetAccountName),
    );
  }, [csvText, defaultPlatform, targetAccountName]);

  const preview = useMemo(() => {
    if (!rows.length) return null;

    const currencies = Array.from(new Set(rows.map((row) => row.currency))).sort();
    const platforms = Array.from(new Set(rows.map((row) => row.platform))).sort();
    const dates = rows.map((row) => row.date);

    return {
      rowCount: rows.length,
      assetCount: new Set(rows.map((row) => row.assetSymbol)).size,
      platformCount: platforms.length,
      currencies,
      pricedCount: rows.filter((row) => typeof row.price === 'number').length,
      startDate: dates.length ? Math.min(...dates) : null,
      endDate: dates.length ? Math.max(...dates) : null,
      sampleRows: rows.slice(0, 6),
    };
  }, [rows]);

  const resetState = () => {
    setStatus('idle');
    setCsvText(null);
    setRows([]);
    setErrors([]);
    setMessage(null);
    setSelectedFile(null);
    if (csvInputRef.current) {
      csvInputRef.current.value = '';
    }
  };

  const loadCsvFile = async (file: File) => {
    setStatus('parsing');
    setMessage(null);
    setErrors([]);

    try {
      const text = await file.text();
      setCsvText(text);
      setSelectedFile({
        name: file.name,
        size: file.size,
        lastModified: file.lastModified,
      });
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Impossible de lire le fichier.');
    }
  };

  const handleCsvFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    await loadCsvFile(file);
  };

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) {
      await loadCsvFile(file);
    }
  };

  const handleImport = async () => {
    if (!rows.length || !selectedFile || !fileFingerprint || status === 'importing') {
      return;
    }

    setStatus('importing');

    try {
      const result = await adminRepository.importMonthlyPositionSnapshots(rows, {
        fileName: selectedFile.name,
        fileSize: selectedFile.size,
        fileLastModified: selectedFile.lastModified,
        fileFingerprint,
        sourceProfile: 'monthly_statement',
        targetAccountName: targetAccountName.trim() || undefined,
      });

      const fxResult = await fetchFxRatesToEur(rows.map((row) => row.currency));
      const now = Date.now();
      const fxEntries = Object.entries(fxResult.rates);

      await Promise.all(
        fxEntries.map(([currency, rate], index) =>
          fxRepository.create({
            id: `fx_import_${currency}_${now}_${index}`,
            pair: `${currency}/EUR`,
            date: now,
            rate,
          }),
        ),
      );

      await refreshStores();

      if (result.duplicateSkipped) {
        setMessage(
          'Ce relevé a déjà été importé pour cette portée. Changez le compte cible si vous voulez l’isoler ailleurs.',
        );
      } else {
        const parts = [
          `${result.snapshotsUpserted} ligne(s) importée(s)`,
          `${result.syntheticTransactionsRebuilt} mouvement(s) recalculé(s)`,
        ];

        if (fxEntries.length > 0) {
          parts.push(`${fxEntries.length} taux de change mis à jour`);
        }
        if (fxResult.errors.length > 0) {
          parts.push(`${fxResult.errors.length} devise(s) sans taux live`);
        }

        setMessage(parts.join(' · ') + '.');
      }

      setStatus('ready');
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Erreur pendant l’import.');
    }
  };

  const headerExample = NORMALIZED_POSITION_SNAPSHOT_HEADERS.join(',');
  const canImport = status === 'ready' && rows.length > 0 && errors.length === 0;

  return (
    <section className="rounded-[30px] border border-[#d0d8c5] bg-white/68 p-6 shadow-[0_24px_60px_rgba(90,103,78,0.10)] backdrop-blur">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <p className="text-xs uppercase tracking-[0.28em] text-[#6d7a69]">Import mensuel</p>
          <h3 className="mt-2 text-2xl font-semibold text-[#173326] sm:text-3xl">
            Déposez votre CSV et l’application reconnaît directement vos positions.
          </h3>
          <p className="mt-3 text-sm leading-6 text-[#607060]">
            Un seul flux, pensé pour votre relevé mensuel personnel. Le fichier est lu, résumé,
            puis importé sans assistant ni écran de configuration supplémentaire.
          </p>
        </div>

        <div className="rounded-[24px] border border-[#d9dfce] bg-[#f8f4eb]/85 px-4 py-4 text-sm text-[#5a6a5b] lg:max-w-md">
          <p className="text-xs uppercase tracking-[0.22em] text-[#778473]">Structure reconnue</p>
          <p className="mt-2 break-all font-mono text-xs text-[#35513f]">{headerExample}</p>
        </div>
      </div>

      <div
        className={`mt-6 rounded-[28px] border border-dashed p-6 transition ${
          isDragging
            ? 'border-[#4b775d] bg-[#edf4ee]'
            : 'border-[#c8d1be] bg-[#fbf7ef]/80 hover:border-[#92af95] hover:bg-white/80'
        }`}
        onDragEnter={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <label className="block cursor-pointer">
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleCsvFile}
            className="sr-only"
          />

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-lg font-semibold text-[#173326]">
                {selectedFile ? 'Remplacer le relevé actuel' : 'Choisir un CSV mensuel'}
              </p>
              <p className="mt-1 text-sm text-[#607060]">
                Glissez-déposez votre fichier ici ou cliquez pour le sélectionner.
              </p>
            </div>

            <div className="inline-flex rounded-full bg-[#2e6a4c] px-4 py-2 text-sm font-semibold text-[#faf5eb]">
              Ouvrir un fichier
            </div>
          </div>
        </label>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <label className="rounded-[24px] border border-[#d8dfcd] bg-[#f8f4eb]/85 p-4">
          <span className="text-xs uppercase tracking-[0.2em] text-[#768171]">Plateforme par défaut</span>
          <input
            value={defaultPlatform}
            onChange={(event) => setDefaultPlatform(event.target.value)}
            placeholder="Seulement si le CSV n’a pas de colonne platform"
            className="mt-3 w-full rounded-2xl border border-[#ccd4c3] bg-white/80 px-4 py-3 text-sm text-[#173326] outline-none transition focus:border-[#4b775d]"
          />
        </label>

        <label className="rounded-[24px] border border-[#d8dfcd] bg-[#f8f4eb]/85 p-4">
          <span className="text-xs uppercase tracking-[0.2em] text-[#768171]">Compte cible</span>
          <input
            value={targetAccountName}
            onChange={(event) => setTargetAccountName(event.target.value)}
            placeholder="Optionnel, pour isoler l’import"
            className="mt-3 w-full rounded-2xl border border-[#ccd4c3] bg-white/80 px-4 py-3 text-sm text-[#173326] outline-none transition focus:border-[#4b775d]"
          />
        </label>

        <label className="rounded-[24px] border border-[#d8dfcd] bg-[#f8f4eb]/85 p-4">
          <span className="text-xs uppercase tracking-[0.2em] text-[#768171]">Devise par défaut</span>
          <select
            value={defaultCurrency}
            onChange={(event) => setDefaultCurrency(event.target.value)}
            className="mt-3 w-full rounded-2xl border border-[#ccd4c3] bg-white/80 px-4 py-3 text-sm text-[#173326] outline-none transition focus:border-[#4b775d]"
          >
            {COMMON_CURRENCIES.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </select>
        </label>
      </div>

      {selectedFile && (
        <div className="mt-6 grid gap-3 rounded-[26px] border border-[#d7dfcb] bg-[#fcf9f2]/85 p-4 text-sm text-[#58685a] md:grid-cols-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-[#7b8678]">Fichier</p>
            <p className="mt-1 font-medium text-[#173326]">{selectedFile.name}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-[#7b8678]">Taille</p>
            <p className="mt-1 font-medium text-[#173326]">{formatFileSize(selectedFile.size)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-[#7b8678]">Modifié</p>
            <p className="mt-1 font-medium text-[#173326]">
              {formatLongDateTime(selectedFile.lastModified)}
            </p>
          </div>
        </div>
      )}

      {message && (
        <div
          className={`mt-6 rounded-[24px] border px-4 py-3 text-sm ${
            status === 'error'
              ? 'border-[#d9b2ac] bg-[#fff3f1] text-[#8a4b42]'
              : 'border-[#cadcc9] bg-[#edf6ee] text-[#275339]'
          }`}
        >
          {message}
        </div>
      )}

      {errors.length > 0 && (
        <div className="mt-4 rounded-[24px] border border-[#e1cbc6] bg-[#fff6f4] px-4 py-4 text-sm text-[#87544d]">
          <p className="font-semibold text-[#6f3f39]">Points à corriger dans le fichier</p>
          <ul className="mt-3 space-y-2">
            {errors.slice(0, 4).map((error) => (
              <li key={`${error.row}-${error.message}`}>
                {error.row > 0 ? `Ligne ${error.row} : ` : ''}
                {error.message}
              </li>
            ))}
            {errors.length > 4 && <li>… {errors.length - 4} erreur(s) supplémentaire(s).</li>}
          </ul>
        </div>
      )}

      {preview && (
        <div className="mt-6 space-y-5">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="rounded-[24px] border border-[#d7dfcb] bg-[#f8f4eb]/85 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-[#7b8678]">Lignes</p>
              <p className="mt-2 text-2xl font-semibold text-[#173326]">{preview.rowCount}</p>
            </div>
            <div className="rounded-[24px] border border-[#d7dfcb] bg-[#f8f4eb]/85 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-[#7b8678]">Actifs</p>
              <p className="mt-2 text-2xl font-semibold text-[#173326]">{preview.assetCount}</p>
            </div>
            <div className="rounded-[24px] border border-[#d7dfcb] bg-[#f8f4eb]/85 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-[#7b8678]">Plateformes</p>
              <p className="mt-2 text-2xl font-semibold text-[#173326]">{preview.platformCount}</p>
            </div>
            <div className="rounded-[24px] border border-[#d7dfcb] bg-[#f8f4eb]/85 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-[#7b8678]">Lignes avec prix</p>
              <p className="mt-2 text-2xl font-semibold text-[#173326]">{preview.pricedCount}</p>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
            <div className="rounded-[26px] border border-[#d7dfcb] bg-[#fcf9f2]/85 p-5">
              <p className="text-xs uppercase tracking-[0.22em] text-[#7b8678]">Résumé</p>
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-[#607060]">Période</dt>
                  <dd className="font-medium text-[#173326]">
                    {formatShortDate(preview.startDate)} → {formatShortDate(preview.endDate)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-[#607060]">Devises</dt>
                  <dd className="font-medium text-[#173326]">{preview.currencies.join(', ')}</dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-[#607060]">Compte cible</dt>
                  <dd className="font-medium text-[#173326]">
                    {targetAccountName.trim() || 'Compte principal par plateforme'}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="overflow-hidden rounded-[26px] border border-[#d7dfcb] bg-white/78">
              <div className="border-b border-[#e3e7d7] px-5 py-4">
                <p className="text-xs uppercase tracking-[0.22em] text-[#7b8678]">Aperçu</p>
                <p className="mt-1 text-sm text-[#607060]">
                  Les premières lignes reconnues avant l’import.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="bg-[#f3efe4] text-[#516252]">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold">Date</th>
                      <th className="px-4 py-3 text-left font-semibold">Plateforme</th>
                      <th className="px-4 py-3 text-left font-semibold">Actif</th>
                      <th className="px-4 py-3 text-right font-semibold">Qté</th>
                      <th className="px-4 py-3 text-right font-semibold">Prix</th>
                      <th className="px-4 py-3 text-left font-semibold">Devise</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#eaeee1] text-[#173326]">
                    {preview.sampleRows.map((row, index) => (
                      <tr key={`${row.assetSymbol}-${row.date}-${index}`} className="hover:bg-[#f8fbf5]">
                        <td className="px-4 py-3">{formatShortDate(row.date)}</td>
                        <td className="px-4 py-3">{row.platform}</td>
                        <td className="px-4 py-3">
                          <div className="font-semibold">{row.assetSymbol}</div>
                          <div className="text-xs text-[#6a7868]">{row.assetName ?? 'Nom non fourni'}</div>
                        </td>
                        <td className="px-4 py-3 text-right">{row.qty.toFixed(4)}</td>
                        <td className="px-4 py-3 text-right">
                          {typeof row.price === 'number' ? row.price.toFixed(2) : '—'}
                        </td>
                        <td className="px-4 py-3">{row.currency}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handleImport}
          disabled={!canImport}
          className="rounded-full bg-[#2e6a4c] px-5 py-3 text-sm font-semibold text-[#faf5eb] transition hover:bg-[#25563d] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {status === 'importing'
            ? 'Import en cours...'
            : `Importer le relevé${rows.length ? ` (${rows.length})` : ''}`}
        </button>
        <button
          type="button"
          onClick={resetState}
          className="rounded-full border border-[#ccd4c3] bg-white/50 px-5 py-3 text-sm font-semibold text-[#4f6051] transition hover:bg-white/75"
        >
          Réinitialiser
        </button>
      </div>
    </section>
  );
};

export default CsvImportSection;
