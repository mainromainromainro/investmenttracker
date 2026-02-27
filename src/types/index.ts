/**
 * Core type definitions for Investment Tracker
 * All entities and computed types for portfolio tracking
 */

// ─────────────────────────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────────────────────────

export type AssetType = 'ETF' | 'STOCK' | 'CRYPTO';
export type TransactionKind = 'BUY' | 'SELL' | 'DEPOSIT' | 'WITHDRAW' | 'FEE';

// ─────────────────────────────────────────────────────────────────
// Core Entities (persisted in IndexedDB)
// ─────────────────────────────────────────────────────────────────

export interface Platform {
  id: string;
  name: string;
  createdAt: number;
}

export interface Asset {
  id: string;
  type: AssetType;
  symbol: string;
  name: string;
  currency: string; // e.g., 'USD', 'EUR', 'GBP'
  createdAt: number;
}

export interface Transaction {
  id: string;
  platformId: string;
  assetId?: string; // Required for BUY/SELL, optional for DEPOSIT/WITHDRAW/FEE
  kind: TransactionKind;
  date: number; // Timestamp (ms)
  qty?: number; // Required for BUY/SELL
  price?: number; // Required for BUY/SELL
  fee?: number;
  currency: string;
  note?: string;
  createdAt: number;
}

export interface PriceSnapshot {
  id: string;
  assetId: string;
  date: number; // Timestamp (ms)
  price: number;
  currency: string; // Price currency (asset's native currency)
  createdAt: number;
}

export interface FxSnapshot {
  id: string;
  pair: string; // e.g., 'USD/EUR'
  date: number; // Timestamp (ms)
  rate: number; // 1 unit of base → EUR (e.g., 1 USD = 0.92 EUR)
  createdAt: number;
}

// ─────────────────────────────────────────────────────────────────
// Computed Types (derived from core entities)
// ─────────────────────────────────────────────────────────────────

export interface Position {
  assetId: string;
  platformId: string;
  asset: Asset;
  platform: Platform;
  qty: number;
  latestPrice: number | null;
  latestPriceDate: number | null;
  currency: string;
  fxRate: number | null;
  valueEUR: number | null;
}

export interface TickerHolding {
  assetId: string;
  asset: Asset;
  qty: number;
  latestPrice: number | null;
  latestPriceDate: number | null;
  fxRate: number | null;
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
  byPlatform: Array<{
    platformId: string;
    name: string;
    valueEUR: number | null;
  }>;
  byType: Array<{
    type: AssetType;
    valueEUR: number | null;
  }>;
}
