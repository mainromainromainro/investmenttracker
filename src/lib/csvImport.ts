import {
  AssetType,
  ImportMode,
  ImportSourceAdapterId,
  TransactionKind,
} from '../types';
import { detectCsvSourceProfile, extractInteractiveBrokersOpenPositionSummary, CsvSourceProfile } from './csvSourceProfiles';
import { normalizeCsvToken, parseCsvRows } from './csvText';
import {
  normalizeBrokerSymbol,
  normalizeExchange,
  normalizeIsin,
} from './assetIdentity';

export type CsvHeader =
  | 'date'
  | 'platform'
  | 'asset_symbol'
  | 'isin'
  | 'broker_symbol'
  | 'exchange'
  | 'asset_name'
  | 'asset_type'
  | 'currency'
  | 'cash_currency'
  | 'kind'
  | 'qty'
  | 'price'
  | 'fee'
  | 'note';

export interface CsvParseError {
  row: number;
  message: string;
}

export interface NormalizedTransactionRow {
  date: number;
  platform: string;
  kind: TransactionKind;
  currency: string; // Asset / price currency
  cashCurrency?: string; // Settlement currency if different
  assetSymbol?: string;
  assetIsin?: string;
  brokerSymbol?: string;
  exchange?: string;
  assetName?: string;
  assetType?: AssetType;
  qty?: number;
  price?: number;
  fee?: number;
  note?: string;
  sourceAdapterId?: ImportSourceAdapterId;
  sourceSection?: string;
  sourceSignature?: string;
  sourceRowRef?: string;
  sourceRowNumber?: number;
}

export interface NormalizedPositionSnapshotRow {
  date: number;
  platform: string;
  currency: string;
  assetSymbol: string;
  assetIsin?: string;
  brokerSymbol?: string;
  exchange?: string;
  assetName?: string;
  assetType?: AssetType;
  qty: number;
  price?: number;
  note?: string;
  sourceAdapterId?: ImportSourceAdapterId;
  sourceSection?: string;
  sourceSignature?: string;
  sourceRowRef?: string;
  sourceRowNumber?: number;
}

export interface CsvParseResult<TRecord = NormalizedTransactionRow> {
  records: TRecord[];
  errors: CsvParseError[];
}

export type CsvColumnMapping = Partial<Record<CsvHeader, string>>;

export interface CsvColumnMappingSuggestion {
  headers: string[];
  mapping: CsvColumnMapping;
  confidence: Partial<Record<CsvHeader, number>>;
  signature: string;
}

export interface ParseNormalizedTransactionsOptions {
  defaultCurrency?: string;
  defaultPlatform?: string;
  columnMapping?: CsvColumnMapping;
}

export interface ParseNormalizedPositionSnapshotsOptions {
  defaultCurrency?: string;
  defaultPlatform?: string;
  columnMapping?: CsvColumnMapping;
}

export interface RecognizedCsvParseResult<TRecord = NormalizedTransactionRow | NormalizedPositionSnapshotRow> {
  sourceProfile: CsvSourceProfile;
  platformName: string | null;
  mode: ImportMode;
  records: TRecord[];
  errors: CsvParseError[];
  unsupportedSections: string[];
  sourceAdapterId?: ImportSourceAdapterId;
  sourceSection?: string;
  sourceSignature?: string;
  warnings: string[];
}

const TRANSACTION_KINDS: TransactionKind[] = [
  'BUY',
  'SELL',
  'DEPOSIT',
  'WITHDRAW',
  'FEE',
  'DIVIDEND',
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'STAKING_REWARD',
  'AIRDROP',
];

const ASSET_TYPES: AssetType[] = ['ETF', 'STOCK', 'CRYPTO'];

const REQUIRED_HEADERS: CsvHeader[] = ['date', 'kind'];
const POSITION_SNAPSHOT_REQUIRED_HEADERS: CsvHeader[] = ['date', 'asset_symbol', 'qty'];
const BUY_SELL_HEADERS: CsvHeader[] = [
  'asset_symbol',
  'asset_name',
  'asset_type',
  'qty',
  'price',
];

export const NORMALIZED_TRANSACTION_HEADERS: CsvHeader[] = [
  'date',
  'platform',
  'currency',
  'kind',
  ...BUY_SELL_HEADERS,
  'fee',
  'note',
  'isin',
  'broker_symbol',
  'exchange',
];

export const NORMALIZED_POSITION_SNAPSHOT_HEADERS: CsvHeader[] = [
  'date',
  'platform',
  'asset_symbol',
  'asset_name',
  'asset_type',
  'qty',
  'price',
  'currency',
  'note',
  'isin',
  'broker_symbol',
  'exchange',
];

export const CSV_IMPORT_FIELDS: CsvHeader[] = [
  'date',
  'platform',
  'kind',
  'asset_symbol',
  'asset_name',
  'asset_type',
  'qty',
  'price',
  'currency',
  'cash_currency',
  'fee',
  'note',
  'isin',
  'broker_symbol',
  'exchange',
];

export const CSV_POSITION_SNAPSHOT_FIELDS: CsvHeader[] = [
  'date',
  'platform',
  'asset_symbol',
  'asset_name',
  'asset_type',
  'qty',
  'price',
  'currency',
  'note',
  'isin',
  'broker_symbol',
  'exchange',
];

