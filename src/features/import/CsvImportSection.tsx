import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CsvColumnMapping,
  CsvHeader,
  CsvParseError,
  CSV_IMPORT_FIELDS,
  CSV_POSITION_SNAPSHOT_FIELDS,
  NORMALIZED_POSITION_SNAPSHOT_HEADERS,
  NORMALIZED_TRANSACTION_HEADERS,
  NormalizedPositionSnapshotRow,
  NormalizedTransactionRow,
  parseNormalizedPositionSnapshotsCsv,
  parseNormalizedTransactionsCsv,
  suggestCsvColumnMapping,
} from '../../lib/csvImport';
import { adminRepository } from '../../repositories/adminRepository';
import { fxRepository } from '../../repositories/fxRepository';
import { useAssetStore } from '../../stores/assetStore';
import { useFxStore } from '../../stores/fxStore';
import { usePlatformStore } from '../../stores/platformStore';
import { usePriceStore } from '../../stores/priceStore';
import { useTransactionStore } from '../../stores/transactionStore';
import {
  addImportHistoryEntry,
  buildFileFingerprint,
  buildImportPreviewStats,
  clearImportHistory,
  detectImportPreset,
  findMatchingHistoryEntry,
  formatFileSize,
  formatLongDateTime,
  formatNumber,
  formatShortDate,
  getImportModeLabel,
  getImportSourceLabel,
  getRecommendedMode,
  IMPORT_MODE_OPTIONS,
  IMPORT_SOURCE_OPTIONS,
  ImportHistoryEntry,
  ImportMode,
  ImportPreviewStats,
  ImportSourceProfile,
  loadImportHistory,
  ParsedCsvRow,
} from './importUx';

const BASE_CURRENCY = 'EUR';
const COMMON_CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'CAD', 'SEK'];
const REQUIRED_FIELDS: CsvHeader[] = ['date', 'kind'];
const SNAPSHOT_REQUIRED_FIELDS: CsvHeader[] = ['date', 'asset_symbol', 'qty'];
const BROKER_FROM_CSV = '__from_csv__';
const BROKER_CUSTOM = '__custom__';

interface CsvMappingTemplateMemory {
  mapping: CsvColumnMapping;
  broker?: string;
}

const FIELD_LABELS: Record<CsvHeader, string> = {
  date: 'Date',
  platform: 'Platform / broker',
  kind: 'Transaction type',
  asset_symbol: 'Ticker / symbol',
  asset_name: 'Asset name',
  asset_type: 'Asset type',
  qty: 'Quantity',
  price: 'Price',
  currency: 'Price currency',
  cash_currency: 'Cash currency',
  fee: 'Fees',
  note: 'Note',
};

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

const normalizeStoredTemplate = (value: unknown): CsvMappingTemplateMemory => {
  if (!value || typeof value !== 'object') {
    return { mapping: {} };
  }

  const candidate = value as { mapping?: unknown; broker?: unknown };
  if (candidate.mapping && typeof candidate.mapping === 'object') {
    return {
      mapping: candidate.mapping as CsvColumnMapping,
      broker: typeof candidate.broker === 'string' ? candidate.broker : undefined,
    };
  }

  return { mapping: value as CsvColumnMapping };
};

const loadMappingTemplates = (): Record<string, CsvMappingTemplateMemory> => {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem('investment-tracker.csv.mapping-templates.v1');
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return {};

    const normalized: Record<string, CsvMappingTemplateMemory> = {};
    for (const [signature, value] of Object.entries(parsed)) {
      normalized[signature] = normalizeStoredTemplate(value);
    }
    return normalized;
  } catch {
    return {};
  }
};

const saveMappingTemplates = (templates: Record<string, CsvMappingTemplateMemory>) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(
    'investment-tracker.csv.mapping-templates.v1',
    JSON.stringify(templates),
  );
};

const sanitizeMapping = (
  mapping: CsvColumnMapping,
  headers: string[],
): CsvColumnMapping => {
  const allowed = new Set(headers);
  const sanitized: CsvColumnMapping = {};
  for (const field of CSV_IMPORT_FIELDS) {
    const mappedHeader = mapping[field];
    if (mappedHeader && allowed.has(mappedHeader)) {
      sanitized[field] = mappedHeader;
    }
  }
  return sanitized;
};

const getFieldConfidence = (
  field: CsvHeader,
  mapping: CsvColumnMapping,
  suggestedMapping: CsvColumnMapping,
  confidence: Partial<Record<CsvHeader, number>>,
): number => {
  const current = mapping[field];
  if (!current) return 0;
  if (current === suggestedMapping[field]) {
    return confidence[field] ?? 0.5;
  }
  return 0.55;
};

