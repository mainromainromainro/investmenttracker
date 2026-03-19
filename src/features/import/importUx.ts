import {
  CsvColumnMapping,
  CsvHeader,
  CsvParseError,
  NormalizedPositionSnapshotRow,
  NormalizedTransactionRow,
} from '../../lib/csvImport';
import { ImportJob, ImportMode, ImportSourceProfile } from '../../types';

export type { ImportMode, ImportSourceProfile } from '../../types';

export type ParsedCsvRow = NormalizedTransactionRow | NormalizedPositionSnapshotRow;

export interface DetectedImportPreset {
  sourceProfile: ImportSourceProfile;
  importMode: ImportMode;
  platformName: string;
  label: string;
}

export interface ImportFileInfo {
  name: string;
  size: number;
  lastModified: number;
  fingerprint: string;
}

export interface ImportPreviewStats {
  rowCount: number;
  errorCount: number;
  blockingErrorCount: number;
  duplicateRowCount: number;
  duplicateExamples: string[];
  uniquePlatformCount: number;
  uniqueAssetCount: number;
  uniqueCurrencyCount: number;
  currencies: string[];
  platformNames: string[];
  dateRange: {
    start: number | null;
    end: number | null;
  };
  requiredMappingCoverage: number;
  averageRequiredConfidence: number;
  missingRequiredFields: CsvHeader[];
  nonEurCurrencyCount: number;
  inferredPlatform: boolean;
  inferredCurrency: boolean;
  qualityNotes: string[];
  modeLabel: string;
  sourceLabel: string;
  targetLabel: string;
}

export type ImportHistoryEntry = ImportJob & ImportPreviewStats;

export const IMPORT_HISTORY_STORAGE_KEY = 'investment-tracker.csv.import-history.v1';
export const MAX_IMPORT_HISTORY_ENTRIES = 12;

export const IMPORT_MODE_OPTIONS: Array<{
  value: ImportMode;
  label: string;
  description: string;
  sample: string;
}> = [
  {
    value: 'monthly_positions',
    label: 'Snapshots mensuels',
    description: 'Importe un relevé de positions à une date donnée.',
    sample: 'Date,Platform,Asset,Qty,Price,Currency',
  },
  {
    value: 'transactions',
    label: 'Transactions detaillees',
    description: 'Importe achats, ventes, depots, retraits et frais.',
    sample: 'Date,Platform,Kind,Asset,Qty,Price,Currency',
  },
];

export const IMPORT_SOURCE_OPTIONS: Array<{
  value: ImportSourceProfile;
  label: string;
  description: string;
  recommendedMode: ImportMode;
}> = [
  {
    value: 'broker_export',
    label: 'Broker CSV',
    description: 'Extrait de courtier pour ETF, actions et cash.',
    recommendedMode: 'transactions',
  },
  {
    value: 'crypto_exchange',
    label: 'Crypto exchange',
    description: 'Trades, depots, retraits et rewards depuis un exchange.',
    recommendedMode: 'transactions',
  },
  {
    value: 'wallet_export',
    label: 'Wallet / ledger',
    description: 'Flux depuis un wallet ou un export de ledger.',
    recommendedMode: 'transactions',
  },
  {
    value: 'monthly_statement',
    label: 'Monthly statement',
    description: 'Relevé mensuel de positions consolidées.',
    recommendedMode: 'monthly_positions',
  },
  {
    value: 'custom',
    label: 'Custom source',
    description: 'Cas particulier, avec un mapping manuel.',
    recommendedMode: 'transactions',
  },
];

const HISTORY_VERSION_PREFIX = 'csv-import-history';

const fnv1a = (input: string): string => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
};

