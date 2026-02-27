import { Asset } from '../types';
import { getLiveDataApiKey } from './liveDataConfig';

interface TwelveDataQuoteResponse {
  status?: string;
  code?: number;
  message?: string;
  symbol?: string;
  currency?: string;
  close?: string;
  datetime?: string;
  timestamp?: number;
}

export interface LiveQuote {
  assetId: string;
  sourceSymbol: string;
  price: number;
  currency: string;
  date: number;
}

export interface LiveQuoteError {
  assetId: string;
  symbol: string;
  message: string;
}

export interface LiveQuoteFetchResult {
  quotes: LiveQuote[];
  errors: LiveQuoteError[];
}

export interface LiveFxFetchResult {
  rates: Record<string, number>;
  errors: Array<{ currency: string; message: string }>;
}

const parsePrice = (value: string | undefined): number | null => {
  if (!value) return null;
  const parsed = Number(value);
  if (Number.isNaN(parsed) || !Number.isFinite(parsed)) return null;
  return parsed;
};

const normalizeSymbol = (symbol: string): string => symbol.trim().toUpperCase();

const buildSymbolCandidates = (asset: Asset): string[] => {
  const symbol = normalizeSymbol(asset.symbol);
  if (asset.type === 'CRYPTO') {
    if (symbol.includes('/')) return [symbol];
    if (symbol.includes('-')) return [symbol.replace('-', '/'), symbol];
    if (asset.currency === 'EUR') return [`${symbol}/EUR`, `${symbol}/USD`, symbol];
    return [`${symbol}/USD`, `${symbol}/EUR`, symbol];
  }
  return [symbol];
};

const fetchQuoteForSymbol = async (
  symbol: string,
  apiKey: string,
): Promise<{ price: number; currency: string; date: number }> => {
  const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = (await response.json()) as TwelveDataQuoteResponse;
  if (payload.status === 'error' || payload.code) {
    throw new Error(payload.message ?? `Code ${payload.code ?? 'unknown'}`);
  }

  const price = parsePrice(payload.close);
  if (price === null) {
    throw new Error('No close price returned by provider.');
  }

  const currency = payload.currency?.trim().toUpperCase();
  if (!currency) {
    throw new Error('Missing quote currency.');
  }

  const date = payload.timestamp ? payload.timestamp * 1000 : Date.now();
  return { price, currency, date };
};

export const fetchLiveQuotes = async (assets: Asset[]): Promise<LiveQuoteFetchResult> => {
  const apiKey = getLiveDataApiKey();
  const quotes: LiveQuote[] = [];
  const errors: LiveQuoteError[] = [];

  for (const asset of assets) {
    const candidates = buildSymbolCandidates(asset);
    let success = false;
    let lastError = 'No live price available.';

    for (const candidate of candidates) {
      try {
        const quote = await fetchQuoteForSymbol(candidate, apiKey);
        quotes.push({
          assetId: asset.id,
          sourceSymbol: candidate,
          price: quote.price,
          currency: quote.currency,
          date: quote.date,
        });
        success = true;
        break;
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Unknown provider error.';
      }
    }

    if (!success) {
      errors.push({
        assetId: asset.id,
        symbol: asset.symbol,
        message: lastError,
      });
    }
  }

  return { quotes, errors };
};

export const fetchFxRatesToEur = async (currencies: string[]): Promise<LiveFxFetchResult> => {
  const uniqueCurrencies = Array.from(
    new Set(
      currencies
        .map((currency) => currency.trim().toUpperCase())
        .filter((currency) => currency && currency !== 'EUR'),
    ),
  );

  const rates: Record<string, number> = {};
  const errors: Array<{ currency: string; message: string }> = [];

  await Promise.all(
    uniqueCurrencies.map(async (currency) => {
      try {
        const response = await fetch(
          `https://api.frankfurter.app/latest?from=${encodeURIComponent(currency)}&to=EUR`,
        );
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const payload = (await response.json()) as { rates?: Record<string, number> };
        const rate = payload.rates?.EUR;
        if (typeof rate !== 'number') {
          throw new Error('No EUR conversion returned.');
        }
        rates[currency] = rate;
      } catch (error) {
        errors.push({
          currency,
          message: error instanceof Error ? error.message : 'Unknown FX provider error.',
        });
      }
    }),
  );

  return { rates, errors };
};

