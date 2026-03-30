/**
 * Core type definitions for Investment Tracker
 * All entities and computed types for portfolio tracking
 */

// ─────────────────────────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────────────────────────

export type AssetType = 'ETF' | 'STOCK' | 'CRYPTO';
export type AccountType = 'BROKERAGE' | 'RETIREMENT' | 'EXCHANGE' | 'WALLET' | 'OTHER';
export type TransactionKind =
  | 'BUY'
  | 'SELL'
  | 'DEPOSIT'
  | 'WITHDRAW'
  | 'FEE'
  | 'DIVIDEND'
  | 'TRANSFER_IN'
  | 'TRANSFER_OUT'
  | 'STAKING_REWARD'
  | 'AIRDROP';
export type TransactionSource =
  | 'MANUAL'
  | 'CSV_TRANSACTION'
  | 'POSITION_SNAPSHOT'
  | 'CSV_SNAPSHOT';
export type AssetIdentityStrategy =
  | 'ISIN'
  | 'BROKER_SYMBOL_EXCHANGE_CURRENCY'
  | 'LEGACY_UNVERIFIED';
export type AssetResolutionStatus = 'RESOLVED' | 'AMBIGUOUS' | 'UNRESOLVED';
export type ImportMode = 'transactions' | 'monthly_positions';
export type ImportSourceProfile =
  | 'broker_export'
  | 'crypto_exchange'
  | 'wallet_export'
  | 'monthly_statement'
  | 'custom';
export type ImportSourceAdapterId =
  | 'trading212_transactions'
  | 'revolut_stock_transactions'
  | 'interactive_brokers_open_position_summary';
export type ImportJobStatus = 'PENDING' | 'IMPORTED' | 'DUPLICATE' | 'FAILED';
export type ImportRowStatus =
  | 'READY'
  | 'IMPORTED'
  | 'DUPLICATE_IN_FILE'
  | 'SKIPPED_DUPLICATE_EXISTING'
  | 'SKIPPED_DUPLICATE_IMPORT'
  | 'MERGED_IN_FILE'
  | 'IMPLICIT_CLOSE'
  | 'AMBIGUOUS_ASSET'
  | 'UNRESOLVED_ASSET'
  | 'ERROR';

export interface ImportSourceAuditFields {
  sourceAdapterId?: ImportSourceAdapterId;
  sourceTemplateId?: string;
  sourceSection?: string;
  sourceSignature?: string;
  sourceRowRef?: string;
  sourceTicker?: string;
  sourceBrokerSymbol?: string;
  sourceExchange?: string;
  sourceIsin?: string;
  sourceName?: string;
  sourceCurrency?: string;
  resolutionStatus?: AssetResolutionStatus;
  resolutionReason?: string;
  matchStrategy?: AssetIdentityStrategy;
  sourceRaw?: Record<string, string>;
}

export interface ImportSourceContext extends ImportSourceAuditFields {
  sourceProfile?: ImportSourceProfile;
}

// ─────────────────────────────────────────────────────────────────
// Core Entities (persisted in IndexedDB)
// ─────────────────────────────────────────────────────────────────

export interface Platform {
  id: string;
  name: string;
  createdAt: number;
}

export interface Account {
  id: string;
  platformId: string;
  name: string;
  type: AccountType;
  createdAt: number;
}

export interface Asset {
  id: string;
  type: AssetType;
  symbol: string;
  name: string;
  currency: string; // e.g., 'USD', 'EUR', 'GBP'
  canonicalAssetKey?: string;
  identityStrategy?: AssetIdentityStrategy;
  identityStatus?: AssetResolutionStatus;
  isin?: string;
  brokerSymbol?: string;
  exchange?: string;
  createdAt: number;
}

export interface Transaction extends ImportSourceContext {
  id: string;
  platformId: string;
  accountId?: string;
  assetId?: string; // Required for BUY/SELL, optional for DEPOSIT/WITHDRAW/FEE
  kind: TransactionKind;
  date: number; // Timestamp (ms)
  qty?: number; // Required for BUY/SELL
  price?: number; // Required for BUY/SELL
  fee?: number;
  currency: string;
  note?: string;
  source?: TransactionSource;
  importJobId?: string;
  importRowId?: string;
  fingerprint?: string;
  externalRef?: string;
  createdAt: number;
}