const normalizeFingerprintScope = (scope: string | undefined): string => {
  const normalized = String(scope ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

  return normalized || '__default__';
};

export const buildFileFingerprint = (
  text: string,
  mode: ImportMode,
  scope?: string,
): string =>
  `${HISTORY_VERSION_PREFIX}:${mode}:${normalizeFingerprintScope(scope)}:${fnv1a(
    text.replace(/\r\n/g, '\n'),
  )}`;

export const formatFileSize = (size: number): string => {
  if (!Number.isFinite(size) || size <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = size;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
};

export const formatShortDate = (timestamp: number | null): string => {
  if (timestamp === null) return 'N/A';
  return new Intl.DateTimeFormat('fr-FR', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(timestamp);
};

export const formatLongDateTime = (timestamp: number): string =>
  new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(timestamp);

export const formatNumber = (value: number, fractionDigits = 0): string =>
  new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);

export const getImportModeLabel = (mode: ImportMode): string =>
  IMPORT_MODE_OPTIONS.find((option) => option.value === mode)?.label ?? mode;

export const getImportSourceLabel = (sourceProfile: ImportSourceProfile): string =>
  IMPORT_SOURCE_OPTIONS.find((option) => option.value === sourceProfile)?.label ?? sourceProfile;

export const getRecommendedMode = (sourceProfile: ImportSourceProfile): ImportMode =>
  IMPORT_SOURCE_OPTIONS.find((option) => option.value === sourceProfile)?.recommendedMode ??
  'transactions';

const detectDelimiter = (line: string): ',' | ';' => {
  const commaCount = (line.match(/,/g) ?? []).length;
  const semicolonCount = (line.match(/;/g) ?? []).length;
  return semicolonCount > commaCount ? ';' : ',';
};

const normalizeHeaderToken = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');

export const detectImportPreset = (
  csvText: string,
  fileName?: string,
): DetectedImportPreset | null => {
  const firstLine = csvText.split(/\r?\n/, 1)[0] ?? '';
  if (!firstLine.trim()) {
    return null;
  }

  const headers = firstLine
    .split(detectDelimiter(firstLine))
    .map((header) => normalizeHeaderToken(header));
  const headerSet = new Set(headers);
  const normalizedFileName = (fileName ?? '').toLowerCase();

  const looksLikeTrading212 =
    headerSet.has('action') &&
    headerSet.has('time') &&
    headerSet.has('ticker') &&
    headerSet.has('no_of_shares') &&
    headerSet.has('price_share');

  if (looksLikeTrading212 || normalizedFileName.includes('t212')) {
    return {
      sourceProfile: 'broker_export',
      importMode: 'transactions',
      platformName: 'Trading 212',
      label: 'Trading 212',
    };
  }

  const looksLikeRevolut =
    headerSet.has('date') &&
    headerSet.has('ticker') &&
    headerSet.has('type') &&
    headerSet.has('quantity') &&
    headerSet.has('price_per_share') &&
    headerSet.has('total_amount');

  if (looksLikeRevolut || normalizedFileName.includes('revo') || normalizedFileName.includes('revolut')) {
    return {
      sourceProfile: 'broker_export',
      importMode: 'transactions',
      platformName: 'Revolut',
      label: 'Revolut',
    };
  }

  return null;
};

const isPositionRow = (row: ParsedCsvRow): row is NormalizedPositionSnapshotRow =>
  'qty' in row && !('kind' in row);

const buildRowSignature = (row: ParsedCsvRow, mode: ImportMode): string => {
  if (mode === 'transactions' && !isPositionRow(row)) {
    return [
      row.date,
      row.platform,
      row.kind,
      row.assetSymbol ?? '',
      row.qty ?? '',
      row.price ?? '',
      row.currency,
      row.cashCurrency ?? '',
      row.assetType ?? '',
    ].join('|');
  }

  return [
    row.date,
    row.platform,
    row.assetSymbol,
    row.qty,
    row.price ?? '',
    row.currency,
    row.assetType ?? '',
  ].join('|');
};

const buildRowLabel = (row: ParsedCsvRow, mode: ImportMode): string => {
  const date = formatShortDate(row.date);
  if (mode === 'transactions' && !isPositionRow(row)) {
    const parts = [
      date,
      row.platform,
      row.kind,
      row.assetSymbol ?? 'Cash',
      row.qty !== undefined ? `${row.qty}` : null,
    ].filter(Boolean);
    return parts.join(' · ');
  }

  const parts = [
    date,
    row.platform,
    row.assetSymbol,
    row.qty,
    row.price !== undefined ? `${row.price}` : null,
  ].filter(Boolean);
  return parts.join(' · ');
};

export const buildImportPreviewStats = (args: {
  mode: ImportMode;
  sourceProfile: ImportSourceProfile;
  rows: ParsedCsvRow[];
  errors: CsvParseError[];
  requiredFields: CsvHeader[];
  columnMapping: CsvColumnMapping;
  mappingConfidence: Partial<Record<CsvHeader, number>>;
  defaultCurrency: string;
  targetLabel: string;
}): ImportPreviewStats => {
  const { mode, sourceProfile, rows, errors, requiredFields, columnMapping, mappingConfidence, defaultCurrency, targetLabel } = args;
  const rowCount = rows.length;
  const blockingErrorCount = errors.filter(
    (error) => !(error.row === 0 && error.message.includes('Colonnes manquantes')),
  ).length;

  const uniquePlatformSet = new Set<string>();
  const uniqueAssetSet = new Set<string>();
  const currencySet = new Set<string>();
  const dateValues: number[] = [];
  const signatureCounts = new Map<string, number>();
  const signatureExamples = new Map<string, string>();

  for (const row of rows) {
    uniquePlatformSet.add(row.platform);
    currencySet.add(row.currency);
    dateValues.push(row.date);
    if (row.assetSymbol) {
      uniqueAssetSet.add(row.assetSymbol);
    }

    const signature = buildRowSignature(row, mode);
    signatureCounts.set(signature, (signatureCounts.get(signature) ?? 0) + 1);
    if (!signatureExamples.has(signature)) {
      signatureExamples.set(signature, buildRowLabel(row, mode));
    }
  }

  const duplicateEntries = Array.from(signatureCounts.entries()).filter(([, count]) => count > 1);
  const duplicateRowCount = duplicateEntries.reduce((sum, [, count]) => sum + (count - 1), 0);
  const duplicateExamples = duplicateEntries
    .map(([signature]) => signatureExamples.get(signature) ?? signature)
    .slice(0, 3);

  const uniquePlatformCount = uniquePlatformSet.size;
  const uniqueAssetCount = uniqueAssetSet.size;
  const uniqueCurrencyCount = currencySet.size;
  const currencies = Array.from(currencySet).sort((a, b) => a.localeCompare(b));
  const platformNames = Array.from(uniquePlatformSet).sort((a, b) => a.localeCompare(b));
  const dateRange = dateValues.length
    ? { start: Math.min(...dateValues), end: Math.max(...dateValues) }
    : { start: null, end: null };

  const missingRequiredFields = requiredFields.filter((field) => !columnMapping[field]);
  const requiredMappingCoverage =
    requiredFields.length === 0
      ? 1
      : (requiredFields.length - missingRequiredFields.length) / requiredFields.length;

  const confidenceValues = requiredFields
    .map((field) => mappingConfidence[field])
    .filter((value): value is number => typeof value === 'number');
  const averageRequiredConfidence =
    confidenceValues.length > 0
      ? confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length
      : 0;

  const inferredPlatform = !columnMapping.platform;
  const inferredCurrency = !columnMapping.currency;
  const nonEurCurrencyCount = Array.from(currencySet).filter((currency) => currency !== defaultCurrency)
    .length;

  const qualityNotes: string[] = [];
  if (blockingErrorCount > 0) {
    qualityNotes.push(`${blockingErrorCount} erreur(s) bloquante(s) doivent etre corrigees.`);
  }
  if (duplicateRowCount > 0) {
    qualityNotes.push(`${duplicateRowCount} ligne(s) en doublon detectee(s) dans ce fichier.`);
  }
  if (missingRequiredFields.length > 0) {
    qualityNotes.push(
      `Mapping incomplet: ${missingRequiredFields.map((field) => field).join(', ')}.`,
    );
  }
  if (inferredPlatform) {
    qualityNotes.push('La plateforme sera inferee via le CSV ou le compte cible par defaut.');
  }
  if (inferredCurrency) {
    qualityNotes.push('La devise sera inferee via la devise par defaut et les symboles lorsque possible.');
  }
  if (nonEurCurrencyCount > 0) {
    qualityNotes.push(
      `${nonEurCurrencyCount} devise(s) hors EUR detectee(s); les FX seront completes au moment de l’import.`,
    );
  }
  if (mode === 'monthly_positions') {
    const rowsWithoutPrice = rows.filter((row) => row.price === undefined).length;
    if (rowsWithoutPrice > 0) {
      qualityNotes.push(
        `${rowsWithoutPrice} ligne(s) de snapshot sans prix: le suivi s'appuiera sur les derniers prix disponibles.`,
      );
    }
  }
  if (mode === 'transactions') {
    const rowsWithoutAsset = rows.filter(
      (row) =>
        'kind' in row &&
        !row.assetSymbol &&
        row.kind !== 'DEPOSIT' &&
        row.kind !== 'WITHDRAW' &&
        row.kind !== 'FEE',
    ).length;
    if (rowsWithoutAsset > 0) {
      qualityNotes.push(
        `${rowsWithoutAsset} transaction(s) sans actif explicite: verification manuelle conseillee.`,
      );
    }
  }

  return {
    rowCount,
    errorCount: errors.length,
    blockingErrorCount,
    duplicateRowCount,
    duplicateExamples,
    uniquePlatformCount,
    uniqueAssetCount,
    uniqueCurrencyCount,
    currencies,
    platformNames,
    dateRange,
    requiredMappingCoverage,
    averageRequiredConfidence,
    missingRequiredFields,
    nonEurCurrencyCount,
    inferredPlatform,
    inferredCurrency,
    qualityNotes,
    modeLabel: getImportModeLabel(mode),
    sourceLabel: getImportSourceLabel(sourceProfile),
    targetLabel,
  };
};

export const loadImportHistory = (): ImportHistoryEntry[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(IMPORT_HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ImportHistoryEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed.sort((a, b) => b.importedAt - a.importedAt);
  } catch {
    return [];
  }
};

export const saveImportHistory = (history: ImportHistoryEntry[]) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(IMPORT_HISTORY_STORAGE_KEY, JSON.stringify(history));
};

export const addImportHistoryEntry = (entry: ImportHistoryEntry): ImportHistoryEntry[] => {
  const next = [entry, ...loadImportHistory().filter((item) => item.fileFingerprint !== entry.fileFingerprint)];
  const trimmed = next.slice(0, MAX_IMPORT_HISTORY_ENTRIES);
  saveImportHistory(trimmed);
  return trimmed;
};

export const clearImportHistory = (): void => {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(IMPORT_HISTORY_STORAGE_KEY);
};

export const findMatchingHistoryEntry = (
  fileFingerprint: string,
  history: ImportHistoryEntry[],
): ImportHistoryEntry | undefined => history.find((entry) => entry.fileFingerprint === fileFingerprint);