const confidenceText = (value: number): { label: string; className: string } => {
  if (value >= 0.85) {
    return { label: 'High', className: 'bg-emerald-500/15 text-emerald-200 border-emerald-300/30' };
  }
  if (value >= 0.6) {
    return { label: 'Medium', className: 'bg-amber-500/15 text-amber-100 border-amber-300/30' };
  }
  if (value > 0) {
    return { label: 'Low', className: 'bg-rose-500/15 text-rose-200 border-rose-300/30' };
  }
  return { label: 'Unmapped', className: 'bg-slate-500/15 text-slate-200 border-slate-300/30' };
};

const getBrokerFromSelection = (
  selection: string,
  customBrokerName: string,
): string | undefined => {
  if (selection === BROKER_CUSTOM) {
    const trimmed = customBrokerName.trim();
    return trimmed || undefined;
  }
  if (!selection || selection === BROKER_FROM_CSV) {
    return undefined;
  }
  return selection;
};

const resolveTargetLabel = (
  selection: string,
  customBrokerName: string,
): string => {
  if (selection === BROKER_FROM_CSV || !selection) {
    return 'From CSV';
  }
  if (selection === BROKER_CUSTOM) {
    const trimmed = customBrokerName.trim();
    return trimmed || 'Custom account';
  }
  return selection;
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

const TonePill: React.FC<{ label: string; tone: 'neutral' | 'good' | 'warn' | 'danger' }> = ({
  label,
  tone,
}) => {
  const className =
    tone === 'good'
      ? 'border-emerald-300/30 bg-emerald-500/10 text-emerald-100'
      : tone === 'warn'
        ? 'border-amber-300/30 bg-amber-500/10 text-amber-100'
        : tone === 'danger'
          ? 'border-rose-300/30 bg-rose-500/10 text-rose-100'
          : 'border-stone-300/20 bg-stone-500/10 text-stone-100';

  return <span className={`rounded-full border px-3 py-1 text-xs font-medium ${className}`}>{label}</span>;
};

const StatCard: React.FC<{ label: string; value: string; hint?: string; tone?: 'neutral' | 'good' | 'warn' }> = ({
  label,
  value,
  hint,
  tone = 'neutral',
}) => {
  const toneClass =
    tone === 'good'
      ? 'text-emerald-200'
      : tone === 'warn'
        ? 'text-amber-100'
        : 'text-stone-100';

  return (
    <div className="rounded-2xl border border-stone-200/10 bg-white/5 p-4 shadow-lg shadow-emerald-950/10">
      <p className="text-xs uppercase tracking-[0.22em] text-stone-400">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${toneClass}`}>{value}</p>
      {hint && <p className="mt-2 text-xs text-stone-400">{hint}</p>}
    </div>
  );
};

const ChoiceCard: React.FC<{
  label: string;
  description: string;
  active: boolean;
  onClick: () => void;
}> = ({ label, description, active, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`rounded-2xl border p-4 text-left transition ${
      active
        ? 'border-emerald-300/40 bg-emerald-500/10 shadow-lg shadow-emerald-950/10'
        : 'border-stone-200/10 bg-white/5 hover:border-stone-200/20 hover:bg-white/8'
    }`}
  >
    <p className="text-sm font-semibold text-stone-100">{label}</p>
    <p className="mt-1 text-xs leading-5 text-stone-300">{description}</p>
  </button>
);

const SourceCard: React.FC<{
  label: string;
  description: string;
  active: boolean;
  onClick: () => void;
}> = ({ label, description, active, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`rounded-2xl border p-3 text-left transition ${
      active
        ? 'border-stone-100/50 bg-stone-100/10 shadow-lg shadow-emerald-950/10'
        : 'border-stone-200/10 bg-white/5 hover:border-stone-200/20 hover:bg-white/8'
    }`}
  >
    <p className="text-sm font-semibold text-stone-100">{label}</p>
    <p className="mt-1 text-xs leading-5 text-stone-300">{description}</p>
  </button>
);

const HistoryRow: React.FC<{ entry: ImportHistoryEntry }> = ({ entry }) => (
  <div className="rounded-2xl border border-stone-200/10 bg-white/5 p-4">
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-sm font-semibold text-stone-100">{entry.fileName}</p>
        <p className="mt-1 text-xs text-stone-400">
          {entry.sourceLabel} · {entry.modeLabel} · {formatLongDateTime(entry.importedAt)}
        </p>
      </div>
      <TonePill
        label={entry.blockingErrorCount > 0 ? 'Needs review' : 'Imported'}
        tone={entry.blockingErrorCount > 0 ? 'warn' : 'good'}
      />
    </div>
    <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-stone-300 sm:grid-cols-4">
      <span>{entry.rowCount} rows</span>
      <span>{entry.uniqueAssetCount} assets</span>
      <span>{entry.uniquePlatformCount} accounts</span>
      <span>{entry.duplicateRowCount} duplicates</span>
    </div>
    {entry.qualityNotes.length > 0 && (
      <p className="mt-3 text-xs leading-5 text-amber-100">{entry.qualityNotes[0]}</p>
    )}
  </div>
);

const CsvImportSection: React.FC = () => {
  const platforms = usePlatformStore((s) => s.platforms);
  const fetchPlatforms = usePlatformStore((s) => s.fetchPlatforms);

  const [importMode, setImportMode] = useState<ImportMode>('monthly_positions');
  const [sourceProfile, setSourceProfile] = useState<ImportSourceProfile>('monthly_statement');
  const [csvStatus, setCsvStatus] = useState<'idle' | 'parsing' | 'mapping' | 'ready' | 'importing' | 'error'>(
    'idle',
  );
  const [csvRows, setCsvRows] = useState<ParsedCsvRow[]>([]);
  const [csvErrors, setCsvErrors] = useState<CsvParseError[]>([]);
  const [csvMessage, setCsvMessage] = useState<string | null>(null);
  const [defaultCurrency, setDefaultCurrency] = useState<string>(BASE_CURRENCY);
  const [fxMessage, setFxMessage] = useState<string | null>(null);
  const [csvText, setCsvText] = useState<string | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [mappingSignature, setMappingSignature] = useState<string | null>(null);
  const [suggestedMapping, setSuggestedMapping] = useState<CsvColumnMapping>({});
  const [columnMapping, setColumnMapping] = useState<CsvColumnMapping>({});
  const [mappingConfidence, setMappingConfidence] = useState<Partial<Record<CsvHeader, number>>>({});
  const [rememberMapping, setRememberMapping] = useState(true);
  const [targetSelection, setTargetSelection] = useState<string>(BROKER_FROM_CSV);
  const [customBrokerName, setCustomBrokerName] = useState<string>('');
  const [selectedFileInfo, setSelectedFileInfo] = useState<{
    name: string;
    size: number;
    lastModified: number;
    fingerprint: string;
  } | null>(null);
  const [importHistory, setImportHistory] = useState<ImportHistoryEntry[]>(() => loadImportHistory());
  const [isDragging, setIsDragging] = useState(false);
  const csvInputRef = useRef<HTMLInputElement | null>(null);
  const refreshStores = useRefreshStores();

  const activeImportFields =
    importMode === 'transactions' ? CSV_IMPORT_FIELDS : CSV_POSITION_SNAPSHOT_FIELDS;
  const requiredFields =
    importMode === 'transactions' ? REQUIRED_FIELDS : SNAPSHOT_REQUIRED_FIELDS;
  const csvHeaderExample =
    importMode === 'transactions'
      ? NORMALIZED_TRANSACTION_HEADERS.join(',')
      : NORMALIZED_POSITION_SNAPSHOT_HEADERS.join(',');
  const targetLabel = resolveTargetLabel(targetSelection, customBrokerName);

  const currentFileFingerprint = useMemo(() => {
    if (!csvText) return null;
    return buildFileFingerprint(csvText, importMode);
  }, [csvText, importMode]);

  const previewStats = useMemo<ImportPreviewStats | null>(() => {
    if (!csvText) return null;
    return buildImportPreviewStats({
      mode: importMode,
      sourceProfile,
      rows: csvRows,
      errors: csvErrors,
      requiredFields,
      columnMapping,
      mappingConfidence,
      defaultCurrency,
      targetLabel,
    });
  }, [
    csvText,
    csvRows,
    csvErrors,
    importMode,
    sourceProfile,
    requiredFields,
    columnMapping,
    mappingConfidence,
    defaultCurrency,
    targetLabel,
  ]);

  const historyMatch = useMemo(() => {
    if (!currentFileFingerprint) return undefined;
    return findMatchingHistoryEntry(currentFileFingerprint, importHistory);
  }, [currentFileFingerprint, importHistory]);

  const resetCsvState = (clearMessage: boolean) => {
    setCsvRows([]);
    setCsvErrors([]);
    setCsvText(null);
    setCsvHeaders([]);
    setMappingSignature(null);
    setSuggestedMapping({});
    setColumnMapping({});
    setMappingConfidence({});
    setTargetSelection(BROKER_FROM_CSV);
    setCustomBrokerName('');
    setSourceProfile('monthly_statement');
    setImportMode('monthly_positions');
    setSelectedFileInfo(null);
    if (clearMessage) {
      setCsvMessage(null);
      setFxMessage(null);
    }
    setCsvStatus('idle');
    if (csvInputRef.current) {
      csvInputRef.current.value = '';
    }
  };

  useEffect(() => {
    void fetchPlatforms();
  }, [fetchPlatforms]);

  useEffect(() => {
    if (!csvText || !selectedFileInfo) return;
    const nextFingerprint = buildFileFingerprint(csvText, importMode);
    setSelectedFileInfo((current) =>
      current && current.fingerprint !== nextFingerprint
        ? { ...current, fingerprint: nextFingerprint }
        : current,
    );
  }, [csvText, importMode, selectedFileInfo]);

  useEffect(() => {
    if (!csvText) return;
    const selectedBroker = getBrokerFromSelection(targetSelection, customBrokerName);
    const result =
      importMode === 'transactions'
        ? parseNormalizedTransactionsCsv(csvText, {
            defaultCurrency,
            defaultPlatform: selectedBroker,
            columnMapping,
          })
        : parseNormalizedPositionSnapshotsCsv(csvText, {
            defaultCurrency,
            defaultPlatform: selectedBroker,
            columnMapping,
          });

    setCsvRows(result.records);
    setCsvErrors(result.errors);

    if (result.records.length === 0 && result.errors.length === 0) {
      setCsvStatus('error');
      setCsvMessage('Aucune ligne valide détectée dans ce fichier.');
      return;
    }

    if (result.errors.length > 0) {
      const hasMissingHeaders = result.errors.some(
        (error) => error.row === 0 && error.message.includes('Colonnes manquantes'),
      );
      if (hasMissingHeaders) {
        setCsvStatus('mapping');
        setCsvMessage(
          'Le mapping n’est pas encore complet. Ajustez les colonnes en rouge avant l’import.',
        );
      } else {
        setCsvStatus('error');
        setCsvMessage(
          `${result.records.length} ligne(s) valide(s) et ${result.errors.length} erreur(s). Corrigez les lignes bloquantes avant l’import.`,
        );
      }
      return;
    }

    setCsvStatus('ready');
    setCsvMessage(
      importMode === 'transactions'
        ? `${result.records.length} transactions prêtes à l’import.`
        : `${result.records.length} snapshots de positions prêtes à l’import.`,
    );
  }, [csvText, importMode, columnMapping, defaultCurrency, targetSelection, customBrokerName]);

  const loadCsvFile = async (file: File) => {
    setCsvErrors([]);
    setCsvRows([]);
    setCsvMessage(null);
    setFxMessage(null);
    setCsvStatus('parsing');

    try {
      const text = await file.text();
      const suggestion = suggestCsvColumnMapping(text);
      const storedTemplates = loadMappingTemplates();
      const storedTemplate = suggestion.signature
        ? storedTemplates[suggestion.signature]
        : undefined;
      const storedMapping = sanitizeMapping(storedTemplate?.mapping ?? {}, suggestion.headers);
      const suggested = sanitizeMapping(suggestion.mapping, suggestion.headers);
      const mergedMapping = {
        ...suggested,
        ...storedMapping,
      };
      const detectedPreset = detectImportPreset(text, file.name);
      const resolvedImportMode = detectedPreset?.importMode ?? importMode;
      const fingerprint = buildFileFingerprint(text, resolvedImportMode);

      if (detectedPreset) {
        setSourceProfile(detectedPreset.sourceProfile);
        setImportMode(detectedPreset.importMode);

        if (platforms.some((platform) => platform.name === detectedPreset.platformName)) {
          setTargetSelection(detectedPreset.platformName);
          setCustomBrokerName('');
        } else {
          setTargetSelection(BROKER_CUSTOM);
          setCustomBrokerName(detectedPreset.platformName);
        }
      }

      setCsvText(text);
      setCsvHeaders(suggestion.headers);
      setMappingSignature(suggestion.signature);
      setSuggestedMapping(suggested);
      setColumnMapping(mergedMapping);
      setMappingConfidence(suggestion.confidence);
      setSelectedFileInfo({
        name: file.name,
        size: file.size,
        lastModified: file.lastModified,
        fingerprint,
      });

      if (!detectedPreset && storedTemplate?.broker) {
        if (platforms.some((platform) => platform.name === storedTemplate.broker)) {
          setTargetSelection(storedTemplate.broker);
          setCustomBrokerName('');
        } else {
          setTargetSelection(BROKER_CUSTOM);
          setCustomBrokerName(storedTemplate.broker);
        }
      } else {
        setTargetSelection(BROKER_FROM_CSV);
        setCustomBrokerName('');
      }

      if (Object.keys(storedMapping).length > 0) {
        setCsvMessage('Un template de mapping a été reconnu automatiquement pour ce format.');
      } else if (detectedPreset) {
        setCsvMessage(`Format ${detectedPreset.label} détecté automatiquement.`);
      }
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

  const handleCsvFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      setCsvStatus('idle');
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

  const handleMappingChange = (field: CsvHeader, header: string) => {
    setColumnMapping((previous) => {
      const next = { ...previous };
      if (!header) {
        delete next[field];
      } else {
        next[field] = header;
      }
      return next;
    });
  };

  const handleRestoreAutoMapping = () => {
    setColumnMapping((previous) => ({
      ...previous,
      ...suggestedMapping,
    }));
  };

  const ensureFxRates = async (rows: Array<{ currency?: string; cashCurrency?: string }>) => {
    // Transaction cost basis is persisted in settlement currency when provided,
    // so preload FX for both quote and cash currencies before analytics run.
    const uniqueCurrencies = Array.from(
      new Set(rows.flatMap((row) => [row.currency, row.cashCurrency])),
    ).filter((currency): currency is string => Boolean(currency) && currency !== BASE_CURRENCY);
    if (uniqueCurrencies.length === 0) {
      setFxMessage('Aucune conversion FX à compléter.');
      return;
    }

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
      if (rememberMapping && mappingSignature) {
        const templates = loadMappingTemplates();
        templates[mappingSignature] = {
          mapping: sanitizeMapping(columnMapping, csvHeaders),
          broker: getBrokerFromSelection(targetSelection, customBrokerName),
        };
        saveMappingTemplates(templates);
      }

      if (importMode === 'transactions') {
        const importOptions = selectedFileInfo
          ? {
              fileName: selectedFileInfo.name,
              fileSize: selectedFileInfo.size,
              fileLastModified: selectedFileInfo.lastModified,
              fileFingerprint: selectedFileInfo.fingerprint,
              sourceProfile,
              targetAccountName:
                targetSelection === BROKER_CUSTOM ? customBrokerName.trim() || undefined : undefined,
            }
          : undefined;
        const result = await adminRepository.importNormalizedTransactions(
          csvRows as NormalizedTransactionRow[],
          importOptions,
        );
        await ensureFxRates(csvRows);
        await refreshStores();
        setCsvMessage(
          result.duplicateSkipped
            ? 'Import ignoré: ce fichier a déjà été importé et a été marqué comme doublon.'
            : `Import terminé: ${result.transactionsCreated} transactions, ${result.assetsCreated} nouveaux actifs, ${result.platformsCreated} nouvelles plateformes et ${result.accountsCreated} nouveaux comptes.`,
        );
      } else {
        const importOptions = selectedFileInfo
          ? {
              fileName: selectedFileInfo.name,
              fileSize: selectedFileInfo.size,
              fileLastModified: selectedFileInfo.lastModified,
              fileFingerprint: selectedFileInfo.fingerprint,
              sourceProfile,
              targetAccountName:
                targetSelection === BROKER_CUSTOM ? customBrokerName.trim() || undefined : undefined,
            }
          : undefined;
        const result = await adminRepository.importMonthlyPositionSnapshots(
          csvRows as NormalizedPositionSnapshotRow[],
          importOptions,
        );
        await ensureFxRates(csvRows);
        await refreshStores();
        setCsvMessage(
          result.duplicateSkipped
            ? 'Import snapshot ignoré: ce fichier a déjà été importé et a été marqué comme doublon.'
            : `Import snapshot terminé: ${result.snapshotsUpserted} lignes traitées, ${result.implicitClosures} clôtures implicites, ${result.syntheticTransactionsRebuilt} deltas BUY/SELL recalculés et ${result.accountsCreated} comptes alimentés.`,
        );
      }

      if (selectedFileInfo && currentFileFingerprint && previewStats) {
        const now = Date.now();
        const nextHistory = addImportHistoryEntry({
          id: `${currentFileFingerprint}:${now}`,
          createdAt: now,
          importedAt: now,
          status: 'IMPORTED',
          fileName: selectedFileInfo.name,
          fileSize: selectedFileInfo.size,
          fileLastModified: selectedFileInfo.lastModified,
          fileFingerprint: currentFileFingerprint,
          checksumVersion: 'local-history-v1',
          parsedRowCount: previewStats.rowCount,
          sourceProfile,
          mode: importMode,
          ...previewStats,
        });
        setImportHistory(nextHistory);
      }

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
    (previewStats?.blockingErrorCount ?? 0) > 0;

  const statusTone =
    previewStats?.blockingErrorCount && previewStats.blockingErrorCount > 0
      ? 'danger'
      : previewStats && previewStats.qualityNotes.length > 0
        ? 'warn'
        : previewStats
          ? 'good'
          : 'neutral';

  const statusLabel = !csvText
    ? 'Choisissez un fichier pour commencer.'
    : previewStats?.blockingErrorCount && previewStats.blockingErrorCount > 0
      ? 'Le fichier contient des erreurs bloquantes.'
      : previewStats && previewStats.qualityNotes.length > 0
        ? 'Le fichier est importable, mais quelques points doivent être vérifiés.'
        : previewStats
          ? 'Le fichier est prêt à être importé.'
          : 'Préparation du préflight...';

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-stone-200/10 bg-gradient-to-br from-emerald-950 via-emerald-900 to-teal-900 p-6 shadow-2xl shadow-emerald-950/20">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-2xl space-y-4">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.28em] text-stone-300">
                Finary-like CSV intake
              </p>
              <h3 className="text-2xl font-semibold text-white sm:text-3xl">
                Importer des trades, des wallets ou des relevés mensuels sans perdre la provenance.
              </h3>
              <p className="max-w-2xl text-sm leading-6 text-stone-300">
                Commencez par choisir le mode d’import puis la source. Le préflight vous montre
                le niveau de confiance du mapping, les doublons probables, les FX à compléter et
                le dernier historique local des fichiers importés.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {IMPORT_MODE_OPTIONS.map((option) => (
                <ChoiceCard
                  key={option.value}
                  label={option.label}
                  description={`${option.description} Exemple: ${option.sample}.`}
                  active={importMode === option.value}
                  onClick={() => setImportMode(option.value)}
                />
              ))}
            </div>

            <div className="grid gap-3 md:grid-cols-5">
              {IMPORT_SOURCE_OPTIONS.map((option) => (
                <SourceCard
                  key={option.value}
                  label={option.label}
                  description={option.description}
                  active={sourceProfile === option.value}
                  onClick={() => {
                    setSourceProfile(option.value);
                    setImportMode(getRecommendedMode(option.value));
                  }}
                />
              ))}
            </div>
          </div>

          <div className="w-full max-w-xl space-y-4 rounded-3xl border border-stone-200/10 bg-white/5 p-5 backdrop-blur">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-stone-400">Current setup</p>
                <p className="mt-1 text-lg font-semibold text-stone-100">
                  {getImportModeLabel(importMode)}
                </p>
              </div>
              <TonePill label={statusLabel} tone={statusTone} />
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-2xl border border-stone-200/10 bg-black/10 p-3">
                <p className="text-xs uppercase tracking-[0.18em] text-stone-400">Source</p>
                <p className="mt-1 text-sm font-medium text-stone-100">
                  {getImportSourceLabel(sourceProfile)}
                </p>
              </div>
              <div className="rounded-2xl border border-stone-200/10 bg-black/10 p-3">
                <p className="text-xs uppercase tracking-[0.18em] text-stone-400">Target account</p>
                <p className="mt-1 text-sm font-medium text-stone-100">{targetLabel}</p>
              </div>
              <div className="rounded-2xl border border-stone-200/10 bg-black/10 p-3">
                <p className="text-xs uppercase tracking-[0.18em] text-stone-400">Default currency</p>
                <select
                  value={defaultCurrency}
                  onChange={(event) => setDefaultCurrency(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-stone-300/15 bg-emerald-950/70 px-3 py-2 text-sm text-stone-100 outline-none"
                >
                  {COMMON_CURRENCIES.map((currency) => (
                    <option key={currency} value={currency}>
                      {currency}
                    </option>
                  ))}
                </select>
              </div>
              <div className="rounded-2xl border border-stone-200/10 bg-black/10 p-3">
                <p className="text-xs uppercase tracking-[0.18em] text-stone-400">History</p>
                <p className="mt-1 text-sm font-medium text-stone-100">
                  {importHistory.length} local import(s)
                </p>
              </div>
            </div>

            <div
              className={`group rounded-3xl border border-dashed p-5 transition ${
                isDragging
                  ? 'border-emerald-300/60 bg-emerald-500/10'
                  : 'border-stone-200/20 bg-black/10 hover:border-stone-200/30 hover:bg-black/20'
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
              <label className="block cursor-pointer space-y-3">
                <input
                  ref={csvInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleCsvFile}
                  className="sr-only"
                />
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-stone-100">
                    {selectedFileInfo ? 'Replace current file' : 'Drop your CSV here'}
                  </p>
                  <p className="text-xs leading-5 text-stone-300">
                    Glissez un fichier ici ou cliquez pour en sélectionner un. Le mapping
                    s’adapte aux colonnes reconnues automatiquement.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <TonePill label="CSV" tone="neutral" />
                  <TonePill label="Auto mapping" tone="good" />
                  <TonePill
                    label={importMode === 'transactions' ? 'Trades & cash' : 'Monthly holdings'}
                    tone="neutral"
                  />
                </div>
                <div className="rounded-2xl border border-stone-200/10 bg-black/10 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-stone-400">
                    Canonical header example
                  </p>
                  <p className="mt-2 break-all font-mono text-xs text-stone-200">
                    {csvHeaderExample}
                  </p>
                </div>
              </label>
            </div>

            {selectedFileInfo && (
              <div className="grid gap-2 rounded-2xl border border-stone-200/10 bg-black/10 p-4 text-sm text-stone-300 sm:grid-cols-2">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-stone-400">File name</p>
                  <p className="mt-1 text-stone-100">{selectedFileInfo.name}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-stone-400">Size</p>
                  <p className="mt-1 text-stone-100">{formatFileSize(selectedFileInfo.size)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-stone-400">Modified</p>
                  <p className="mt-1 text-stone-100">{formatLongDateTime(selectedFileInfo.lastModified)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-stone-400">Fingerprint</p>
                  <p className="mt-1 truncate font-mono text-xs text-stone-100">
                    {selectedFileInfo.fingerprint}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-6">
          <div className="rounded-3xl border border-stone-200/10 bg-white/5 p-5 shadow-lg shadow-emerald-950/10">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-stone-400">Preflight</p>
                <h4 className="mt-1 text-xl font-semibold text-stone-100">Résumé avant import</h4>
              </div>
              {previewStats && (
                <div className="flex flex-wrap gap-2">
                  <TonePill
                    label={`${previewStats.rowCount} lignes`}
                    tone={previewStats.blockingErrorCount > 0 ? 'warn' : 'good'}
                  />
                  <TonePill label={`${previewStats.duplicateRowCount} doublons`} tone="neutral" />
                  <TonePill
                    label={`${previewStats.nonEurCurrencyCount} FX`}
                    tone={previewStats.nonEurCurrencyCount > 0 ? 'warn' : 'good'}
                  />
                </div>
              )}
            </div>

            {!previewStats && (
              <p className="mt-4 text-sm text-stone-300">
                Importez un fichier pour obtenir le préflight détaillé.
              </p>
            )}

            {previewStats && (
              <div className="mt-4 space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <StatCard label="Rows" value={formatNumber(previewStats.rowCount)} hint="Parsed rows" />
                  <StatCard
                    label="Assets"
                    value={formatNumber(previewStats.uniqueAssetCount)}
                    hint="Unique tickers"
                  />
                  <StatCard
                    label="Accounts"
                    value={formatNumber(previewStats.uniquePlatformCount)}
                    hint="Platforms / wallets"
                  />
                  <StatCard
                    label="Confidence"
                    value={`${formatNumber(Math.round(previewStats.averageRequiredConfidence * 100))}%`}
                    hint="Required mapping"
                    tone={previewStats.averageRequiredConfidence >= 0.6 ? 'good' : 'warn'}
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <StatCard
                    label="Duplicates"
                    value={formatNumber(previewStats.duplicateRowCount)}
                    hint="Likely repeated lines"
                    tone={previewStats.duplicateRowCount > 0 ? 'warn' : 'good'}
                  />
                  <StatCard
                    label="Currencies"
                    value={formatNumber(previewStats.uniqueCurrencyCount)}
                    hint={previewStats.currencies.join(', ') || 'N/A'}
                  />
                  <StatCard
                    label="Coverage"
                    value={`${formatNumber(Math.round(previewStats.requiredMappingCoverage * 100))}%`}
                    hint="Required fields"
                    tone={previewStats.requiredMappingCoverage === 1 ? 'good' : 'warn'}
                  />
                  <StatCard
                    label="FX"
                    value={formatNumber(previewStats.nonEurCurrencyCount)}
                    hint="Non-EUR currencies"
                    tone={previewStats.nonEurCurrencyCount > 0 ? 'warn' : 'good'}
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-stone-200/10 bg-black/10 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-stone-400">Date range</p>
                    <p className="mt-1 text-sm font-medium text-stone-100">
                      {previewStats.dateRange.start && previewStats.dateRange.end
                        ? `${formatShortDate(previewStats.dateRange.start)} → ${formatShortDate(previewStats.dateRange.end)}`
                        : 'N/A'}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-stone-200/10 bg-black/10 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-stone-400">Source</p>
                    <p className="mt-1 text-sm font-medium text-stone-100">{previewStats.sourceLabel}</p>
                  </div>
                  <div className="rounded-2xl border border-stone-200/10 bg-black/10 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-stone-400">Target</p>
                    <p className="mt-1 text-sm font-medium text-stone-100">{previewStats.targetLabel}</p>
                  </div>
                </div>

                {historyMatch && (
                  <div className="rounded-2xl border border-amber-300/30 bg-amber-500/10 p-4 text-sm text-amber-100">
                    Ce fichier a déjà été importé localement le {formatLongDateTime(historyMatch.importedAt)}.
                    Vérifiez les doublons avant de relancer l’import.
                  </div>
                )}

                {previewStats.qualityNotes.length > 0 && (
                  <div className="rounded-2xl border border-amber-300/20 bg-amber-500/10 p-4">
                    <p className="text-sm font-semibold text-amber-100">Data quality</p>
                    <ul className="mt-3 space-y-2 text-sm text-amber-50">
                      {previewStats.qualityNotes.map((note) => (
                        <li key={note} className="flex gap-2">
                          <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-amber-200" />
                          <span>{note}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {previewStats.duplicateExamples.length > 0 && (
                  <div className="rounded-2xl border border-stone-200/10 bg-black/10 p-4">
                    <p className="text-sm font-semibold text-stone-100">Duplicate examples</p>
                    <ul className="mt-3 space-y-2 text-sm text-stone-300">
                      {previewStats.duplicateExamples.map((example) => (
                        <li key={example} className="rounded-xl bg-white/5 px-3 py-2">
                          {example}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          {csvHeaders.length > 0 &&
            (csvStatus === 'mapping' || (previewStats?.requiredMappingCoverage ?? 1) < 1) && (
            <div className="rounded-3xl border border-stone-200/10 bg-white/5 p-5 shadow-lg shadow-emerald-950/10">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-stone-400">
                    Column mapping assistant
                  </p>
                  <h4 className="mt-1 text-xl font-semibold text-stone-100">
                    Ajuster les colonnes uniquement si le préflight le demande
                  </h4>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleRestoreAutoMapping}
                    className="rounded-full border border-stone-200/20 px-4 py-2 text-xs font-medium text-stone-200 transition hover:bg-stone-100/10"
                  >
                    Restaurer auto-mapping
                  </button>
                  <label className="flex items-center gap-2 rounded-full border border-stone-200/10 bg-black/10 px-4 py-2 text-xs text-stone-300">
                    <input
                      type="checkbox"
                      checked={rememberMapping}
                      onChange={(e) => setRememberMapping(e.target.checked)}
                    />
                    Mémoriser ce template
                  </label>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                {activeImportFields.map((field) => {
                  const confidence = getFieldConfidence(
                    field,
                    columnMapping,
                    suggestedMapping,
                    mappingConfidence,
                  );
                  const confidenceUi = confidenceText(confidence);
                  const required = requiredFields.includes(field);
                  return (
                    <div key={field} className="rounded-2xl border border-stone-200/10 bg-black/10 p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-stone-100">
                            {FIELD_LABELS[field]}
                          </span>
                          {required && (
                            <span className="rounded-full border border-amber-300/30 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-100">
                              Required
                            </span>
                          )}
                        </div>
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] ${confidenceUi.className}`}>
                          {confidenceUi.label}
                        </span>
                      </div>
                      <select
                        value={columnMapping[field] ?? ''}
                        onChange={(event) => handleMappingChange(field, event.target.value)}
                        className="w-full rounded-xl border border-stone-300/15 bg-emerald-950/70 px-3 py-2 text-xs text-stone-100 outline-none"
                      >
                        <option value="">Auto detect / not forced</option>
                        {csvHeaders.map((header) => (
                          <option key={header} value={header}>
                            {header}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {csvMessage && (
            <div className="rounded-2xl border border-emerald-300/20 bg-emerald-500/10 px-4 py-3 text-sm text-stone-100">
              {csvMessage}
            </div>
          )}

          {fxMessage && (
            <div className="rounded-2xl border border-amber-300/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              {fxMessage}
            </div>
          )}

          {csvErrors.length > 0 && (
            <div className="rounded-2xl border border-rose-300/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
              <p className="font-semibold">Erreurs détectées</p>
              <ul className="mt-3 space-y-2">
                {csvErrors.slice(0, 5).map((error) => (
                  <li key={`${error.row}-${error.message}`}>
                    {error.row > 0 ? `Ligne ${error.row}: ` : ''}
                    {error.message}
                  </li>
                ))}
                {csvErrors.length > 5 && <li>... {csvErrors.length - 5} erreurs supplémentaires</li>}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleImportCsv}
              disabled={importDisabled}
              className="rounded-full bg-stone-100 px-5 py-3 text-sm font-semibold text-emerald-950 transition hover:bg-stone-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {csvStatus === 'importing'
                ? 'Import en cours...'
                : importMode === 'transactions'
                  ? `Importer les transactions${csvRows.length ? ` (${csvRows.length})` : ''}`
                  : `Importer les snapshots${csvRows.length ? ` (${csvRows.length})` : ''}`}
            </button>
            <button
              type="button"
              onClick={() => resetCsvState(true)}
              className="rounded-full border border-stone-200/20 px-5 py-3 text-sm font-semibold text-stone-200 transition hover:bg-stone-100/10"
            >
              Réinitialiser
            </button>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-3xl border border-stone-200/10 bg-white/5 p-5 shadow-lg shadow-emerald-950/10">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-stone-400">History</p>
                <h4 className="mt-1 text-xl font-semibold text-stone-100">
                  Imports locaux récents
                </h4>
              </div>
              <button
                type="button"
                onClick={() => {
                  clearImportHistory();
                  setImportHistory([]);
                }}
                className="rounded-full border border-stone-200/20 px-4 py-2 text-xs font-medium text-stone-200 transition hover:bg-stone-100/10"
              >
                Vider
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {importHistory.length === 0 ? (
                <p className="text-sm text-stone-300">
                  Aucun historique local pour le moment. Les imports réussis apparaîtront ici.
                </p>
              ) : (
                importHistory.slice(0, 5).map((entry) => (
                  <HistoryRow key={entry.id} entry={entry} />
                ))
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-stone-200/10 bg-white/5 p-5 shadow-lg shadow-emerald-950/10">
            <p className="text-xs uppercase tracking-[0.22em] text-stone-400">Import guide</p>
            <h4 className="mt-1 text-xl font-semibold text-stone-100">Ce que le flux couvre</h4>
            <div className="mt-4 space-y-3 text-sm leading-6 text-stone-300">
              <p>
                {importMode === 'transactions'
                  ? 'Les transactions BUY / SELL / DEPOSIT / WITHDRAW / FEE sont normalisées, puis les FX non EUR sont complétés automatiquement si possible.'
                  : 'Les snapshots mensuels servent de point d’ancrage à la valorisation. Les lignes sans prix restent exploitables, mais le suivi s’appuie alors sur les derniers prix connus.'}
              </p>
              <p>
                La provenance du fichier, le mapping mémorisé et les doublons probables sont
                conservés dans l’historique local du navigateur, en attendant un backend dédié.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CsvImportSection;
