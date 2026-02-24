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
  broker: 'platform',
  broker_name: 'platform',
  platform_name: 'platform',
  ticker: 'asset_symbol',
  symbol: 'asset_symbol',
  isin: 'asset_symbol',
  shares: 'qty',
  quantity: 'qty',
  qty: 'qty',
  amount: 'qty',
  fees: 'fee',
  fee_amount: 'fee',
  commission: 'fee',
  commissions: 'fee',
  type: 'kind',
  trade_type: 'kind',
  transaction_type: 'kind',
  name: 'asset_name',
  asset: 'asset_name',
  assetclass: 'asset_type',
  asset_class: 'asset_type',
  currency_code: 'currency',
  price_currency: 'currency',
  cash_currency: 'cash_currency',
  settlement_currency: 'cash_currency',
};

const DEFAULT_CURRENCY = 'EUR';
const DEFAULT_ASSET_TYPE: AssetType = 'STOCK';

const normalizeHeader = (header: string): CsvHeader | string =>
  header.trim().toLowerCase().replace(/[\s-]+/g, '_');

const isRowEmpty = (row: string[]): boolean =>
  row.every((value) => value.trim() === '');

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
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/\s/g, '');
  const parsed = Number(normalized);
  return Number.isNaN(parsed) ? null : parsed;
};

const parseDate = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const timestamp = Number(trimmed);
  if (!Number.isNaN(timestamp) && trimmed.length >= 12) {
    return timestamp;
  }
  const parsed = Date.parse(trimmed);
  return Number.isNaN(parsed) ? null : parsed;
};

const normalizeCurrency = (value: string): string | null => {
  const trimmed = value.trim().toUpperCase();
  if (trimmed.length !== 3) return null;
  return trimmed;
};

const normalizePlatform = (value: string): string | null => {
  const trimmed = value.trim();
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
  const canonicalHeaders = normalizedHeaders.map(
    (header) => HEADER_ALIASES[header] ?? header,
  );

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

    const kindValue = cells.kind?.trim().toUpperCase();
    const kind = TRANSACTION_KINDS.find((value) => value === kindValue);
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
    const assetTypeValue = cells.asset_type?.trim().toUpperCase();
    let assetType: AssetType | undefined;
    if (assetTypeValue) {
      if (ASSET_TYPES.includes(assetTypeValue as AssetType)) {
        assetType = assetTypeValue as AssetType;
      } else {
        rowErrors.push(
          `asset_type invalide "${cells.asset_type}". Valeurs acceptées: ${ASSET_TYPES.join(', ')}`,
        );
      }
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
