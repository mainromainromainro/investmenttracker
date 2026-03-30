import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CsvParseError,
  NormalizedPositionSnapshotRow,
  NormalizedTransactionRow,
  parseNormalizedPositionSnapshotsCsv,
  parseNormalizedTransactionsCsv,
  parseRecognizedInvestmentCsv,
} from '../../lib/csvImport';
import { fetchFxRatesToEur } from '../../lib/liveMarketData';
import { adminRepository } from '../../repositories/adminRepository';
import { fxRepository } from '../../repositories/fxRepository';
import { useAssetStore } from '../../stores/assetStore';
import { useFxStore } from '../../stores/fxStore';
import { usePlatformStore } from '../../stores/platformStore';
import { usePriceStore } from '../../stores/priceStore';
import { useTransactionStore } from '../../stores/transactionStore';
import { ImportSourceAdapterId } from '../../types';
import {
  DetectedImportPreset,
  ImportSupportStatus,
  buildFileFingerprint,
  detectImportPreset,
  formatFileSize,
  getImportModeLabel,
} from './importUx';

const BASE_CURRENCY = 'EUR';

type ParsedImportRow = NormalizedTransactionRow | NormalizedPositionSnapshotRow;
type ParsedImportMode = 'transactions' | 'monthly_positions';

interface ParsedImportCandidate {
  mode: ParsedImportMode;
  rows: ParsedImportRow[];
  errors: CsvParseError[];
}

