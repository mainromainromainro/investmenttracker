import { db } from '../db';
import { Asset } from '../types';

export const assetRepository = {
  async getAll() {
    return db.assets.toArray();
  },

  async getById(id: string) {
    return db.assets.get(id);
  },

  async create(asset: Omit<Asset, 'createdAt'>) {
    const newAsset: Asset = {
      ...asset,
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