export interface PositionSnapshot extends ImportSourceContext {
  id: string;
  platformId: string;
  accountId?: string;
  assetId: string;
  date: number; // Timestamp (ms)
  qty: number;
  price?: number;
  currency: string;
  note?: string;
  importJobId?: string;
  createdAt: number;
}

export interface PriceSnapshot extends ImportSourceContext {
  id: string;
  assetId: string;
  date: number; // Timestamp (ms)
  price: number;
  currency: string; // Price currency (asset's native currency)
  importJobId?: string;
  createdAt: number;
}

export interface FxSnapshot {
  id: string;
  pair: string; // e.g., 'USD/EUR'
  date: number; // Timestamp (ms)
  rate: number; // 1 unit of base → EUR (e.g., 1 USD = 0.92 EUR)
  createdAt: number;
}

export interface ImportJob extends ImportSourceAuditFields {
  id: string;
  mode: ImportMode;
  sourceProfile: ImportSourceProfile;
  status: ImportJobStatus;
  platformId?: string;
  accountId?: string;
  fileName: string;
  fileSize: number;
  fileLastModified: number;
  fileFingerprint: string;
  checksumVersion: string;
  rowCount: number;
  parsedRowCount: number;
  errorCount: number;
  duplicateRowCount: number;
  summary?: string;
  importedAt: number;
  createdAt: number;
}

export interface ImportRow extends ImportSourceContext {
  id: string;
  importJobId: string;
  rowNumber: number;
  fingerprint: string;
  canonicalFingerprint?: string;
  status: ImportRowStatus;
  date?: number;
  platformName?: string;
  accountName?: string;
  assetSymbol?: string;
  resolvedAssetId?: string;
  duplicateOfImportRowId?: string;
  kind?: TransactionKind;
  qty?: number;
  currency?: string;
  message?: string;
  createdAt: number;
}

// ─────────────────────────────────────────────────────────────────
// Computed Types (derived from core entities)
// ─────────────────────────────────────────────────────────────────

export interface Position {
  assetId: string;
  platformId: string;
  accountId?: string;
  asset: Asset;
  platform: Platform;
  account?: Account;
  qty: number;
  latestPrice: number | null;
  latestPriceDate: number | null;
  currency: string; // Valuation currency for the latest known price
  fxRate: number | null;
  costBasisEUR: number | null;
  averageCost: number | null;
  unrealizedPnlEUR: number | null;
  unrealizedPnlPct: number | null;
  dividendIncomeEUR: number;
  hasKnownCostBasis: boolean;
  valueEUR: number | null;
}

export interface TickerHolding {
  assetId: string;
  asset: Asset;
  qty: number;
  latestPrice: number | null;
  latestPriceDate: number | null;
  currency: string;
  fxRate: number | null;
  costBasisEUR: number | null;
  averageCost: number | null;
  unrealizedPnlEUR: number | null;
  unrealizedPnlPct: number | null;
  dividendIncomeEUR: number;
  hasKnownCostBasis: boolean;
  valueEUR: number | null;
}

export interface PortfolioHistoryPoint {
  date: number;
  totalValueEUR: number | null;
  knownValueEUR: number;
  hasMissingData: boolean;
}

export interface PortfolioSummary {
  positions: Position[];
  byTicker: TickerHolding[];
  history: PortfolioHistoryPoint[];
  totalValueEUR: number | null;
  totalCostBasisEUR: number | null;
  totalUnrealizedPnlEUR: number | null;
  totalUnrealizedPnlPct: number | null;
  totalDividendIncomeEUR: number;
  bestPerformer: TickerHolding | null;
  worstPerformer: TickerHolding | null;
  byAccount: Array<{
    accountId: string | null;
    platformId: string;
    name: string;
    valueEUR: number | null;
    costBasisEUR: number | null;
    unrealizedPnlEUR: number | null;
  }>;
  byPlatform: Array<{
    platformId: string;
    name: string;
    valueEUR: number | null;
  }>;
  byType: Array<{
    type: AssetType;
    valueEUR: number | null;
  }>;
  dataQuality: {
    missingPriceCount: number;
    missingFxCount: number;
    missingCostBasisCount: number;
  };
}
