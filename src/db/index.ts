import Dexie, { Table } from 'dexie';
import {
  Platform,
  Asset,
  Transaction,
  PriceSnapshot,
  FxSnapshot,
} from '../types';

export class InvestmentTrackerDB extends Dexie {
  platforms!: Table<Platform>;
  assets!: Table<Asset>;
  transactions!: Table<Transaction>;
  priceSnapshots!: Table<PriceSnapshot>;
  fxSnapshots!: Table<FxSnapshot>;

  constructor() {
    super('InvestmentTrackerDB');
    this.version(1).stores({
      platforms: 'id',
      assets: 'id',
      transactions: 'id, platformId, assetId, date',
      priceSnapshots: 'id, assetId, date',
      fxSnapshots: 'id, pair, date',
    });
  }
}

export const db = new InvestmentTrackerDB();