const HEADER_ALIASES: Record<string, CsvHeader> = {
  time: 'date',
  transaction_date: 'date',
  trade_date: 'date',
  execution_date: 'date',
  executed_at: 'date',
  datetime: 'date',
  timestamp: 'date',
  date_time: 'date',
  broker: 'platform',
  broker_name: 'platform',
  broker_platform: 'platform',
  platform_name: 'platform',
  provider: 'platform',
  source: 'platform',
  account: 'platform',
  account_name: 'platform',
  where: 'platform',
  courtier: 'platform',
  plateforme: 'platform',
  ticker: 'asset_symbol',
  tkr: 'asset_symbol',
  ticker_symbol: 'asset_symbol',
  symbol: 'asset_symbol',
  code: 'asset_symbol',
  code_valeur: 'asset_symbol',
  code_titre: 'asset_symbol',
  valeur_code: 'asset_symbol',
  instrument: 'asset_symbol',
  instrument_code: 'asset_symbol',
  instrument_symbol: 'asset_symbol',
  security_symbol: 'asset_symbol',
  security_code: 'asset_symbol',
  product_code: 'asset_symbol',
  broker_symbol: 'broker_symbol',
  broker_ticker: 'broker_symbol',
  market_symbol: 'broker_symbol',
  isin: 'isin',
  isin_code: 'isin',
  exchange: 'exchange',
  market: 'exchange',
  venue: 'exchange',
  stock_exchange: 'exchange',
  place: 'exchange',
  bourse: 'exchange',
  stock_name: 'asset_name',
  instrument_name: 'asset_name',
  security_name: 'asset_name',
  company_name: 'asset_name',
  label: 'asset_name',
  libelle: 'asset_name',
  instrument_type: 'asset_type',
  security_type: 'asset_type',
  asset_category: 'asset_type',
  category: 'asset_type',
  class: 'asset_type',
  units: 'qty',
  shares: 'qty',
  quantity: 'qty',
  titres: 'qty',
  nb_titres: 'qty',
  nombre_titres: 'qty',
  titres_detenus: 'qty',
  quantite_detenu: 'qty',
  quantite_detenue: 'qty',
  no_of_shares: 'qty',
  qty: 'qty',
  size: 'qty',
  volume: 'qty',
  filled_quantity: 'qty',
  executed_quantity: 'qty',
  quantite: 'qty',
  nombre: 'qty',
  amount: 'qty',
  unit_price: 'price',
  price_share: 'price',
  px: 'price',
  price_per_share: 'price',
  execution_price: 'price',
  average_price: 'price',
  avg_price: 'price',
  total_amount: 'price',
  total: 'price',
  prix: 'price',
  cours: 'price',
  currency_price_share: 'currency',
  currency_total: 'cash_currency',
  fees: 'fee',
  fee_amount: 'fee',
  commission: 'fee',
  commissions: 'fee',
  currency_conversion_fee: 'fee',
  french_transaction_tax: 'fee',
  charge: 'fee',
  charges: 'fee',
  frais: 'fee',
  cost: 'fee',
  costs: 'fee',
  type: 'kind',
  side: 'kind',
  action: 'kind',
  operation: 'kind',
  transaction: 'kind',
  ordre: 'kind',
  trade_type: 'kind',
  transaction_type: 'kind',
  name: 'asset_name',
  description: 'asset_name',
  asset: 'asset_name',
  assetclass: 'asset_type',
  asset_class: 'asset_type',
  ccy: 'currency',
  devise: 'currency',
  quote_ccy: 'currency',
  quote_currency: 'currency',
  currency_code: 'currency',
  price_currency: 'currency',
  cash_ccy: 'cash_currency',
  settlement_ccy: 'cash_currency',
  cash_currency: 'cash_currency',
  settlement_currency: 'cash_currency',
  comment: 'note',
  comments: 'note',
  memo: 'note',
  details: 'note',
  remarks: 'note',
  remarque: 'note',
};

const HEADER_GUESS_RULES: Array<{ header: CsvHeader; pattern: RegExp }> = [
  { header: 'date', pattern: /(?:^|_)(?:date|datetime|timestamp|execut(?:e|ed)|trade_date|transaction_date)(?:_|$)/ },
  { header: 'platform', pattern: /(?:^|_)(?:broker|platform|provider|source|account|courtier)(?:_|$)/ },
  { header: 'kind', pattern: /(?:^|_)(?:kind|side|action|operation|transaction|order)(?:_|$)/ },
  { header: 'asset_symbol', pattern: /(?:^|_)(?:ticker|symbol|instrument|security|product_code)(?:_|$)/ },
  { header: 'broker_symbol', pattern: /(?:^|_)(?:broker_symbol|market_symbol)(?:_|$)/ },
  { header: 'isin', pattern: /(?:^|_)(?:isin|isin_code)(?:_|$)/ },
  { header: 'exchange', pattern: /(?:^|_)(?:exchange|venue|market|stock_exchange|bourse)(?:_|$)/ },
  { header: 'asset_name', pattern: /(?:^|_)(?:asset_name|instrument_name|security_name|company_name|description|label|libelle|name)(?:_|$)/ },
  { header: 'asset_type', pattern: /(?:^|_)(?:asset_type|assetclass|class|category|security_type|instrument_type)(?:_|$)/ },
  { header: 'currency', pattern: /(?:^|_)(?:currency|ccy|devise|quote_currency|price_currency)(?:_|$)/ },
  { header: 'cash_currency', pattern: /(?:^|_)(?:cash_currency|settlement_currency|cash_ccy|settlement_ccy|base_currency)(?:_|$)/ },
  { header: 'qty', pattern: /(?:^|_)(?:qty|quantity|shares|units|volume|filled|executed_quantity|quantite|nombre)(?:_|$)/ },
  { header: 'price', pattern: /(?:^|_)(?:price|unit_price|execution_price|avg_price|average_price|prix|cours)(?:_|$)/ },
  { header: 'fee', pattern: /(?:^|_)(?:fee|fees|commission|frais|charge|cost)(?:_|$)/ },
  { header: 'note', pattern: /(?:^|_)(?:note|memo|comment|remarks?|details?)(?:_|$)/ },
];

const KIND_ALIASES: Record<string, TransactionKind> = {
  buy: 'BUY',
  purchase: 'BUY',
  marketbuy: 'BUY',
  buymarket: 'BUY',
  limitbuy: 'BUY',
  achat: 'BUY',
  acquired: 'BUY',
  bought: 'BUY',
  b: 'BUY',
  sell: 'SELL',
  marketsell: 'SELL',
  sellmarket: 'SELL',
  limitsell: 'SELL',
  vente: 'SELL',
  sold: 'SELL',
  s: 'SELL',
  deposit: 'DEPOSIT',
  cashin: 'DEPOSIT',
  topup: 'DEPOSIT',
  funding: 'DEPOSIT',
  versement: 'DEPOSIT',
  withdraw: 'WITHDRAW',
  withdrawal: 'WITHDRAW',
  cashout: 'WITHDRAW',
  retrait: 'WITHDRAW',
  fee: 'FEE',
  fees: 'FEE',
  commission: 'FEE',
  frais: 'FEE',
  dividend: 'DIVIDEND',
  div: 'DIVIDEND',
  transferin: 'TRANSFER_IN',
  transferout: 'TRANSFER_OUT',
  stakingreward: 'STAKING_REWARD',
  airdrop: 'AIRDROP',
};

const IGNORED_TRANSACTION_KIND_TOKENS = new Set([
  'result_adjustment',
  'adjustment_result',
  'adjustement_resultat',
  'resultat_adjustment',
  'resultat_adjustement',
]);

const ASSET_TYPE_ALIASES: Record<string, AssetType> = {
  etf: 'ETF',
  etfs: 'ETF',
  fund: 'ETF',
  funds: 'ETF',
  stock: 'STOCK',
  stocks: 'STOCK',
  equity: 'STOCK',
  action: 'STOCK',
  crypto: 'CRYPTO',
  cryptocurrency: 'CRYPTO',
  coin: 'CRYPTO',
  token: 'CRYPTO',
};

const DEFAULT_CURRENCY = 'EUR';
const DEFAULT_ASSET_TYPE: AssetType = 'STOCK';

