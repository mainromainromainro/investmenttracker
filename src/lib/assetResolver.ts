import { Asset, AssetIdentityStrategy, AssetResolutionStatus } from '../types';
import {
  deriveAssetIdentity,
  getAssetCanonicalKey,
  normalizeBrokerSymbol,
  normalizeIdentityCurrency,
  normalizeIsin,
} from './assetIdentity';

export interface AssetResolutionInput {
  assetName?: string;
  assetSymbol?: string;
  brokerSymbol?: string;
  exchange?: string;
  assetIsin?: string;
  assetType?: Asset['type'];
  currency: string;
  platform?: string;
}

export interface AssetResolutionResult {
  status: AssetResolutionStatus;
  identityStrategy: AssetIdentityStrategy;
  canonicalAssetKey?: string;
  resolutionReason: string;
  normalizedIsin?: string;
  normalizedBrokerSymbol?: string;
  normalizedExchange?: string;
  asset?: Asset;
  assetUpdates?: Partial<Asset>;
  createAsset?: Asset;
}

const matchesLooseLegacyIdentity = (asset: Asset, input: AssetResolutionInput) => {
  const inputSymbol = normalizeBrokerSymbol(input.brokerSymbol ?? input.assetSymbol);
  const inputCurrency = normalizeIdentityCurrency(input.currency);
  if (!inputSymbol || !inputCurrency) {
    return false;
  }

  const assetSymbol = normalizeBrokerSymbol(asset.brokerSymbol ?? asset.symbol);
  const assetCurrency = normalizeIdentityCurrency(asset.currency);
  return assetSymbol === inputSymbol && assetCurrency === inputCurrency;
};

