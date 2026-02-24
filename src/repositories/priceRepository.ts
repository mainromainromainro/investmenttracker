import { db } from '../db';
import { PriceSnapshot } from '../types';

export const priceRepository = {
  async getAll() {
    return db.priceSnapshots.toArray();
  },

  async getById(id: string) {
    return db.priceSnapshots.get(id);
  },

  async getByAssetId(assetId: string) {
    return db.priceSnapshots.where('assetId').equals(assetId).toArray();
  },

  async getLatestByAssetId(assetId: string) {
    const snapshots = await this.getByAssetId(assetId);
    if (snapshots.length === 0) return null;
    return snapshots.reduce((latest, current) =>
      current.date > latest.date ? current : latest
    );
  },

  async create(snapshot: Omit<PriceSnapshot, 'createdAt'>) {
    const newSnapshot: PriceSnapshot = {
      ...snapshot,
      createdAt: Date.now(),
    };
    await db.priceSnapshots.add(newSnapshot);
    return newSnapshot;
  },

  async update(id: string, updates: Partial<PriceSnapshot>) {
    await db.priceSnapshots.update(id, updates);
  },

  async delete(id: string) {
    await db.priceSnapshots.delete(id);
  },

  async deleteAll() {
    await db.priceSnapshots.clear();
  },
};
