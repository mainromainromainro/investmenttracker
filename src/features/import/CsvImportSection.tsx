import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CsvParseError,
  NormalizedPositionSnapshotRow,
  NormalizedTransactionRow,
  parseNormalizedPositionSnapshotsCsv,
  parseNormalizedTransactionsCsv,
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

type ParsedImportRow = NormalizedTransactionRow | NormalizedPositionSnapshotRow;
type ParsedImportMode = 'transactions' | 'monthly_positions';

interface ParsedImportResult {
  mode: ParsedImportMode;
  rows: ParsedImportRow[];
  errors: CsvParseError[];
}

const formatShortDate = (value: number | null): string => {
  if (value === null) return 'n/a';
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(value);
};

const isTransactionRow = (row: ParsedImportRow): row is NormalizedTransactionRow => 'kind' in row;

const buildScopeKey = (defaultPlatform: string, accountName: string): string =>
  [defaultPlatform.trim(), accountName.trim()]
    .filter(Boolean)
    .join('|') || '__default__';

const looksLikeTransactionCsv = (csvText: string): boolean => {
  const firstLine = (csvText.split(/\r?\n/, 1)[0] ?? '').toLowerCase();
  return /(action|kind|operation|transaction|side|ordre|type)/.test(firstLine);
};

const parseInvestmentTrackingCsv = (
  csvText: string,
  defaultPlatform: string,
): ParsedImportResult => {
  const sharedOptions = {
    defaultCurrency: BASE_CURRENCY,
    defaultPlatform: defaultPlatform.trim() || undefined,
  };

  const transactionResult = parseNormalizedTransactionsCsv(csvText, sharedOptions);
  const snapshotResult = parseNormalizedPositionSnapshotsCsv(csvText, sharedOptions);
  const transactionHint = looksLikeTransactionCsv(csvText);

  if (transactionHint && transactionResult.records.length > 0) {
    return {
      mode: 'transactions',
      rows: transactionResult.records,
      errors: transactionResult.errors,
    };
  }

  if (snapshotResult.records.length > 0 && transactionResult.records.length === 0) {
    return {
      mode: 'monthly_positions',
      rows: snapshotResult.records,
      errors: snapshotResult.errors,
    };
  }

  if (transactionResult.records.length > 0 && snapshotResult.records.length === 0) {
    return {
      mode: 'transactions',
      rows: transactionResult.records,
      errors: transactionResult.errors,
    };
  }

  if (transactionResult.records.length >= snapshotResult.records.length) {
    return {
      mode: 'transactions',
      rows: transactionResult.records,
      errors: transactionResult.errors,
    };
  }

  return {
    mode: 'monthly_positions',
    rows: snapshotResult.records,
    errors: snapshotResult.errors,
  };
};

const formatKindLabel = (row: ParsedImportRow): string => {
  if (!isTransactionRow(row)) {
    return 'Position';
  }

  switch (row.kind) {
    case 'BUY':
      return 'Achat';
    case 'SELL':
      return 'Vente';
    case 'DIVIDEND':
      return 'Dividende';
    case 'DEPOSIT':
      return 'Top up';
    case 'WITHDRAW':
      return 'Retrait';
    case 'TRANSFER_IN':
      return 'Transfert entrant';
    case 'TRANSFER_OUT':
      return 'Transfert sortant';
    case 'STAKING_REWARD':
      return 'Reward';
    case 'AIRDROP':
      return 'Airdrop';
    case 'FEE':
      return 'Frais';
    default:
      return row.kind;
  }
};

