import { db } from '../db';
import { Asset } from '../types';
import { buildManualAssetIdentity } from '../lib/assetIdentity';

export const assetRepository = {
  async getAll() {
    return db.assets.toArray();
  },

  async getById(id: string) {
    return db.assets.get(id);
  },

  async create(asset: Omit<Asset, 'createdAt'>) {
    const identity = buildManualAssetIdentity({
      symbol: asset.symbol,
      currency: asset.currency,
      type: asset.type,
      isin: asset.isin,
      brokerSymbol: asset.brokerSymbol,
      exchange: asset.exchange,
    });
    const newAsset: Asset = {
      ...asset,
      canonicalAssetKey: asset.canonicalAssetKey ?? identity.canonicalAssetKey,
      identityStrategy: asset.identityStrategy ?? identity.identityStrategy,
      identityStatus: asset.identityStatus ?? identity.identityStatus,
      isin: asset.isin ?? identity.isin,
      brokerSymbol: asset.brokerSymbol ?? identity.brokerSymbol,
      exchange: asset.exchange ?? identity.exchange,
      createdAt: Date.now(),
    };
    await db.assets.add(newAsset);
    return newAsset;
  },

  async update(id: string, updates: Partial<Asset>) {
    await db.assets.update(id, updates);
  },

  async delete(id: string) {
    await db.assets.delete(id);
  },

  async deleteAll() {
    await db.assets.clear();
  },
};
