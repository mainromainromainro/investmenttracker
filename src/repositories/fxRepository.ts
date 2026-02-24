import { db } from '../db';
import { FxSnapshot } from '../types';

export const fxRepository = {
  async getAll() {
    return db.fxSnapshots.toArray();
  },

  async getById(id: string) {
    return db.fxSnapshots.get(id);
  },

  async getByPair(pair: string) {
    return db.fxSnapshots.where('pair').equals(pair).toArray();
  },

  async getLatestByPair(pair: string) {
    const snapshots = await this.getByPair(pair);
    if (snapshots.length === 0) return null;
    return snapshots.reduce((latest, current) =>
      current.date > latest.date ? current : latest
    );
  },

  async create(snapshot: Omit<FxSnapshot, 'createdAt'>) {
    const newSnapshot: FxSnapshot = {
      ...snapshot,
      createdAt: Date.now(),
    };
    await db.fxSnapshots.add(newSnapshot);
    return newSnapshot;
  },

  async update(id: string, updates: Partial<FxSnapshot>) {
    await db.fxSnapshots.update(id, updates);
  },

  async delete(id: string) {
    await db.fxSnapshots.delete(id);
  },

  async deleteAll() {
    await db.fxSnapshots.clear();
  },
};