const normalizeHeader = (header: string | undefined): CsvHeader | string =>
  normalizeCsvToken(header);

const inferHeaderAliasWithConfidence = (
  header: string | undefined,
): { header: CsvHeader | null; confidence: number } => {
  const normalized = normalizeHeader(header) as string;
  if (!normalized) return { header: null, confidence: 0 };
  if (CSV_IMPORT_FIELDS.includes(normalized as CsvHeader)) {
    return { header: normalized as CsvHeader, confidence: 1 };
  }

  const direct = HEADER_ALIASES[normalized];
  if (direct) return { header: direct, confidence: 0.98 };

  const compact = normalized.replace(/[^a-z0-9_]/g, '');
  for (const rule of HEADER_GUESS_RULES) {
    if (rule.pattern.test(normalized) || rule.pattern.test(compact)) {
      return { header: rule.header, confidence: 0.72 };
    }
  }
  return { header: null, confidence: 0 };
};

const inferHeaderAlias = (header: string | undefined): CsvHeader | null =>
  inferHeaderAliasWithConfidence(header).header;

const isRowEmpty = (row: string[]): boolean =>
  row.every((value) => (value ?? '').trim() === '');

const parseCsv = (text: string): string[][] => parseCsvRows(text);

const parseFloatSafe = (value: string | undefined): number | null => {
  if (value === undefined) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  let normalized = trimmed
    .replace(/\s/g, '')
    .replace(/'/g, '')
    .replace(/[^\d,.\-()]/g, '');

  const isNegative = normalized.startsWith('(') && normalized.endsWith(')');
  if (isNegative) {
    normalized = `-${normalized.slice(1, -1)}`;
  }
  normalized = normalized.replace(/[()]/g, '');

  const commaCount = (normalized.match(/,/g) ?? []).length;
  const dotCount = (normalized.match(/\./g) ?? []).length;
  if (commaCount > 0 && dotCount > 0) {
    if (normalized.lastIndexOf(',') > normalized.lastIndexOf('.')) {
      normalized = normalized.replace(/\./g, '').replace(/,/g, '.');
    } else {
      normalized = normalized.replace(/,/g, '');
    }
  } else if (commaCount > 0 && dotCount === 0) {
    normalized =
      commaCount === 1 ? normalized.replace(',', '.') : normalized.replace(/,/g, '');
  }

  const parsed = Number(normalized);
  return Number.isNaN(parsed) ? null : parsed;
};

const parseDate = (value: string | undefined): number | null => {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return null;

  const isoMatch = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return Date.UTC(year, month - 1, day);
    }
  }

  const slashMatch = trimmed.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (slashMatch) {
    const first = Number(slashMatch[1]);
    const second = Number(slashMatch[2]);
    const yearPart = Number(slashMatch[3]);
    const year = yearPart < 100 ? 2000 + yearPart : yearPart;

    if (first >= 1 && first <= 31 && second >= 1 && second <= 12 && first > 12) {
      return Date.UTC(year, second - 1, first);
    }
    if (first >= 1 && first <= 12 && second >= 1 && second <= 31 && second > 12) {
      return Date.UTC(year, first - 1, second);
    }
    if (first >= 1 && first <= 31 && second >= 1 && second <= 12) {
      return Date.UTC(year, second - 1, first);
    }
    if (first >= 1 && first <= 12 && second >= 1 && second <= 31) {
      return Date.UTC(year, first - 1, second);
    }
  }

  const timestamp = Number(trimmed);
  if (!Number.isNaN(timestamp) && trimmed.length >= 12) {
    return timestamp;
  }
  if (!Number.isNaN(timestamp) && trimmed.length === 10) {
    return timestamp * 1000;
  }
  const parsed = Date.parse(trimmed);
  return Number.isNaN(parsed) ? null : parsed;
};

const normalizeCurrency = (value: string | undefined): string | null => {
  const trimmed = String(value ?? '').trim().toUpperCase();
  if (trimmed.length !== 3) return null;
  return trimmed;
};

const normalizeQuotedPrice = (
  price: number | null,
  currency: string | null,
): { price: number | null; currency: string | null } => {
  if (price === null || currency === null) {
    return { price, currency };
  }

  if (currency === 'GBX') {
    return {
      price: price / 100,
      currency: 'GBP',
    };
  }

  return { price, currency };
};

const normalizePlatform = (value: string | undefined): string | null => {
  const trimmed = String(value ?? '').trim();
  return trimmed || null;
};