const formatRowDetail = (row: ParsedImportRow): string => {
  if (isTransactionRow(row)) {
    if (typeof row.qty === 'number' && typeof row.price === 'number') {
      return `${row.qty.toFixed(4)} × ${row.price.toFixed(2)}`;
    }
    if (typeof row.qty === 'number') {
      return row.qty.toFixed(4);
    }
    if (typeof row.price === 'number') {
      return row.price.toFixed(2);
    }
    return '—';
  }

  if (typeof row.price === 'number') {
    return `${row.qty.toFixed(4)} × ${row.price.toFixed(2)}`;
  }

  return row.qty.toFixed(4);
};

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
  const [parsedImport, setParsedImport] = useState<ParsedImportResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [defaultPlatform, setDefaultPlatform] = useState('Portefeuille principal');
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
      setParsedImport(null);
      return;
    }

    const result = parseInvestmentTrackingCsv(csvText, defaultPlatform);
    setParsedImport(result);

    if (result.rows.length === 0) {
      setStatus('error');
      setMessage(
        result.errors[0]?.message ??
          'Aucune ligne utile n’a été reconnue pour le suivi de performance.',
      );
      return;
    }

    setStatus('ready');
    if (result.errors.length > 0) {
      setMessage(
        `${result.rows.length} ligne(s) utiles détectées. ${result.errors.length} ligne(s) secondaires ou incomplètes seront ignorées.`,
      );
      return;
    }

    setMessage(
      result.mode === 'transactions'
        ? `${result.rows.length} transaction(s) prêtes à être importées.`
        : `${result.rows.length} position(s) prêtes à être importées.`,
    );
  }, [csvText, defaultPlatform]);

  const fileFingerprint = useMemo(() => {
    if (!csvText) return null;
    const mode = parsedImport?.mode ?? 'transactions';
    return buildFileFingerprint(
      csvText,
      mode,
      buildScopeKey(defaultPlatform, targetAccountName),
    );
  }, [csvText, parsedImport?.mode, defaultPlatform, targetAccountName]);

  const preview = useMemo(() => {
    if (!parsedImport || parsedImport.rows.length === 0) return null;

    const currencies = new Set<string>();
    const assetSymbols = new Set<string>();
    const platforms = new Set<string>();
    const kinds = new Set<string>();
    const dates: number[] = [];

    for (const row of parsedImport.rows) {
      dates.push(row.date);
      platforms.add(row.platform);
      currencies.add(row.currency);
      if ('assetSymbol' in row && row.assetSymbol) {
        assetSymbols.add(row.assetSymbol);
      }
      if (isTransactionRow(row)) {
        kinds.add(row.kind);
        if (row.cashCurrency) {
          currencies.add(row.cashCurrency);
        }
      }
    }

    return {
      mode: parsedImport.mode,
      rowCount: parsedImport.rows.length,
      ignoredCount: parsedImport.errors.length,
      assetCount: assetSymbols.size,
      platformCount: platforms.size,
      currencies: Array.from(currencies).sort(),
      kindCount: kinds.size,
      startDate: dates.length ? Math.min(...dates) : null,
      endDate: dates.length ? Math.max(...dates) : null,
      sampleRows: parsedImport.rows.slice(0, 6),
    };
  }, [parsedImport]);

  const resetState = () => {
    setStatus('idle');
    setCsvText(null);
    setParsedImport(null);
    setMessage(null);
    setSelectedFile(null);
    if (csvInputRef.current) {
      csvInputRef.current.value = '';
    }
  };

  const loadCsvFile = async (file: File) => {
    setStatus('parsing');
    setMessage(null);

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
    if (!file) return;
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

  const syncFxRates = async (rows: ParsedImportRow[]) => {
    const currencies = rows.flatMap((row) =>
      isTransactionRow(row) ? [row.currency, row.cashCurrency] : [row.currency],
    ).filter((currency): currency is string => Boolean(currency));
    const fxResult = await fetchFxRatesToEur(currencies);
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

    return {
      syncedCount: fxEntries.length,
      missingCount: fxResult.errors.length,
    };
  };

  const handleImport = async () => {
    if (!parsedImport || !parsedImport.rows.length || !selectedFile || !fileFingerprint || status === 'importing') {
      return;
    }

    setStatus('importing');

    try {
      const importOptions = {
        fileName: selectedFile.name,
        fileSize: selectedFile.size,
        fileLastModified: selectedFile.lastModified,
        fileFingerprint,
        sourceProfile: parsedImport.mode === 'transactions' ? 'broker_export' : 'monthly_statement',
        targetAccountName: targetAccountName.trim() || undefined,
      } as const;

      const fxSummary = await syncFxRates(parsedImport.rows);
      if (parsedImport.mode === 'transactions') {
        const result = await adminRepository.importNormalizedTransactions(
          parsedImport.rows as NormalizedTransactionRow[],
          importOptions,
        );

        await refreshStores();

        if (result.duplicateSkipped) {
          setMessage(
            'Ce fichier a déjà été importé pour cette portée. Change le compte cible pour créer une portée distincte.',
          );
        } else {
          setMessage(
            `${result.transactionsCreated} transaction(s) importée(s) · ${fxSummary.syncedCount} taux FX mis à jour${
              fxSummary.missingCount > 0 ? ` · ${fxSummary.missingCount} devise(s) sans taux live` : ''
            }.`,
          );
        }
      } else {
        const result = await adminRepository.importMonthlyPositionSnapshots(
          parsedImport.rows as NormalizedPositionSnapshotRow[],
          importOptions,
        );

        await refreshStores();

        if (result.duplicateSkipped) {
          setMessage(
            'Ce fichier a déjà été importé pour cette portée. Change le compte cible pour créer une portée distincte.',
          );
        } else {
          setMessage(
            `${result.snapshotsUpserted} position(s) importée(s) · ${result.syntheticTransactionsRebuilt} mouvement(s) recalculé(s) · ${fxSummary.syncedCount} taux FX mis à jour${
              fxSummary.missingCount > 0 ? ` · ${fxSummary.missingCount} devise(s) sans taux live` : ''
            }.`,
          );
        }
      }

      setStatus('ready');
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Erreur pendant l’import.');
    }
  };

  const ignoredErrors = parsedImport?.errors ?? [];
  const canImport = status === 'ready' && Boolean(parsedImport?.rows.length);

  return (
    <section className="rounded-[30px] border border-[#e8d6ac]/18 bg-[#0f2d20]/88 p-6 shadow-[0_30px_70px_rgba(5,18,12,0.35)] backdrop-blur">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-[#c8b788]">Import CSV</p>
          <h3 className="mt-2 text-2xl font-semibold text-[#f7f2e5] sm:text-3xl">
            Le fichier est analysé automatiquement et seules les lignes utiles au suivi sont gardées.
          </h3>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[#c7d1c1]">
            Achats, ventes, dividendes, top up, positions mensuelles: le reste est ignoré s’il n’aide
            pas le suivi de performance.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-[#eadbbb]">
          <span className="rounded-full border border-[#e8d6ac]/18 bg-[#173b2a] px-3 py-1.5">Achat</span>
          <span className="rounded-full border border-[#e8d6ac]/18 bg-[#173b2a] px-3 py-1.5">Vente</span>
          <span className="rounded-full border border-[#e8d6ac]/18 bg-[#173b2a] px-3 py-1.5">Dividende</span>
          <span className="rounded-full border border-[#e8d6ac]/18 bg-[#173b2a] px-3 py-1.5">Top up</span>
          <span className="rounded-full border border-[#e8d6ac]/18 bg-[#173b2a] px-3 py-1.5">Snapshots</span>
        </div>
      </div>

      <div
        className={`mt-6 rounded-[28px] border border-dashed p-6 transition ${
          isDragging
            ? 'border-[#eadbbb]/50 bg-[#183a2b]'
            : 'border-[#e8d6ac]/20 bg-[#143525]/75 hover:border-[#e8d6ac]/34 hover:bg-[#183929]'
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
              <p className="text-lg font-semibold text-[#f7f2e5]">
                {selectedFile ? 'Remplacer le CSV actuel' : 'Déposer un CSV'}
              </p>
              <p className="mt-1 text-sm text-[#c7d1c1]">
                Si la plateforme manque dans le fichier, on prend celle que tu choisis juste en dessous.
              </p>
            </div>
            <div className="inline-flex rounded-full bg-[#e6d2a5] px-4 py-2 text-sm font-semibold text-[#173326]">
              Choisir un fichier
            </div>
          </div>
        </label>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <label className="rounded-[24px] border border-[#e8d6ac]/18 bg-[#143525]/78 p-4">
          <span className="text-xs uppercase tracking-[0.22em] text-[#c8b788]">Plateforme si absente</span>
          <input
            value={defaultPlatform}
            onChange={(event) => setDefaultPlatform(event.target.value)}
            className="mt-3 w-full rounded-2xl border border-[#e8d6ac]/20 bg-[#0f2d20] px-4 py-3 text-sm text-[#f7f2e5] outline-none transition focus:border-[#e8d6ac]/40"
          />
        </label>

        <label className="rounded-[24px] border border-[#e8d6ac]/18 bg-[#143525]/78 p-4">
          <span className="text-xs uppercase tracking-[0.22em] text-[#c8b788]">Compte cible</span>
          <input
            value={targetAccountName}
            onChange={(event) => setTargetAccountName(event.target.value)}
            placeholder="Optionnel"
            className="mt-3 w-full rounded-2xl border border-[#e8d6ac]/20 bg-[#0f2d20] px-4 py-3 text-sm text-[#f7f2e5] outline-none transition focus:border-[#e8d6ac]/40"
          />
        </label>
      </div>

      {selectedFile && (
        <div className="mt-5 grid gap-3 rounded-[24px] border border-[#e8d6ac]/18 bg-[#143525]/72 p-4 text-sm text-[#d5dccf] md:grid-cols-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-[#c8b788]">Fichier</p>
            <p className="mt-1 font-medium text-[#f7f2e5]">{selectedFile.name}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-[#c8b788]">Taille</p>
            <p className="mt-1 font-medium text-[#f7f2e5]">{formatFileSize(selectedFile.size)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-[#c8b788]">Modifié</p>
            <p className="mt-1 font-medium text-[#f7f2e5]">
              {formatLongDateTime(selectedFile.lastModified)}
            </p>
          </div>
        </div>
      )}

      {message && (
        <div
          className={`mt-5 rounded-[22px] border px-4 py-3 text-sm ${
            status === 'error'
              ? 'border-[#c78579]/24 bg-[#4a221d]/45 text-[#f3cec8]'
              : 'border-[#e8d6ac]/18 bg-[#183a2b] text-[#f3ecdd]'
          }`}
        >
          {message}
        </div>
      )}

      {preview && (
        <div className="mt-5 space-y-5">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="rounded-[24px] border border-[#e8d6ac]/18 bg-[#143525]/78 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-[#c8b788]">Mode</p>
              <p className="mt-2 text-xl font-semibold text-[#f7f2e5]">
                {preview.mode === 'transactions' ? 'Transactions' : 'Positions'}
              </p>
            </div>
            <div className="rounded-[24px] border border-[#e8d6ac]/18 bg-[#143525]/78 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-[#c8b788]">Lignes utiles</p>
              <p className="mt-2 text-xl font-semibold text-[#f7f2e5]">{preview.rowCount}</p>
            </div>
            <div className="rounded-[24px] border border-[#e8d6ac]/18 bg-[#143525]/78 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-[#c8b788]">Actifs</p>
              <p className="mt-2 text-xl font-semibold text-[#f7f2e5]">{preview.assetCount}</p>
            </div>
            <div className="rounded-[24px] border border-[#e8d6ac]/18 bg-[#143525]/78 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-[#c8b788]">Ignorées</p>
              <p className="mt-2 text-xl font-semibold text-[#f7f2e5]">{preview.ignoredCount}</p>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[0.72fr_1.28fr]">
            <div className="rounded-[24px] border border-[#e8d6ac]/18 bg-[#143525]/78 p-5 text-sm">
              <p className="text-xs uppercase tracking-[0.22em] text-[#c8b788]">Résumé</p>
              <dl className="mt-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-[#c7d1c1]">Période</dt>
                  <dd className="font-medium text-[#f7f2e5]">
                    {formatShortDate(preview.startDate)} → {formatShortDate(preview.endDate)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-[#c7d1c1]">Devises</dt>
                  <dd className="font-medium text-[#f7f2e5]">{preview.currencies.join(', ')}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-[#c7d1c1]">Plateformes</dt>
                  <dd className="font-medium text-[#f7f2e5]">{preview.platformCount}</dd>
                </div>
                {preview.mode === 'transactions' && (
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-[#c7d1c1]">Types utiles</dt>
                    <dd className="font-medium text-[#f7f2e5]">{preview.kindCount}</dd>
                  </div>
                )}
              </dl>
            </div>

            <div className="overflow-hidden rounded-[24px] border border-[#e8d6ac]/18 bg-[#143525]/78">
              <div className="border-b border-[#e8d6ac]/12 px-5 py-4">
                <p className="text-xs uppercase tracking-[0.22em] text-[#c8b788]">Aperçu</p>
                <p className="mt-1 text-sm text-[#c7d1c1]">
                  Les premières lignes vraiment retenues pour le suivi.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] text-sm">
                  <thead className="bg-[#183a2b] text-[#d9c89f]">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold">Date</th>
                      <th className="px-4 py-3 text-left font-semibold">Type</th>
                      <th className="px-4 py-3 text-left font-semibold">Actif</th>
                      <th className="px-4 py-3 text-left font-semibold">Plateforme</th>
                      <th className="px-4 py-3 text-right font-semibold">Détail</th>
                      <th className="px-4 py-3 text-left font-semibold">Devise</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e8d6ac]/10 text-[#f7f2e5]">
                    {preview.sampleRows.map((row, index) => (
                      <tr key={`${row.date}-${index}`} className="hover:bg-[#183a2b]">
                        <td className="px-4 py-3">{formatShortDate(row.date)}</td>
                        <td className="px-4 py-3">{formatKindLabel(row)}</td>
                        <td className="px-4 py-3">
                          {'assetSymbol' in row && row.assetSymbol ? row.assetSymbol : 'Cash / flux'}
                        </td>
                        <td className="px-4 py-3">{row.platform}</td>
                        <td className="px-4 py-3 text-right">{formatRowDetail(row)}</td>
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

      {ignoredErrors.length > 0 && (
        <div className="mt-5 rounded-[22px] border border-[#e8d6ac]/16 bg-[#153424]/72 px-4 py-4 text-sm text-[#d5dccf]">
          <p className="font-semibold text-[#f0e2bf]">Lignes ignorées</p>
          <ul className="mt-3 space-y-2">
            {ignoredErrors.slice(0, 4).map((error) => (
              <li key={`${error.row}-${error.message}`}>
                {error.row > 0 ? `Ligne ${error.row} : ` : ''}
                {error.message}
              </li>
            ))}
            {ignoredErrors.length > 4 && <li>… {ignoredErrors.length - 4} ligne(s) ignorée(s) supplémentaires.</li>}
          </ul>
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handleImport}
          disabled={!canImport}
          className="rounded-full bg-[#e6d2a5] px-5 py-3 text-sm font-semibold text-[#173326] transition hover:bg-[#f0ddb5] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {status === 'importing' ? 'Import en cours...' : 'Importer'}
        </button>
        <button
          type="button"
          onClick={resetState}
          className="rounded-full border border-[#e8d6ac]/20 bg-[#143525]/70 px-5 py-3 text-sm font-semibold text-[#f7f2e5] transition hover:bg-[#183a2b]"
        >
          Réinitialiser
        </button>
      </div>
    </section>
  );
};

export default CsvImportSection;
