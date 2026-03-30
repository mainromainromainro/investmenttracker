import { Asset, AssetIdentityStrategy, AssetResolutionStatus } from '../types';

const normalizeCompact = (value: string | undefined | null) => {
  const normalized = String(value ?? '').trim().toUpperCase().replace(/\s+/g, '');
  return normalized || undefined;
};

export const normalizeIsin = (value: string | undefined | null) => {
  const normalized = normalizeCompact(value);
  if (!normalized) return undefined;
  if (!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(normalized)) {
    return undefined;
  }
  return normalized;
};

export const normalizeBrokerSymbol = (value: string | undefined | null) =>
  normalizeCompact(value);

export const normalizeExchange = (value: string | undefined | null) => {
  const normalized = String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || undefined;
};

export const normalizeIdentityCurrency = (value: string | undefined | null) => {
  const normalized = String(value ?? '').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(normalized) ? normalized : undefined;
};

export const buildIsinAssetKey = (isin: string) => `isin:${isin}`;

export const buildBrokerAssetKey = (
  brokerSymbol: string,
  exchange: string,
  currency: string,
) => `broker:${brokerSymbol}|${exchange}|${currency}`;

export const buildLegacyAssetKey = (
  symbol: string,
  currency: string,
  type: Asset['type'],
) => `legacy:${symbol}|${currency}|${type}`;

export const deriveAssetIdentity = (input: {
  isin?: string;
  brokerSymbol?: string;
  exchange?: string;
  currency?: string;
  fallbackExchange?: string;
  symbol?: string;
  type?: Asset['type'];
}): {
  canonicalAssetKey: string;
  identityStrategy: AssetIdentityStrategy;
  identityStatus: AssetResolutionStatus;
  isin?: string;
  brokerSymbol?: string;
  exchange?: string;
  currency?: string;
  resolutionReason: string;
} => {
  const isin = normalizeIsin(input.isin);
  const brokerSymbol = normalizeBrokerSymbol(input.brokerSymbol ?? input.symbol);
  const explicitExchange = normalizeExchange(input.exchange);
  const fallbackExchange = normalizeExchange(input.fallbackExchange);
  const exchange = explicitExchange ?? fallbackExchange;
  const currency = normalizeIdentityCurrency(input.currency);

  if (isin) {
    return {
      canonicalAssetKey: buildIsinAssetKey(isin),
      identityStrategy: 'ISIN',
      identityStatus: 'RESOLVED',
      isin,
      brokerSymbol,
      exchange,
      currency,
      resolutionReason: 'Resolved using ISIN.',
    };
  }

  if (brokerSymbol && exchange && currency) {
    return {
      canonicalAssetKey: buildBrokerAssetKey(brokerSymbol, exchange, currency),
      identityStrategy: 'BROKER_SYMBOL_EXCHANGE_CURRENCY',
      identityStatus: 'RESOLVED',
      brokerSymbol,
      exchange,
      currency,
      resolutionReason: explicitExchange
        ? 'Resolved using broker symbol, exchange, and currency.'
        : 'Resolved using broker symbol, source platform fallback exchange, and currency.',
    };
  }

  const legacySymbol = normalizeBrokerSymbol(input.symbol ?? input.brokerSymbol);
  const legacyCurrency = normalizeIdentityCurrency(input.currency) ?? 'EUR';
  const legacyType = input.type ?? 'STOCK';

  return {
    canonicalAssetKey: buildLegacyAssetKey(
      legacySymbol ?? 'UNKNOWN',
      legacyCurrency,
      legacyType,
    ),
    identityStrategy: 'LEGACY_UNVERIFIED',
    identityStatus: 'UNRESOLVED',
    brokerSymbol,
    exchange,
    currency,
    resolutionReason:
      'Missing ISIN or complete broker symbol + exchange + currency identity. Stored as legacy/unverified.',
  };
};

export const getAssetCanonicalKey = (
  asset: Pick<
    Asset,
    | 'canonicalAssetKey'
    | 'isin'
    | 'brokerSymbol'
    | 'exchange'
    | 'currency'
    | 'symbol'
    | 'type'
  >,
) =>
  asset.canonicalAssetKey ??
  deriveAssetIdentity({
    isin: asset.isin,
    brokerSymbol: asset.brokerSymbol ?? asset.symbol,
    exchange: asset.exchange,
    currency: asset.currency,
    symbol: asset.symbol,
    type: asset.type,
  }).canonicalAssetKey;

export const buildManualAssetIdentity = (asset: {
  symbol: string;
  currency: string;
  type: Asset['type'];
  isin?: string;
  brokerSymbol?: string;
  exchange?: string;
}) =>
  deriveAssetIdentity({
    isin: asset.isin,
    brokerSymbol: asset.brokerSymbol ?? asset.symbol,
    exchange: asset.exchange,
    currency: asset.currency,
    symbol: asset.symbol,
    type: asset.type,
  });