const normalizeNote = (value: string | undefined): string | undefined => {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

const normalizeAssetSymbol = (value: string | undefined): string | undefined => {
  if (!value) return undefined;
  const trimmed = value.trim().toUpperCase();
  return trimmed || undefined;
};

const pickDisplayAssetSymbol = (
  assetSymbol: string | undefined,
  brokerSymbol: string | undefined,
  assetIsin: string | undefined,
) => assetSymbol ?? brokerSymbol ?? assetIsin;

const normalizeAssetName = (value: string | undefined): string | undefined => {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
};

const normalizeKind = (value: string | undefined): TransactionKind | null => {
  const raw = String(value ?? '').trim();
  if (!raw) return null;

  const upper = raw.toUpperCase();
  const direct = TRANSACTION_KINDS.find((entry) => entry === upper);
  if (direct) return direct;

  const normalized = normalizeHeader(raw).replace(/[^a-z0-9]/g, '');
  return KIND_ALIASES[normalized] ?? null;
};

const normalizeAssetType = (value: string | undefined): AssetType | undefined | null => {
  const raw = String(value ?? '').trim();
  if (!raw) return undefined;

  const upper = raw.toUpperCase();
  if (ASSET_TYPES.includes(upper as AssetType)) {
    return upper as AssetType;
  }

  const normalized = normalizeHeader(raw).replace(/[^a-z0-9]/g, '');
  return ASSET_TYPE_ALIASES[normalized] ?? null;
};

const SUFFIX_CURRENCY_MAP: Record<string, string> = {
  '.L': 'GBP',
  '.LN': 'GBP',
  '.PA': 'EUR',
  '.AS': 'EUR',
  '.DE': 'EUR',
  '.F': 'EUR',
  '.SW': 'CHF',
  '.HE': 'EUR',
  '.TO': 'CAD',
  '.V': 'CAD',
  '.AX': 'AUD',
  '.HK': 'HKD',
  '.SI': 'SGD',
  '.T': 'JPY',
};

const inferCurrencyFromSymbol = (symbol?: string): string | null => {
  if (!symbol) return null;
  const upper = symbol.toUpperCase();
  const suffixEntry = Object.entries(SUFFIX_CURRENCY_MAP).find(([suffix]) =>
    upper.endsWith(suffix),
  );
  if (suffixEntry) {
    return suffixEntry[1];
  }
  if (upper.endsWith('-USD')) return 'USD';
  if (upper.endsWith('-EUR')) return 'EUR';
  if (upper.endsWith('-GBP')) return 'GBP';
  if (upper.endsWith('-CAD')) return 'CAD';
  if (upper.endsWith('-CHF')) return 'CHF';
  return null;
};

const applyColumnMappingOverrides = (
  rawHeaders: string[],
  inferredHeaders: Array<CsvHeader | string | null>,
  columnMapping?: CsvColumnMapping,
): Array<CsvHeader | string | null> => {
  if (!columnMapping) return inferredHeaders;

  const overrideBySourceHeader = new Map<string, CsvHeader>();
  for (const field of CSV_IMPORT_FIELDS) {
    const source = columnMapping[field];
    if (!source) continue;
    const normalizedSource = normalizeHeader(source) as string;
    if (!normalizedSource) continue;
    overrideBySourceHeader.set(normalizedSource, field);
  }

  if (overrideBySourceHeader.size === 0) return inferredHeaders;

  return rawHeaders.map((rawHeader, index) => {
    const normalizedRaw = normalizeHeader(rawHeader) as string;
    return overrideBySourceHeader.get(normalizedRaw) ?? inferredHeaders[index];
  });
};

const safeRatio = (count: number, total: number): number =>
  total <= 0 ? 0 : count / total;

const buildColumnProfiles = (
  rows: string[][],
  headerCount: number,
): Array<{
  dateRatio: number;
  numberRatio: number;
  currencyRatio: number;
  kindRatio: number;
  symbolRatio: number;
}> => {
  const sampleRows = rows.slice(1, 61);

  return Array.from({ length: headerCount }, (_, columnIndex) => {
    const values = sampleRows
      .map((row) => row[columnIndex] ?? '')
      .map((value) => value.trim())
      .filter((value) => value.length > 0);

    const total = values.length;
    if (total === 0) {
      return {
        dateRatio: 0,
        numberRatio: 0,
        currencyRatio: 0,
        kindRatio: 0,
        symbolRatio: 0,
      };
    }

    let dateCount = 0;
    let numberCount = 0;
    let currencyCount = 0;
    let kindCount = 0;
    let symbolCount = 0;

    for (const value of values) {
      if (parseDate(value) !== null) dateCount += 1;
      if (parseFloatSafe(value) !== null) numberCount += 1;
      if (normalizeCurrency(value) !== null) currencyCount += 1;
      if (normalizeKind(value) !== null) kindCount += 1;
      if (/^[A-Z0-9.\-/]{1,20}$/i.test(value)) symbolCount += 1;
    }

    return {
      dateRatio: safeRatio(dateCount, total),
      numberRatio: safeRatio(numberCount, total),
      currencyRatio: safeRatio(currencyCount, total),
      kindRatio: safeRatio(kindCount, total),
      symbolRatio: safeRatio(symbolCount, total),
    };
  });
};

const scoreFieldWithProfile = (
  field: CsvHeader,
  profile: {
    dateRatio: number;
    numberRatio: number;
    currencyRatio: number;
    kindRatio: number;
    symbolRatio: number;
  },
): number => {
  switch (field) {
    case 'date':
      return profile.dateRatio * 0.6;
    case 'kind':
      return profile.kindRatio * 0.62;
    case 'currency':
    case 'cash_currency':
      return profile.currencyRatio * 0.6;
    case 'qty':
    case 'price':
    case 'fee':
      return profile.numberRatio * 0.45;
    case 'asset_symbol':
    case 'broker_symbol':
    case 'isin':
      return profile.symbolRatio * 0.45;
    default:
      return 0;
  }
};

export const buildCsvHeaderSignature = (headers: string[]): string =>
  headers.map((header) => normalizeHeader(header) as string).join('|');

const normalizeNumberFingerprintPart = (value: number | undefined) =>
  value === undefined ? '' : Number(value.toFixed(12)).toString();

const getRowValueByNormalizedHeader = (
  rawHeaders: string[],
  rawRow: string[] | undefined,
  headerName: string,
) => {
  if (!rawRow) return undefined;
  const target = normalizeHeader(headerName) as string;
  const index = rawHeaders.findIndex(
    (header) => (normalizeHeader(header) as string) === target,
  );
  if (index === -1) return undefined;
  return rawRow[index];
};

const buildTrading212SourceRowRef = (
  rawHeaders: string[],
  rawRow: string[] | undefined,
  row: NormalizedTransactionRow,
) => {
  const nativeId = getRowValueByNormalizedHeader(rawHeaders, rawRow, 'id')?.trim();
  if (nativeId) {
    return `trading212:${nativeId}`;
  }

  return [
    'trading212',
    row.date,
    row.kind,
    row.assetIsin ?? '',
    row.brokerSymbol ?? row.assetSymbol ?? '',
    normalizeNumberFingerprintPart(row.qty),
    normalizeNumberFingerprintPart(row.price),
  ].join(':');
};

const buildRevolutSourceRowRef = (
  rawHeaders: string[],
  rawRow: string[] | undefined,
  row: NormalizedTransactionRow,
) =>
  [
    'revolut_stock',
    getRowValueByNormalizedHeader(rawHeaders, rawRow, 'date')?.trim() ?? row.date,
    getRowValueByNormalizedHeader(rawHeaders, rawRow, 'ticker')?.trim() ??
      row.brokerSymbol ??
      row.assetSymbol ??
      '',
    getRowValueByNormalizedHeader(rawHeaders, rawRow, 'type')?.trim() ?? row.kind,
    getRowValueByNormalizedHeader(rawHeaders, rawRow, 'quantity')?.trim() ??
      normalizeNumberFingerprintPart(row.qty),
    getRowValueByNormalizedHeader(rawHeaders, rawRow, 'price_per_share')?.trim() ??
      normalizeNumberFingerprintPart(row.price),
    getRowValueByNormalizedHeader(rawHeaders, rawRow, 'total_amount')?.trim() ?? '',
  ].join(':');

const annotateRecognizedTransactionRows = (
  rows: NormalizedTransactionRow[],
  args: {
    sourceAdapterId: ImportSourceAdapterId;
    sourceSection: string;
    sourceSignature: string;
    rawRows: string[][];
    buildSourceRowRef: (
      rawHeaders: string[],
      rawRow: string[] | undefined,
      row: NormalizedTransactionRow,
    ) => string;
  },
): NormalizedTransactionRow[] => {
  const rawHeaders = args.rawRows[0] ?? [];

  return rows.map((row) => {
    const rawRow =
      typeof row.sourceRowNumber === 'number' ? args.rawRows[row.sourceRowNumber - 1] : undefined;

    return {
      ...row,
      sourceAdapterId: args.sourceAdapterId,
      sourceSection: args.sourceSection,
      sourceSignature: args.sourceSignature,
      sourceRowRef: args.buildSourceRowRef(rawHeaders, rawRow, row),
    };
  });
};

export const suggestCsvColumnMapping = (csvText: string): CsvColumnMappingSuggestion => {
  const rows = parseCsv(csvText);
  const headers = rows[0] ?? [];
  const signature = buildCsvHeaderSignature(headers);

  if (headers.length === 0) {
    return {
      headers: [],
      mapping: {},
      confidence: {},
      signature,
    };
  }

  const columnProfiles = buildColumnProfiles(rows, headers.length);
  const bestByField: Record<CsvHeader, { header: string; score: number } | null> = {
    date: null,
    platform: null,
    kind: null,
    asset_symbol: null,
    isin: null,
    broker_symbol: null,
    exchange: null,
    asset_name: null,
    asset_type: null,
    qty: null,
    price: null,
    currency: null,
    cash_currency: null,
    fee: null,
    note: null,
  };

  for (let index = 0; index < headers.length; index += 1) {
    const rawHeader = headers[index];
    const alias = inferHeaderAliasWithConfidence(rawHeader);
    const profile = columnProfiles[index];

    for (const field of CSV_IMPORT_FIELDS) {
      const aliasScore = alias.header === field ? alias.confidence : 0;
      const profileScore = scoreFieldWithProfile(field, profile);
      const totalScore = aliasScore + profileScore;
      if (totalScore < 0.26) continue;

      const existing = bestByField[field];
      if (!existing || totalScore > existing.score) {
        bestByField[field] = { header: rawHeader, score: totalScore };
      }
    }
  }

  const mapping: CsvColumnMapping = {};
  const confidence: Partial<Record<CsvHeader, number>> = {};
  for (const field of CSV_IMPORT_FIELDS) {
    const best = bestByField[field];
    if (!best) continue;
    mapping[field] = best.header;
    confidence[field] =
      best.score >= 1 ? 0.92 : Math.max(0, Math.min(0.9, best.score * 0.88));
  }

  return {
    headers,
    mapping,
    confidence,
    signature,
  };
};

const buildAutomaticColumnMapping = (
  csvText: string,
  inferredHeaders: Array<CsvHeader | string | null>,
  targetFields: CsvHeader[],
  minimumConfidence = 0.25,
): CsvColumnMapping => {
  const suggestion = suggestCsvColumnMapping(csvText);
  const mapping: CsvColumnMapping = {};

  for (const field of targetFields) {
    if (inferredHeaders.includes(field)) {
      continue;
    }

    const suggestedHeader = suggestion.mapping[field];
    const confidence = suggestion.confidence[field] ?? 0;
    if (!suggestedHeader || confidence < minimumConfidence) {
      continue;
    }

    mapping[field] = suggestedHeader;
  }

  return mapping;
};

const buildRowCells = (
  canonicalHeaders: Array<CsvHeader | string | null>,
  rawHeaders: string[],
  rawRow: string[],
): Record<string, string> => {
  const cells: Record<string, string> = {};

  canonicalHeaders.forEach((header, index) => {
    if (!header) {
      return;
    }
    const nextValue = rawRow[index] ?? '';
    if (!(header in cells) || cells[header] === '') {
      cells[header] = nextValue;
      return;
    }

    if (header === 'fee' && nextValue.trim() !== '') {
      const existingFee = parseFloatSafe(cells[header]);
      const nextFee = parseFloatSafe(nextValue);
      if (existingFee !== null && nextFee !== null) {
        cells[header] = String(existingFee + nextFee);
        return;
      }
    }

    if (header === 'asset_symbol' && nextValue.trim() !== '') {
      const normalizedRawHeader = normalizeHeader(rawHeaders[index]) as string;
      if (
        normalizedRawHeader.includes('ticker') ||
        normalizedRawHeader === 'symbol' ||
        normalizedRawHeader === 'ticker_symbol'
      ) {
        cells[header] = nextValue;
      }
    }
  });

  return cells;
};

const buildStructuredRowCells = (headers: string[], rawRow: string[]): Record<string, string> => {
  const cells: Record<string, string> = {};

  headers.forEach((header, index) => {
    const normalizedHeader = normalizeHeader(header) as string;
    if (!normalizedHeader) {
      return;
    }
    cells[normalizedHeader] = rawRow[index] ?? '';
  });

  return cells;
};

const normalizeIbkrInstrumentType = (value: string | undefined): AssetType | null => {
  const normalized = normalizeHeader(value).replace(/[^a-z0-9]/g, '');
  if (!normalized) return null;
  if (normalized === 'cash') return null;
  if (normalized.includes('etf') || normalized.includes('fund')) return 'ETF';
  if (normalized.includes('stock') || normalized.includes('share') || normalized.includes('equity')) {
    return 'STOCK';
  }
  if (normalized.includes('crypto') || normalized.includes('coin') || normalized.includes('token')) {
    return 'CRYPTO';
  }
  return null;
};

export const parseInteractiveBrokersOpenPositionSummaryCsv = (
  csvText: string,
  options?: ParseNormalizedPositionSnapshotsOptions,
): CsvParseResult<NormalizedPositionSnapshotRow> => {
  const extraction = extractInteractiveBrokersOpenPositionSummary(csvText);
  if (!extraction.section) {
    return {
      records: [],
      errors: [{ row: 0, message: 'Section Open Position Summary introuvable dans le rapport IBKR.' }],
    };
  }

  const fallbackCurrency = options?.defaultCurrency ?? DEFAULT_CURRENCY;
  const fallbackPlatform = normalizePlatform(options?.defaultPlatform) ?? 'Interactive Brokers';
  const sourceSection = extraction.section.name;
  const sourceSignature = buildCsvHeaderSignature(extraction.section.headers);
  const headerIndex = new Map(
    extraction.section.headers.map((header, index) => [normalizeHeader(header) as string, index]),
  );
  const getValue = (row: string[], headerName: string): string | undefined => {
    const index = headerIndex.get(normalizeHeader(headerName) as string);
    if (index === undefined) return undefined;
    return row[index];
  };

  const records: NormalizedPositionSnapshotRow[] = [];
  const errors: CsvParseError[] = extraction.unsupportedSections.length
    ? [
        {
          row: 0,
          message: `Sections IBKR ignorées: ${extraction.unsupportedSections.join(', ')}.`,
        },
      ]
    : [];

  for (let i = 0; i < extraction.section.dataRows.length; i += 1) {
    const rawRow = extraction.section.dataRows[i] ?? [];
    const rowIndex = i + 1;
    const cells = buildStructuredRowCells(extraction.section.headers, rawRow);

    const dateToken = getValue(rawRow, 'Date');
    if (normalizeHeader(dateToken) === 'total') {
      continue;
    }
    const date = dateToken ? parseDate(dateToken) : null;
    const instrument = normalizeHeader(getValue(rawRow, 'FinancialInstrument'));
    const sector = normalizeHeader(getValue(rawRow, 'Sector'));
    const symbol = normalizeAssetSymbol(getValue(rawRow, 'Symbol'));
    const assetName = normalizeAssetName(getValue(rawRow, 'Description'));
    const currency = normalizeCurrency(getValue(rawRow, 'Currency')) ?? fallbackCurrency;
    const qtyValue = parseFloatSafe(getValue(rawRow, 'Quantity'));
    const priceValue = parseFloatSafe(getValue(rawRow, 'ClosePrice'));
    const assetType = normalizeIbkrInstrumentType(getValue(rawRow, 'FinancialInstrument'));

    if (
      !symbol ||
      date === null ||
      qtyValue === null ||
      qtyValue < 0 ||
      !currency ||
      (priceValue !== null && priceValue < 0)
    ) {
      const problems: string[] = [];
      if (!symbol) problems.push('symbol absent');
      if (date === null) problems.push('date invalide');
      if (qtyValue === null || qtyValue < 0) problems.push('quantite invalide');
      if (!currency) problems.push('devise invalide');
      if (priceValue !== null && priceValue < 0) problems.push('prix invalide');
      errors.push({
        row: rowIndex,
        message: `Ligne IBKR Open Position Summary ignorée: ${problems.join(', ')}.`,
      });
      continue;
    }

    if (
      instrument === 'cash' ||
      sector === 'cash' ||
      symbol === currency ||
      symbol === 'EUR' && instrument === 'cash'
    ) {
      continue;
    }

    records.push({
      date: date,
      platform: fallbackPlatform,
      currency,
      assetSymbol: symbol,
      brokerSymbol: symbol,
      assetName: assetName || symbol,
      assetType: assetType ?? 'STOCK',
      qty: qtyValue,
      price: priceValue ?? undefined,
      note: cells.description || undefined,
      sourceAdapterId: 'interactive_brokers_open_position_summary',
      sourceSection,
      sourceSignature,
      sourceRowRef: [
        'interactive_brokers_open_position_summary',
        rowIndex,
        date,
        symbol,
        normalizeNumberFingerprintPart(qtyValue),
        currency,
      ].join(':'),
      sourceRowNumber: rowIndex,
    });
  }

  return { records, errors };
};

export const parseRecognizedInvestmentCsv = (
  csvText: string,
  options?: ParseNormalizedTransactionsOptions & ParseNormalizedPositionSnapshotsOptions & {
    fileName?: string;
  },
): RecognizedCsvParseResult => {
  const detection = detectCsvSourceProfile(csvText, options?.fileName);
  const defaultPlatform = options?.defaultPlatform ?? detection.platformName ?? undefined;
  const rawRows = parseCsv(csvText);
  const rawHeaders = rawRows[0] ?? [];
  const flatSourceSignature = buildCsvHeaderSignature(rawHeaders);
  const unsupportedSections =
    detection.sourceProfile === 'interactive_brokers'
      ? extractInteractiveBrokersOpenPositionSummary(csvText).unsupportedSections
      : [];

  if (detection.sourceProfile === 'interactive_brokers') {
    const result = parseInteractiveBrokersOpenPositionSummaryCsv(csvText, {
      defaultCurrency: options?.defaultCurrency,
      defaultPlatform,
    });
    return {
      sourceProfile: detection.sourceProfile,
      platformName: detection.platformName,
      mode: 'monthly_positions',
      records: result.records,
      errors: result.errors,
      unsupportedSections,
      sourceAdapterId: 'interactive_brokers_open_position_summary',
      sourceSection: 'Open Position Summary',
      sourceSignature: result.records[0]?.sourceSignature ?? undefined,
      warnings: unsupportedSections.length
        ? [`Sections IBKR ignorées: ${unsupportedSections.join(', ')}.`]
        : [],
    };
  }

  if (detection.sourceProfile === 'trading212' || detection.sourceProfile === 'revolut_stock') {
    const result = parseNormalizedTransactionsCsv(csvText, {
      defaultCurrency: options?.defaultCurrency,
      defaultPlatform,
      columnMapping: options?.columnMapping,
    });
    const sourceAdapterId =
      detection.sourceProfile === 'trading212'
        ? 'trading212_transactions'
        : 'revolut_stock_transactions';
    const sourceSection = 'Transactions';
    const records =
      detection.sourceProfile === 'trading212'
        ? annotateRecognizedTransactionRows(result.records, {
            sourceAdapterId,
            sourceSection,
            sourceSignature: flatSourceSignature,
            rawRows,
            buildSourceRowRef: buildTrading212SourceRowRef,
          })
        : annotateRecognizedTransactionRows(result.records, {
            sourceAdapterId,
            sourceSection,
            sourceSignature: flatSourceSignature,
            rawRows,
            buildSourceRowRef: buildRevolutSourceRowRef,
          });

    return {
      sourceProfile: detection.sourceProfile,
      platformName: detection.platformName,
      mode: 'transactions',
      records,
      errors: result.errors,
      unsupportedSections,
      sourceAdapterId,
      sourceSection,
      sourceSignature: flatSourceSignature,
      warnings: [],
    };
  }

  const transactionResult = parseNormalizedTransactionsCsv(csvText, {
    defaultCurrency: options?.defaultCurrency,
    defaultPlatform,
    columnMapping: options?.columnMapping,
  });
  const snapshotResult = parseNormalizedPositionSnapshotsCsv(csvText, {
    defaultCurrency: options?.defaultCurrency,
    defaultPlatform,
    columnMapping: options?.columnMapping,
  });

  const preferredResult =
    transactionResult.records.length >= snapshotResult.records.length
      ? {
          mode: 'transactions' as const,
          records: transactionResult.records,
          errors: transactionResult.errors,
        }
      : {
          mode: 'monthly_positions' as const,
          records: snapshotResult.records,
          errors: snapshotResult.errors,
        };

  return {
    sourceProfile: detection.sourceProfile,
    platformName: detection.platformName,
    mode: preferredResult.mode,
    records: preferredResult.records,
    errors: preferredResult.errors,
    unsupportedSections,
    sourceSignature: flatSourceSignature || undefined,
    warnings: detection.sourceProfile === 'unknown' ? detection.reasons : [],
  };
};

export const parseNormalizedTransactionsCsv = (
  csvText: string,
  options?: ParseNormalizedTransactionsOptions,
): CsvParseResult<NormalizedTransactionRow> => {
  const rows = parseCsv(csvText);
  const errors: CsvParseError[] = [];
  if (rows.length === 0) {
    return { records: [], errors: [{ row: 0, message: 'Le fichier est vide.' }] };
  }
  const fallbackCurrency = options?.defaultCurrency ?? DEFAULT_CURRENCY;
  const fallbackPlatform = normalizePlatform(options?.defaultPlatform);

  const rawHeaders = rows[0];
  const normalizedHeaders = rawHeaders.map((header) => normalizeHeader(header));
  const inferredCanonicalHeaders = normalizedHeaders.map(
    (header) => inferHeaderAlias(header) ?? header,
  );
  const automaticMapping = buildAutomaticColumnMapping(
    csvText,
    inferredCanonicalHeaders,
    REQUIRED_HEADERS,
  );
  const canonicalHeaders = applyColumnMappingOverrides(
    rawHeaders,
    inferredCanonicalHeaders,
    {
      ...automaticMapping,
      ...options?.columnMapping,
    },
  );
  const hasPlatformColumn = canonicalHeaders.includes('platform');

  const missingHeaders = REQUIRED_HEADERS.filter(
    (header) => !canonicalHeaders.includes(header),
  );

  if (missingHeaders.length > 0) {
    return {
      records: [],
      errors: [
        {
          row: 0,
          message: `Colonnes manquantes: ${missingHeaders.join(', ')}`,
        },
      ],
    };
  }

  if (!hasPlatformColumn && !fallbackPlatform) {
    return {
      records: [],
      errors: [
        {
          row: 0,
          message: 'Colonne platform absente. Sélectionnez un broker par défaut dans le menu déroulant.',
        },
      ],
    };
  }

  const records: NormalizedTransactionRow[] = [];

  for (let i = 1; i < rows.length; i++) {
    const rawRow = rows[i];
    if (isRowEmpty(rawRow)) continue;

    const rowIndex = i + 1; // account for 1-based display including header row
    const cells = buildRowCells(canonicalHeaders, rawHeaders, rawRow);

    const rowErrors: string[] = [];
    const normalizedKindToken = normalizeHeader(cells.kind) as string;

    if (IGNORED_TRANSACTION_KIND_TOKENS.has(normalizedKindToken)) {
      continue;
    }

    const platform = normalizePlatform(cells.platform) ?? fallbackPlatform;
    if (!platform) {
      rowErrors.push('Broker introuvable: ajoutez la colonne platform ou sélectionnez un broker par défaut.');
    }

    const providedCurrency = cells.currency ? normalizeCurrency(cells.currency) : null;
    if (cells.currency && !providedCurrency) {
      rowErrors.push(`Devise invalide: "${cells.currency}". Utilisez un code ISO (EUR, USD...).`);
    }

    const inferredCurrency =
      providedCurrency ?? inferCurrencyFromSymbol(cells.asset_symbol ?? cells.broker_symbol);
    const normalizedPrice = normalizeQuotedPrice(
      parseFloatSafe(cells.price),
      inferredCurrency ?? fallbackCurrency,
    );
    const currency = normalizedPrice.currency ?? fallbackCurrency;
    if (!currency) {
      rowErrors.push('Impossible de déterminer la devise de la ligne.');
    }

    const providedCashCurrency = cells.cash_currency
      ? normalizeCurrency(cells.cash_currency)
      : null;
    if (cells.cash_currency && !providedCashCurrency) {
      rowErrors.push(`Devise de règlement invalide: "${cells.cash_currency}".`);
    }
    const cashCurrency = providedCashCurrency ?? currency;

    const kind = normalizeKind(cells.kind);
    if (!kind) {
      rowErrors.push(
        `Type de transaction invalide "${cells.kind}". Valeurs acceptées: ${TRANSACTION_KINDS.join(', ')}`,
      );
    }

    const dateValue = cells.date;
    const date = dateValue ? parseDate(dateValue) : null;
    if (date === null) {
      rowErrors.push('La colonne date doit contenir une date valide (ISO ou timestamp).');
    }

    const qtyValue = parseFloatSafe(cells.qty);
    const priceValue = normalizedPrice.price;
    const feeValue = parseFloatSafe(cells.fee ?? undefined);

    if (feeValue === null && cells.fee && cells.fee.trim() !== '') {
      rowErrors.push(`Frais invalides: "${cells.fee}".`);
    }

    const note = normalizeNote(cells.note);
    const assetIsin = normalizeIsin(cells.isin);
    const explicitBrokerSymbol = normalizeBrokerSymbol(cells.broker_symbol);
    const assetSymbol = normalizeAssetSymbol(cells.asset_symbol);
    const brokerSymbol = explicitBrokerSymbol ?? assetSymbol;
    const exchange = normalizeExchange(cells.exchange);
    const assetName = normalizeAssetName(cells.asset_name);
    let assetType: AssetType | undefined;
    const normalizedAssetType = normalizeAssetType(cells.asset_type);
    if (normalizedAssetType === null) {
      rowErrors.push(
        `asset_type invalide "${cells.asset_type}". Valeurs acceptées: ${ASSET_TYPES.join(', ')}`,
      );
    } else if (normalizedAssetType) {
      assetType = normalizedAssetType;
    }

    const requiresAsset =
      kind === 'BUY' ||
      kind === 'SELL' ||
      kind === 'DIVIDEND' ||
      kind === 'TRANSFER_IN' ||
      kind === 'TRANSFER_OUT' ||
      kind === 'STAKING_REWARD' ||
      kind === 'AIRDROP';
    const requiresQuantity =
      kind === 'BUY' ||
      kind === 'SELL' ||
      kind === 'TRANSFER_IN' ||
      kind === 'TRANSFER_OUT' ||
      kind === 'STAKING_REWARD' ||
      kind === 'AIRDROP';
    const requiresPrice = kind === 'BUY' || kind === 'SELL';

    if (requiresAsset) {
      if (!pickDisplayAssetSymbol(assetSymbol, brokerSymbol, assetIsin)) {
        rowErrors.push(`asset_symbol, broker_symbol ou isin est requis pour ${kind}.`);
      }
      if (requiresQuantity && (qtyValue === null || qtyValue <= 0)) {
        rowErrors.push(`qty doit être positif pour ${kind}.`);
      }
      if (requiresPrice && (priceValue === null || priceValue < 0)) {
        rowErrors.push(`price doit être fourni pour ${kind}.`);
      }
      if (!assetType) {
        assetType = DEFAULT_ASSET_TYPE;
      }
    }

    if (rowErrors.length > 0) {
      errors.push({ row: rowIndex, message: rowErrors.join(' ') });
      continue;
    }

    records.push({
      date: date!,
      platform: platform!,
      kind: kind!,
      currency: currency!,
      cashCurrency,
      assetSymbol: pickDisplayAssetSymbol(assetSymbol, brokerSymbol, assetIsin),
      assetIsin,
      brokerSymbol,
      exchange,
      assetName: assetName || pickDisplayAssetSymbol(assetSymbol, brokerSymbol, assetIsin),
      assetType,
      qty: qtyValue ?? undefined,
      price: priceValue ?? undefined,
      fee: feeValue ?? undefined,
      note,
      sourceRowNumber: rowIndex,
    });
  }

  return { records, errors };
};

export const parseNormalizedPositionSnapshotsCsv = (
  csvText: string,
  options?: ParseNormalizedPositionSnapshotsOptions,
): CsvParseResult<NormalizedPositionSnapshotRow> => {
  const rows = parseCsv(csvText);
  const errors: CsvParseError[] = [];
  if (rows.length === 0) {
    return { records: [], errors: [{ row: 0, message: 'Le fichier est vide.' }] };
  }

  const fallbackCurrency = options?.defaultCurrency ?? DEFAULT_CURRENCY;
  const fallbackPlatform = normalizePlatform(options?.defaultPlatform);

  const rawHeaders = rows[0];
  const normalizedHeaders = rawHeaders.map((header) => normalizeHeader(header));
  const inferredCanonicalHeaders = normalizedHeaders.map(
    (header) => inferHeaderAlias(header) ?? header,
  );
  const snapshotIdentifierHeadersPresent =
    inferredCanonicalHeaders.includes('asset_symbol') ||
    inferredCanonicalHeaders.includes('broker_symbol') ||
    inferredCanonicalHeaders.includes('isin');
  const automaticMapping = buildAutomaticColumnMapping(
    csvText,
    inferredCanonicalHeaders,
    snapshotIdentifierHeadersPresent
      ? POSITION_SNAPSHOT_REQUIRED_HEADERS.filter((header) => header !== 'asset_symbol')
      : POSITION_SNAPSHOT_REQUIRED_HEADERS,
  );
  const canonicalHeaders = applyColumnMappingOverrides(
    rawHeaders,
    inferredCanonicalHeaders,
    {
      ...automaticMapping,
      ...options?.columnMapping,
    },
  );
  const hasPlatformColumn = canonicalHeaders.includes('platform');

  const missingHeaders = POSITION_SNAPSHOT_REQUIRED_HEADERS.filter((header) => {
    if (header !== 'asset_symbol') {
      return !canonicalHeaders.includes(header);
    }
    return !(
      canonicalHeaders.includes('asset_symbol') ||
      canonicalHeaders.includes('broker_symbol') ||
      canonicalHeaders.includes('isin')
    );
  });

  if (missingHeaders.length > 0) {
    return {
      records: [],
      errors: [
        {
          row: 0,
          message: `Colonnes manquantes: ${missingHeaders.join(', ')}`,
        },
      ],
    };
  }

  if (!hasPlatformColumn && !fallbackPlatform) {
    return {
      records: [],
      errors: [
        {
          row: 0,
          message: 'Colonne platform absente. Selectionnez un broker par defaut dans le menu deroulant.',
        },
      ],
    };
  }

  const records: NormalizedPositionSnapshotRow[] = [];

  for (let i = 1; i < rows.length; i++) {
    const rawRow = rows[i];
    if (isRowEmpty(rawRow)) continue;

    const rowIndex = i + 1;
    const cells = buildRowCells(canonicalHeaders, rawHeaders, rawRow);
    const rowErrors: string[] = [];

    const platform = normalizePlatform(cells.platform) ?? fallbackPlatform;
    if (!platform) {
      rowErrors.push('Broker introuvable: ajoutez la colonne platform ou selectionnez un broker par defaut.');
    }

    const dateValue = cells.date;
    const date = dateValue ? parseDate(dateValue) : null;
    if (date === null) {
      rowErrors.push('La colonne date doit contenir une date valide (ISO ou timestamp).');
    }

    const assetIsin = normalizeIsin(cells.isin);
    const explicitBrokerSymbol = normalizeBrokerSymbol(cells.broker_symbol);
    const assetSymbol = normalizeAssetSymbol(cells.asset_symbol);
    const brokerSymbol = explicitBrokerSymbol ?? assetSymbol;
    const exchange = normalizeExchange(cells.exchange);
    const displayAssetSymbol = pickDisplayAssetSymbol(assetSymbol, brokerSymbol, assetIsin);
    if (!displayAssetSymbol) {
      rowErrors.push('asset_symbol, broker_symbol ou isin est requis pour un snapshot de position.');
    }

    const qtyValue = parseFloatSafe(cells.qty);
    if (qtyValue === null || qtyValue < 0) {
      rowErrors.push('qty doit etre positif ou nul pour un snapshot de position.');
    }

    const providedCurrency = cells.currency ? normalizeCurrency(cells.currency) : null;
    if (cells.currency && !providedCurrency) {
      rowErrors.push(`Devise invalide: "${cells.currency}". Utilisez un code ISO (EUR, USD...).`);
    }
    const normalizedPrice = normalizeQuotedPrice(
      parseFloatSafe(cells.price),
      providedCurrency ?? fallbackCurrency,
    );
    const priceValue = normalizedPrice.price;
    if (priceValue === null && cells.price && cells.price.trim() !== '') {
      rowErrors.push(`price invalide: "${cells.price}".`);
    }
    if (priceValue !== null && priceValue < 0) {
      rowErrors.push('price doit etre positif ou nul pour un snapshot de position.');
    }
    const inferredCurrency =
      normalizedPrice.currency ??
      providedCurrency ??
      inferCurrencyFromSymbol(assetSymbol ?? brokerSymbol);
    const currency = inferredCurrency ?? fallbackCurrency;
    if (!currency) {
      rowErrors.push('Impossible de determiner la devise de la ligne.');
    }

    const assetName = normalizeAssetName(cells.asset_name);
    let assetType: AssetType | undefined;
    const normalizedAssetType = normalizeAssetType(cells.asset_type);
    if (normalizedAssetType === null) {
      rowErrors.push(
        `asset_type invalide "${cells.asset_type}". Valeurs acceptees: ${ASSET_TYPES.join(', ')}`,
      );
    } else if (normalizedAssetType) {
      assetType = normalizedAssetType;
    }

    const note = normalizeNote(cells.note);

    if (rowErrors.length > 0) {
      errors.push({ row: rowIndex, message: rowErrors.join(' ') });
      continue;
    }

    records.push({
      date: date!,
      platform: platform!,
      currency: currency!,
      assetSymbol: displayAssetSymbol!,
      assetIsin,
      brokerSymbol,
      exchange,
      assetName: assetName || displayAssetSymbol!,
      assetType,
      qty: qtyValue!,
      price: priceValue ?? undefined,
      note,
      sourceRowNumber: rowIndex,
    });
  }

  return { records, errors };
};
