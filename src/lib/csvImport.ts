import { AssetType, TransactionKind } from '../types';

export type CsvHeader =
  | 'date'
  | 'platform'
  | 'asset_symbol'
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
  assetName?: string;
  assetType?: AssetType;
  qty?: number;
  price?: number;
  fee?: number;
  note?: string;
}

export interface CsvParseResult {
  records: NormalizedTransactionRow[];
  errors: CsvParseError[];
}

const TRANSACTION_KINDS: TransactionKind[] = [
  'BUY',
  'SELL',
  'DEPOSIT',
  'WITHDRAW',
  'FEE',
];

const ASSET_TYPES: AssetType[] = ['ETF', 'STOCK', 'CRYPTO'];

const REQUIRED_HEADERS: CsvHeader[] = ['date', 'platform', 'kind'];
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
];

const HEADER_ALIASES: Record<string, CsvHeader> = {
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
  courtier: 'platform',
  ticker: 'asset_symbol',
  ticker_symbol: 'asset_symbol',
  symbol: 'asset_symbol',
  instrument: 'asset_symbol',
  instrument_code: 'asset_symbol',
  instrument_symbol: 'asset_symbol',
  security_symbol: 'asset_symbol',
  security_code: 'asset_symbol',
  product_code: 'asset_symbol',
  isin: 'asset_symbol',
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
  qty: 'qty',
  volume: 'qty',
  filled_quantity: 'qty',
  executed_quantity: 'qty',
  quantite: 'qty',
  nombre: 'qty',
  amount: 'qty',
  unit_price: 'price',
  price_per_share: 'price',
  execution_price: 'price',
  average_price: 'price',
  avg_price: 'price',
  prix: 'price',
  cours: 'price',
  fees: 'fee',
  fee_amount: 'fee',
  commission: 'fee',
  commissions: 'fee',
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
  { header: 'asset_symbol', pattern: /(?:^|_)(?:ticker|symbol|isin|instrument|security|product_code)(?:_|$)/ },
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
  achat: 'BUY',
  acquired: 'BUY',
  bought: 'BUY',
  b: 'BUY',
  sell: 'SELL',
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
};

const ASSET_TYPE_ALIASES: Record<string, AssetType> = {
  etf: 'ETF',
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
  (header ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');

const inferHeaderAlias = (header: string | undefined): CsvHeader | null => {
  const normalized = normalizeHeader(header) as string;
  const direct = HEADER_ALIASES[normalized];
  if (direct) return direct;

  const compact = normalized.replace(/[^a-z0-9_]/g, '');
  for (const rule of HEADER_GUESS_RULES) {
    if (rule.pattern.test(normalized) || rule.pattern.test(compact)) {
      return rule.header;
    }
  }
  return null;
};

const isRowEmpty = (row: string[]): boolean =>
  row.every((value) => (value ?? '').trim() === '');

const detectDelimiter = (text: string): ',' | ';' => {
  const firstLine = text.split(/\r?\n/)[0] ?? '';
  const commaCount = (firstLine.match(/,/g) ?? []).length;
  const semicolonCount = (firstLine.match(/;/g) ?? []).length;
  if (semicolonCount > commaCount) {
    return ';';
  }
  return ',';
};

const parseCsv = (text: string): string[][] => {
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (char === '"') {
      if (inQuotes && text[i + 1] === '"') {
        currentField += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === delimiter && !inQuotes) {
      currentRow.push(currentField);
      currentField = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && text[i + 1] === '\n') {
        i++;
      }
      currentRow.push(currentField);
      currentField = '';
      if (!isRowEmpty(currentRow)) {
        rows.push(currentRow);
      }
      currentRow = [];
      continue;
    }

    currentField += char;
  }

  currentRow.push(currentField);
  if (!isRowEmpty(currentRow)) {
    rows.push(currentRow);
  }

  return rows;
};

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

  const dmyMatch = trimmed.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (dmyMatch) {
    const day = Number(dmyMatch[1]);
    const month = Number(dmyMatch[2]);
    const yearPart = Number(dmyMatch[3]);
    const year = yearPart < 100 ? 2000 + yearPart : yearPart;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return Date.UTC(year, month - 1, day);
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

export const parseNormalizedTransactionsCsv = (
  csvText: string,
  options?: { defaultCurrency?: string },
): CsvParseResult => {
  const rows = parseCsv(csvText);
  const errors: CsvParseError[] = [];
  if (rows.length === 0) {
    return { records: [], errors: [{ row: 0, message: 'Le fichier est vide.' }] };
  }
  const fallbackCurrency = options?.defaultCurrency ?? DEFAULT_CURRENCY;

  const rawHeaders = rows[0];
  const normalizedHeaders = rawHeaders.map((header) => normalizeHeader(header));
  const canonicalHeaders = normalizedHeaders.map((header) => inferHeaderAlias(header) ?? header);

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

  const records: NormalizedTransactionRow[] = [];

  for (let i = 1; i < rows.length; i++) {
    const rawRow = rows[i];
    if (isRowEmpty(rawRow)) continue;

    const rowIndex = i + 1; // account for 1-based display including header row
    const cells: Record<string, string> = {};

    canonicalHeaders.forEach((header, index) => {
      if (!header) {
        return;
      }
      if (!(header in cells) || cells[header] === '') {
        cells[header] = rawRow[index] ?? '';
      }
    });

    const rowErrors: string[] = [];

    const platform = normalizePlatform(cells.platform);
    if (!platform) {
      rowErrors.push('La colonne platform est obligatoire.');
    }

    const providedCurrency = cells.currency ? normalizeCurrency(cells.currency) : null;
    if (cells.currency && !providedCurrency) {
      rowErrors.push(`Devise invalide: "${cells.currency}". Utilisez un code ISO (EUR, USD...).`);
    }

    const inferredCurrency = providedCurrency ?? inferCurrencyFromSymbol(cells.asset_symbol);
    const currency = inferredCurrency ?? fallbackCurrency;
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
    const priceValue = parseFloatSafe(cells.price);
    const feeValue = parseFloatSafe(cells.fee ?? undefined);

    if (feeValue === null && cells.fee && cells.fee.trim() !== '') {
      rowErrors.push(`Frais invalides: "${cells.fee}".`);
    }

    const note = normalizeNote(cells.note);
    const assetSymbol = normalizeAssetSymbol(cells.asset_symbol);
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

    const requiresAsset = kind === 'BUY' || kind === 'SELL';

    if (requiresAsset) {
      if (!assetSymbol) {
        rowErrors.push('asset_symbol est requis pour BUY / SELL.');
      }
      if (qtyValue === null || qtyValue <= 0) {
        rowErrors.push('qty doit être positif pour BUY / SELL.');
      }
      if (priceValue === null || priceValue < 0) {
        rowErrors.push('price doit être fourni pour BUY / SELL.');
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
      assetSymbol: assetSymbol,
      assetName: assetName || assetSymbol,
      assetType,
      qty: qtyValue ?? undefined,
      price: priceValue ?? undefined,
      fee: feeValue ?? undefined,
      note,
    });
  }

  return { records, errors };
};