interface ParsedImportReview {
  detectedPreset: DetectedImportPreset | null;
  supportStatus: ImportSupportStatus;
  supportNotes: string[];
  recommendedMode: ParsedImportMode;
  sourceAdapterId?: ImportSourceAdapterId;
  sourceSection?: string;
  sourceSignature?: string;
  transactions: ParsedImportCandidate;
  monthlyPositions: ParsedImportCandidate;
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

const parseInvestmentTrackingCsv = (
  csvText: string,
  fileName: string | undefined,
  defaultPlatform: string,
): ParsedImportReview => {
  const detectedPreset = detectImportPreset(csvText, fileName);
  const fallbackPlatform =
    defaultPlatform.trim() && defaultPlatform.trim() !== 'Portefeuille principal'
      ? defaultPlatform.trim()
      : undefined;
  const sharedOptions = {
    defaultCurrency: BASE_CURRENCY,
    defaultPlatform: fallbackPlatform ?? detectedPreset?.platformName,
  };

  if (detectedPreset) {
    const recognizedResult = parseRecognizedInvestmentCsv(csvText, {
      ...sharedOptions,
      fileName,
    });
    const recognizedCandidate: ParsedImportCandidate = {
      mode: recognizedResult.mode,
      rows: recognizedResult.records,
      errors: recognizedResult.errors,
    };
    const disabledModeMessage =
      recognizedResult.mode === 'transactions'
        ? 'Cette source reconnue est importée uniquement via le pipeline transactions.'
        : 'Cette source reconnue est importée uniquement via le pipeline snapshots mensuels.';

    return {
      detectedPreset,
      supportStatus: detectedPreset.supportStatus,
      supportNotes: [...detectedPreset.notes, ...recognizedResult.warnings],
      recommendedMode: recognizedResult.mode,
      sourceAdapterId: recognizedResult.sourceAdapterId,
      sourceSection: recognizedResult.sourceSection,
      sourceSignature: recognizedResult.sourceSignature,
      transactions:
        recognizedResult.mode === 'transactions'
          ? recognizedCandidate
          : {
              mode: 'transactions',
              rows: [],
              errors: [{ row: 0, message: disabledModeMessage }],
            },
      monthlyPositions:
        recognizedResult.mode === 'monthly_positions'
          ? recognizedCandidate
          : {
              mode: 'monthly_positions',
              rows: [],
              errors: [{ row: 0, message: disabledModeMessage }],
            },
    };
  }

  const transactionsResult = parseNormalizedTransactionsCsv(csvText, sharedOptions);
  const monthlyPositionsResult = parseNormalizedPositionSnapshotsCsv(csvText, sharedOptions);

  let supportNotes = ['Source non reconnue automatiquement. Vérifiez le mode avant import.'];
  let supportStatus: ImportSupportStatus = 'manual';

  const transactions: ParsedImportCandidate = {
    mode: 'transactions',
    rows: transactionsResult.records,
    errors: transactionsResult.errors,
  };

  const monthlyPositions: ParsedImportCandidate = {
    mode: 'monthly_positions',
    rows: monthlyPositionsResult.records,
    errors: monthlyPositionsResult.errors,
  };

  const recommendedMode =
    transactions.rows.length >= monthlyPositions.rows.length ? 'transactions' : 'monthly_positions';

  return {
    detectedPreset,
    supportStatus,
    supportNotes,
    recommendedMode,
    sourceAdapterId: undefined,
    sourceSection: undefined,
    sourceSignature: undefined,
    transactions,
    monthlyPositions,
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
  const [parsedImport, setParsedImport] = useState<ParsedImportReview | null>(null);
  const [selectedMode, setSelectedMode] = useState<ParsedImportMode>('transactions');
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
      setSelectedMode('transactions');
      return;
    }

    const result = parseInvestmentTrackingCsv(csvText, selectedFile?.name, defaultPlatform);
    setParsedImport(result);
    const currentCandidate =
      selectedMode === 'transactions' ? result.transactions : result.monthlyPositions;
    const nextMode = currentCandidate.rows.length > 0 ? selectedMode : result.recommendedMode;
    setSelectedMode(nextMode);

    const activeCandidate = nextMode === 'transactions' ? result.transactions : result.monthlyPositions;

    if (activeCandidate.rows.length === 0) {
      setStatus('error');
      setMessage(
        activeCandidate.errors[0]?.message ??
          'Aucune ligne utile n’a été reconnue pour le suivi de performance.',
      );
      return;
    }

    setStatus('ready');
    setMessage(null);
  }, [csvText, defaultPlatform, selectedFile?.name, selectedMode]);

  const activeCandidate = useMemo<ParsedImportCandidate | null>(() => {
    if (!parsedImport) return null;
    return selectedMode === 'transactions' ? parsedImport.transactions : parsedImport.monthlyPositions;
  }, [parsedImport, selectedMode]);

  const fileFingerprint = useMemo(() => {
    if (!csvText) return null;
    const mode = selectedMode;
    return buildFileFingerprint(
      csvText,
      mode,
      buildScopeKey(defaultPlatform, targetAccountName),
    );
  }, [csvText, selectedMode, defaultPlatform, targetAccountName]);

  const preview = useMemo(() => {
    if (!activeCandidate || activeCandidate.rows.length === 0) return null;

    const currencies = new Set<string>();
    const assetSymbols = new Set<string>();
    const platforms = new Set<string>();
    const kinds = new Set<string>();
    const dates: number[] = [];

    for (const row of activeCandidate.rows) {
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
      mode: activeCandidate.mode,
      rowCount: activeCandidate.rows.length,
      ignoredCount: activeCandidate.errors.length,
      assetCount: assetSymbols.size,
      platformCount: platforms.size,
      currencies: Array.from(currencies).sort(),
      kindCount: kinds.size,
      startDate: dates.length ? Math.min(...dates) : null,
      endDate: dates.length ? Math.max(...dates) : null,
      sampleRows: activeCandidate.rows.slice(0, 6),
    };
  }, [activeCandidate]);

  const availableModes = useMemo(
    () =>
      parsedImport
        ? (['transactions', 'monthly_positions'] as ParsedImportMode[]).filter((mode) => {
            const candidate =
              mode === 'transactions' ? parsedImport.transactions : parsedImport.monthlyPositions;
            return candidate.rows.length > 0;
          })
        : [],
    [parsedImport],
  );

  const resetState = () => {
    setStatus('idle');
    setCsvText(null);
    setParsedImport(null);
    setSelectedMode('transactions');
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
    if (
      !parsedImport ||
      !activeCandidate ||
      !activeCandidate.rows.length ||
      !selectedFile ||
      !fileFingerprint ||
      status === 'importing'
    ) {
      return;
    }

    setStatus('importing');

    try {
      const importOptions = {
        fileName: selectedFile.name,
        fileSize: selectedFile.size,
        fileLastModified: selectedFile.lastModified,
        fileFingerprint,
        sourceProfile:
          parsedImport.detectedPreset?.sourceProfile ??
          (selectedMode === 'transactions' ? 'broker_export' : 'monthly_statement'),
        targetAccountName: targetAccountName.trim() || undefined,
        sourceContext: {
          sourceAdapterId: parsedImport.sourceAdapterId,
          sourceSection: parsedImport.sourceSection,
          sourceSignature: parsedImport.sourceSignature,
        },
      } as const;

      const fxSummary = await syncFxRates(activeCandidate.rows);
      if (selectedMode === 'transactions') {
        const result = await adminRepository.importNormalizedTransactions(
          activeCandidate.rows as NormalizedTransactionRow[],
          importOptions,
        );

        await refreshStores();

        if (result.duplicateSkipped) {
          setMessage(
            'Ce fichier a déjà été importé pour cette portée. Change le compte cible pour créer une portée distincte.',
          );
        } else {
          const auditParts = [
            `${result.transactionsCreated} transaction(s) importée(s)`,
            (result.duplicateExistingCount ?? 0) > 0
              ? `${result.duplicateExistingCount ?? 0} doublon(s) inter-fichiers ignoré(s)`
              : null,
            (result.unresolvedCount ?? 0) > 0
              ? `${result.unresolvedCount ?? 0} ligne(s) sans identité d’actif exploitable`
              : null,
            (result.ambiguousCount ?? 0) > 0
              ? `${result.ambiguousCount ?? 0} ligne(s) ambiguë(s)`
              : null,
            `${fxSummary.syncedCount} taux FX mis à jour`,
            fxSummary.missingCount > 0
              ? `${fxSummary.missingCount} devise(s) sans taux live`
              : null,
          ].filter(Boolean);
          setMessage(
            `${auditParts.join(' · ')}.`,
          );
        }
      } else {
        const result = await adminRepository.importMonthlyPositionSnapshots(
          activeCandidate.rows as NormalizedPositionSnapshotRow[],
          importOptions,
        );

        await refreshStores();

        if (result.duplicateSkipped) {
          setMessage(
            'Ce fichier a déjà été importé pour cette portée. Change le compte cible pour créer une portée distincte.',
          );
        } else {
          const auditParts = [
            `${result.snapshotsUpserted} position(s) importée(s)`,
            `${result.syntheticTransactionsRebuilt} mouvement(s) recalculé(s)`,
            result.implicitClosures > 0
              ? `${result.implicitClosures} clôture(s) implicite(s)`
              : null,
            (result.duplicateExistingCount ?? 0) > 0
              ? `${result.duplicateExistingCount ?? 0} doublon(s) inter-fichiers ignoré(s)`
              : null,
            (result.unresolvedCount ?? 0) > 0
              ? `${result.unresolvedCount ?? 0} ligne(s) sans identité d’actif exploitable`
              : null,
            (result.ambiguousCount ?? 0) > 0
              ? `${result.ambiguousCount ?? 0} ligne(s) ambiguë(s)`
              : null,
            `${fxSummary.syncedCount} taux FX mis à jour`,
            fxSummary.missingCount > 0
              ? `${fxSummary.missingCount} devise(s) sans taux live`
              : null,
          ].filter(Boolean);
          setMessage(
            `${auditParts.join(' · ')}.`,
          );
        }
      }

      setStatus('ready');
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Erreur pendant l’import.');
    }
  };

  const ignoredErrors = activeCandidate?.errors ?? [];
  const canImport = status === 'ready' && Boolean(activeCandidate?.rows.length);
  const sourcePreset = parsedImport?.detectedPreset ?? null;
  const supportLabel = parsedImport ? getImportSupportLabel(parsedImport.supportStatus) : 'Auto';
  const activeModeLabel = getImportModeLabel(selectedMode);

  return (
    <section className="rounded-[30px] border border-[#e8d6ac]/18 bg-[#0f2d20]/88 p-6 shadow-[0_30px_70px_rgba(5,18,12,0.35)] backdrop-blur">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-[#c8b788]">Import CSV</p>
          <h3 className="mt-2 text-2xl font-semibold text-[#f7f2e5] sm:text-3xl">
            Le fichier est d’abord revu, puis seulement les lignes validées partent dans le suivi.
          </h3>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[#c7d1c1]">
            On veut voir la source détectée, le mode retenu, les sections supportées et les lignes
            ignorées ou rejetées avant d’importer.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-[#eadbbb]">
          <span className="rounded-full border border-[#e8d6ac]/18 bg-[#173b2a] px-3 py-1.5">Revue</span>
          <span className="rounded-full border border-[#e8d6ac]/18 bg-[#173b2a] px-3 py-1.5">Quantités</span>
          <span className="rounded-full border border-[#e8d6ac]/18 bg-[#173b2a] px-3 py-1.5">Holdings</span>
          <span className="rounded-full border border-[#e8d6ac]/18 bg-[#173b2a] px-3 py-1.5">Support partiel</span>
          <span className="rounded-full border border-[#e8d6ac]/18 bg-[#173b2a] px-3 py-1.5">Audit</span>
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

      {parsedImport && (
        <div className="mt-5 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-[24px] border border-[#e8d6ac]/18 bg-[#143525]/78 p-5 text-sm text-[#d5dccf]">
            <p className="text-xs uppercase tracking-[0.22em] text-[#c8b788]">Source détectée</p>
            <div className="mt-3 space-y-2">
              <p className="text-lg font-semibold text-[#f7f2e5]">
                {sourcePreset?.label ?? 'Source non reconnue'}
              </p>
              <p className="text-sm text-[#c7d1c1]">
                Support: <span className="font-semibold text-[#f7f2e5]">{supportLabel}</span>
              </p>
              <p className="text-sm text-[#c7d1c1]">
                Mode conseillé: <span className="font-semibold text-[#f7f2e5]">{getImportModeLabel(parsedImport.recommendedMode)}</span>
              </p>
              {parsedImport.sourceSection ? (
                <p className="text-sm text-[#c7d1c1]">
                  Section retenue: {parsedImport.sourceSection}
                </p>
              ) : null}
              {sourcePreset?.supportedSections.length ? (
                <p className="text-sm text-[#c7d1c1]">
                  Sections supportées: {sourcePreset.supportedSections.join(', ')}
                </p>
              ) : null}
              {parsedImport.sourceSignature ? (
                <p className="text-sm text-[#c7d1c1]">
                  Signature source:{' '}
                  <span className="font-mono text-xs text-[#f7f2e5]">
                    {parsedImport.sourceSignature}
                  </span>
                </p>
              ) : null}
            </div>

            {parsedImport.supportNotes.length > 0 && (
              <div className="mt-4 rounded-2xl border border-[#e8d6ac]/12 bg-[#103123] px-4 py-3 text-xs leading-5 text-[#eadbbb]">
                {parsedImport.supportNotes.map((note) => (
                  <p key={note}>{note}</p>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-[24px] border border-[#e8d6ac]/18 bg-[#143525]/78 p-5 text-sm text-[#d5dccf]">
            <p className="text-xs uppercase tracking-[0.22em] text-[#c8b788]">Mode de revue</p>
            <div className="mt-3 flex flex-wrap gap-3">
              {(['transactions', 'monthly_positions'] as ParsedImportMode[]).map((mode) => {
                const candidate = mode === 'transactions' ? parsedImport.transactions : parsedImport.monthlyPositions;
                const isActive = selectedMode === mode;
                const isDisabled = candidate.rows.length === 0;
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setSelectedMode(mode)}
                    disabled={isDisabled}
                    className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                      isActive
                        ? 'border-[#e6d2a5] bg-[#e6d2a5] text-[#173326]'
                        : 'border-[#e8d6ac]/20 bg-[#0f2d20] text-[#f7f2e5] hover:bg-[#183a2b]'
                    } disabled:cursor-not-allowed disabled:opacity-40`}
                  >
                    {getImportModeLabel(mode)}
                    <span className="ml-2 text-xs opacity-80">({candidate.rows.length})</span>
                  </button>
                );
              })}
            </div>
            <p className="mt-4 text-xs leading-5 text-[#c7d1c1]">
              {selectedMode === parsedImport.recommendedMode
                ? 'Le mode affiché correspond au mode conseillé.'
                : 'Le mode affiché a été modifié manuellement. Vérifie l’aperçu avant d’importer.'}
            </p>
          </div>
        </div>
      )}

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
              <p className="text-xs uppercase tracking-[0.18em] text-[#c8b788]">Source</p>
              <p className="mt-2 text-xl font-semibold text-[#f7f2e5]">
                {sourcePreset?.label ?? 'CSV'}
              </p>
            </div>
            <div className="rounded-[24px] border border-[#e8d6ac]/18 bg-[#143525]/78 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-[#c8b788]">Mode</p>
              <p className="mt-2 text-xl font-semibold text-[#f7f2e5]">{activeModeLabel}</p>
            </div>
            <div className="rounded-[24px] border border-[#e8d6ac]/18 bg-[#143525]/78 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-[#c8b788]">Lignes retenues</p>
              <p className="mt-2 text-xl font-semibold text-[#f7f2e5]">{preview.rowCount}</p>
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
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-[#c7d1c1]">Actifs</dt>
                  <dd className="font-medium text-[#f7f2e5]">{preview.assetCount}</dd>
                </div>
                {previewStats && (
                  <>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-[#c7d1c1]">Doublons détectés</dt>
                      <dd className="font-medium text-[#f7f2e5]">{previewStats.duplicateRowCount}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-[#c7d1c1]">Mapping requis</dt>
                      <dd className="font-medium text-[#f7f2e5]">
                        {Math.round(previewStats.requiredMappingCoverage * 100)}%
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-[#c7d1c1]">Erreurs bloquantes</dt>
                      <dd className="font-medium text-[#f7f2e5]">
                        {previewStats.blockingErrorCount}
                      </dd>
                    </div>
                  </>
                )}
                {preview.mode === 'transactions' && (
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-[#c7d1c1]">Types utiles</dt>
                    <dd className="font-medium text-[#f7f2e5]">{preview.kindCount}</dd>
                  </div>
                )}
              </dl>

              {previewStats && previewStats.qualityNotes.length > 0 && (
                <div className="mt-4 rounded-2xl border border-[#e8d6ac]/12 bg-[#103123] px-4 py-3 text-xs leading-5 text-[#eadbbb]">
                  {previewStats.qualityNotes.map((note) => (
                    <p key={note}>{note}</p>
                  ))}
                </div>
              )}
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
          <p className="font-semibold text-[#f0e2bf]">Lignes ignorées / rejetées</p>
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
