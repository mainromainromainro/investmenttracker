import { describe, expect, it } from 'vitest';
import { Asset } from '../types';
import { resolveImportedAsset } from './assetResolver';

const timestamp = Date.UTC(2026, 0, 1);

const createId = (prefix: string) => `${prefix}_test`;

describe('assetResolver', () => {
  it('resolves an existing asset by ISIN before broker symbol', () => {
    const existingAssets: Asset[] = [
      {
        id: 'asset_vusa',
        type: 'ETF',
        symbol: 'VUSA',
        name: 'Vanguard S&P 500',
        currency: 'EUR',
        canonicalAssetKey: 'isin:IE00B3XXRP09',
        identityStrategy: 'ISIN',
        identityStatus: 'RESOLVED',
        isin: 'IE00B3XXRP09',
        brokerSymbol: 'VUSA',
        exchange: 'XAMS',
        createdAt: timestamp,
      },
    ];

    const resolution = resolveImportedAsset({
      existingAssets,
      input: {
        assetName: 'Vanguard S&P 500',
        assetSymbol: 'VUSA',
        brokerSymbol: 'VUSA',
        exchange: 'XLON',
        assetIsin: ' ie00b3xxrp09 ',
        assetType: 'ETF',
        currency: 'EUR',
        platform: 'Trading 212',
      },
      createId,
      timestamp,
    });

    expect(resolution.status).toBe('RESOLVED');
    expect(resolution.asset?.id).toBe('asset_vusa');
    expect(resolution.identityStrategy).toBe('ISIN');
  });

  it('creates a new asset from broker symbol, exchange fallback, and currency when ISIN is absent', () => {
    const resolution = resolveImportedAsset({
      existingAssets: [],
      input: {
        assetName: 'Nike',
        assetSymbol: 'NKE',
        brokerSymbol: 'NKE',
        assetType: 'STOCK',
        currency: 'USD',
        platform: 'Revolut Stock',
      },
      createId,
      timestamp,
    });

    expect(resolution.status).toBe('RESOLVED');
    expect(resolution.createAsset?.canonicalAssetKey).toBe(
      'broker:NKE|REVOLUT_STOCK|USD',
    );
    expect(resolution.resolutionReason).toContain('source platform fallback exchange');
  });

  it('marks the row ambiguous when multiple legacy assets match the same symbol and currency', () => {
    const existingAssets: Asset[] = [
      {
        id: 'asset_1',
        type: 'STOCK',
        symbol: 'ABC',
        name: 'ABC one',
        currency: 'USD',
        canonicalAssetKey: 'legacy:ABC|USD|STOCK',
        identityStrategy: 'LEGACY_UNVERIFIED',
        identityStatus: 'UNRESOLVED',
        brokerSymbol: 'ABC',
        createdAt: timestamp,
      },
      {
        id: 'asset_2',
        type: 'STOCK',
        symbol: 'ABC',
        name: 'ABC two',
        currency: 'USD',
        canonicalAssetKey: 'legacy:ABC|USD|STOCK',
        identityStrategy: 'LEGACY_UNVERIFIED',
        identityStatus: 'UNRESOLVED',
        brokerSymbol: 'ABC',
        createdAt: timestamp,
      },
    ];

    const resolution = resolveImportedAsset({
      existingAssets,
      input: {
        assetSymbol: 'ABC',
        brokerSymbol: 'ABC',
        currency: 'USD',
        assetType: 'STOCK',
      },
      createId,
      timestamp,
    });

    expect(resolution.status).toBe('AMBIGUOUS');
  });

  it('does not auto-resolve through legacy loose matching when strict identity mode is enabled', () => {
    const existingAssets: Asset[] = [
      {
        id: 'asset_legacy',
        type: 'ETF',
        symbol: 'CW8',
        name: 'Amundi MSCI World',
        currency: 'EUR',
        canonicalAssetKey: 'legacy:CW8|EUR|ETF',
        identityStrategy: 'LEGACY_UNVERIFIED',
        identityStatus: 'UNRESOLVED',
        brokerSymbol: 'CW8',
        createdAt: timestamp,
      },
    ];

    const resolution = resolveImportedAsset({
      existingAssets,
      input: {
        assetName: 'Amundi MSCI World',
        assetSymbol: 'CW8',
        brokerSymbol: 'CW8',
        currency: 'EUR',
        assetType: 'ETF',
      },
      createId,
      timestamp,
      allowLegacyLooseMatch: false,
    });

    expect(resolution.status).toBe('UNRESOLVED');
    expect(resolution.identityStrategy).toBe('LEGACY_UNVERIFIED');
    expect(resolution.asset).toBeUndefined();
    expect(resolution.createAsset).toBeUndefined();
  });
});