export const resolveImportedAsset = (args: {
  existingAssets: Asset[];
  input: AssetResolutionInput;
  createId: (prefix: string) => string;
  timestamp: number;
  allowLegacyLooseMatch?: boolean;
}): AssetResolutionResult => {
  const derivedIdentity = deriveAssetIdentity({
    isin: args.input.assetIsin,
    brokerSymbol: args.input.brokerSymbol ?? args.input.assetSymbol,
    exchange: args.input.exchange,
    fallbackExchange: args.input.platform,
    currency: args.input.currency,
    symbol: args.input.assetSymbol,
    type: args.input.assetType ?? 'STOCK',
  });
  const normalizedIsin = normalizeIsin(args.input.assetIsin);
  const normalizedBrokerSymbol = normalizeBrokerSymbol(
    args.input.brokerSymbol ?? args.input.assetSymbol,
  );

  const exactIsinMatches = normalizedIsin
    ? args.existingAssets.filter((asset) => normalizeIsin(asset.isin) === normalizedIsin)
    : [];
  if (exactIsinMatches.length > 1) {
    return {
      status: 'AMBIGUOUS',
      identityStrategy: 'ISIN',
      canonicalAssetKey: derivedIdentity.canonicalAssetKey,
      resolutionReason: `Multiple assets already share ISIN ${normalizedIsin}.`,
      normalizedIsin,
      normalizedBrokerSymbol,
    };
  }

  if (exactIsinMatches.length === 1) {
    const asset = exactIsinMatches[0]!;
    return {
      status: 'RESOLVED',
      identityStrategy: 'ISIN',
      canonicalAssetKey: getAssetCanonicalKey(asset),
      resolutionReason: 'Matched existing asset by ISIN.',
      normalizedIsin,
      normalizedBrokerSymbol,
      normalizedExchange: derivedIdentity.exchange,
      asset,
      assetUpdates: {
        canonicalAssetKey: derivedIdentity.canonicalAssetKey,
        identityStrategy: 'ISIN',
        identityStatus: 'RESOLVED',
        isin: normalizedIsin,
        brokerSymbol: derivedIdentity.brokerSymbol,
        exchange: derivedIdentity.exchange,
      },
    };
  }

  if (
    args.allowLegacyLooseMatch === false &&
    derivedIdentity.identityStrategy === 'LEGACY_UNVERIFIED'
  ) {
    return {
      status: 'UNRESOLVED',
      identityStrategy: 'LEGACY_UNVERIFIED',
      canonicalAssetKey: derivedIdentity.canonicalAssetKey,
      resolutionReason: derivedIdentity.resolutionReason,
      normalizedIsin,
      normalizedBrokerSymbol,
      normalizedExchange: derivedIdentity.exchange,
    };
  }

  const exactCanonicalMatches = args.existingAssets.filter(
    (asset) => getAssetCanonicalKey(asset) === derivedIdentity.canonicalAssetKey,
  );
  if (exactCanonicalMatches.length > 1) {
    return {
      status: 'AMBIGUOUS',
      identityStrategy: derivedIdentity.identityStrategy,
      canonicalAssetKey: derivedIdentity.canonicalAssetKey,
      resolutionReason: `Multiple assets already share canonical key ${derivedIdentity.canonicalAssetKey}.`,
      normalizedIsin,
      normalizedBrokerSymbol,
      normalizedExchange: derivedIdentity.exchange,
    };
  }

  if (exactCanonicalMatches.length === 1) {
    const asset = exactCanonicalMatches[0]!;
    return {
      status: 'RESOLVED',
      identityStrategy: derivedIdentity.identityStrategy,
      canonicalAssetKey: derivedIdentity.canonicalAssetKey,
      resolutionReason: derivedIdentity.resolutionReason,
      normalizedIsin,
      normalizedBrokerSymbol,
      normalizedExchange: derivedIdentity.exchange,
      asset,
      assetUpdates: {
        canonicalAssetKey: derivedIdentity.canonicalAssetKey,
        identityStrategy: derivedIdentity.identityStrategy,
        identityStatus: 'RESOLVED',
        isin: normalizedIsin ?? asset.isin,
        brokerSymbol: derivedIdentity.brokerSymbol ?? asset.brokerSymbol,
        exchange: derivedIdentity.exchange ?? asset.exchange,
      },
    };
  }

  const looseLegacyMatches = args.allowLegacyLooseMatch === false
    ? []
    : args.existingAssets.filter((asset) => matchesLooseLegacyIdentity(asset, args.input));
  if (looseLegacyMatches.length > 1) {
    return {
      status: 'AMBIGUOUS',
      identityStrategy: derivedIdentity.identityStrategy,
      canonicalAssetKey: derivedIdentity.canonicalAssetKey,
      resolutionReason:
        'Multiple legacy assets match this broker symbol and currency. Import requires manual disambiguation.',
      normalizedIsin,
      normalizedBrokerSymbol,
      normalizedExchange: derivedIdentity.exchange,
    };
  }

  if (looseLegacyMatches.length === 1) {
    const asset = looseLegacyMatches[0]!;
    return {
      status: 'RESOLVED',
      identityStrategy:
        derivedIdentity.identityStrategy === 'LEGACY_UNVERIFIED'
          ? 'LEGACY_UNVERIFIED'
          : derivedIdentity.identityStrategy,
      canonicalAssetKey:
        derivedIdentity.identityStrategy === 'LEGACY_UNVERIFIED'
          ? getAssetCanonicalKey(asset)
          : derivedIdentity.canonicalAssetKey,
      resolutionReason:
        derivedIdentity.identityStrategy === 'LEGACY_UNVERIFIED'
          ? 'Matched an existing legacy asset by broker symbol and currency.'
          : 'Promoted an existing legacy asset to a stronger canonical identity.',
      normalizedIsin,
      normalizedBrokerSymbol,
      normalizedExchange: derivedIdentity.exchange,
      asset,
      assetUpdates:
        derivedIdentity.identityStrategy === 'LEGACY_UNVERIFIED'
          ? undefined
          : {
              canonicalAssetKey: derivedIdentity.canonicalAssetKey,
              identityStrategy: derivedIdentity.identityStrategy,
              identityStatus: 'RESOLVED',
              isin: normalizedIsin ?? asset.isin,
              brokerSymbol: derivedIdentity.brokerSymbol ?? asset.brokerSymbol ?? asset.symbol,
              exchange: derivedIdentity.exchange ?? asset.exchange,
            },
    };
  }

  if (derivedIdentity.identityStrategy === 'LEGACY_UNVERIFIED') {
    return {
      status: 'UNRESOLVED',
      identityStrategy: 'LEGACY_UNVERIFIED',
      canonicalAssetKey: derivedIdentity.canonicalAssetKey,
      resolutionReason: derivedIdentity.resolutionReason,
      normalizedIsin,
      normalizedBrokerSymbol,
      normalizedExchange: derivedIdentity.exchange,
    };
  }

  return {
    status: 'RESOLVED',
    identityStrategy: derivedIdentity.identityStrategy,
    canonicalAssetKey: derivedIdentity.canonicalAssetKey,
    resolutionReason: derivedIdentity.resolutionReason,
    normalizedIsin,
    normalizedBrokerSymbol,
    normalizedExchange: derivedIdentity.exchange,
    createAsset: {
      id: args.createId('asset'),
      type: args.input.assetType ?? 'STOCK',
      symbol:
        normalizeBrokerSymbol(args.input.assetSymbol) ??
        normalizedBrokerSymbol ??
        normalizedIsin ??
        'UNKNOWN',
      name:
        args.input.assetName?.trim() ||
        args.input.assetSymbol ||
        normalizedBrokerSymbol ||
        normalizedIsin ||
        'Unresolved asset',
      currency: normalizeIdentityCurrency(args.input.currency) ?? 'EUR',
      canonicalAssetKey: derivedIdentity.canonicalAssetKey,
      identityStrategy: derivedIdentity.identityStrategy,
      identityStatus: 'RESOLVED',
      isin: normalizedIsin,
      brokerSymbol: derivedIdentity.brokerSymbol,
      exchange: derivedIdentity.exchange,
      createdAt: args.timestamp,
    },
  };
};
