import Dexie, { Table } from 'dexie';
import {
  Platform,
  Account,
  Asset,
  Transaction,
  PriceSnapshot,
  FxSnapshot,
  ImportJob,
  ImportRow,
  PositionSnapshot,
} from '../types';

export class InvestmentTrackerDB extends Dexie {
  platforms!: Table<Platform>;
  accounts!: Table<Account>;
  assets!: Table<Asset>;
  transactions!: Table<Transaction>;
  priceSnapshots!: Table<PriceSnapshot>;
  fxSnapshots!: Table<FxSnapshot>;
  importJobs!: Table<ImportJob>;
  importRows!: Table<ImportRow>;
  positionSnapshots!: Table<PositionSnapshot>;

  constructor() {
    super('InvestmentTrackerDB');
    this.version(1).stores({
      platforms: 'id',
      assets: 'id',
      transactions: 'id, platformId, assetId, date',
      priceSnapshots: 'id, assetId, date',
      fxSnapshots: 'id, pair, date',
    });
    this.version(2).stores({
      platforms: 'id',
      assets: 'id',
      transactions: 'id, platformId, assetId, date',
      priceSnapshots: 'id, assetId, date',
      fxSnapshots: 'id, pair, date',
      positionSnapshots: 'id, platformId, assetId, date',
    });
    this.version(3).stores({
      platforms: 'id',
      accounts: 'id, platformId, [platformId+name], type',
      assets: 'id',
      transactions: 'id, platformId, accountId, assetId, importJobId, date, [platformId+assetId], [accountId+assetId]',
      priceSnapshots: 'id, assetId, importJobId, sourceProfile, sourceTemplateId, sourceSection, date',
      fxSnapshots: 'id, pair, date',
      importJobs: 'id, status, mode, sourceProfile, fileFingerprint, importedAt',
      importRows: 'id, importJobId, status, fingerprint, rowNumber',
      positionSnapshots: 'id, platformId, accountId, assetId, importJobId, date',
    });
    this.version(4).stores({
      platforms: 'id',
      accounts: 'id, platformId, [platformId+name], type',
      assets: 'id',
      transactions:
        'id, platformId, accountId, assetId, importJobId, sourceProfile, sourceTemplateId, sourceSection, date, [platformId+assetId], [accountId+assetId]',
      priceSnapshots: 'id, assetId, importJobId, sourceProfile, sourceTemplateId, sourceSection, date',
      fxSnapshots: 'id, pair, date',
      importJobs:
        'id, status, mode, sourceProfile, sourceTemplateId, sourceSection, sourceSignature, fileFingerprint, importedAt',
      importRows:
        'id, importJobId, status, fingerprint, rowNumber, sourceProfile, sourceTemplateId, sourceSection, sourceTicker',
      positionSnapshots:
        'id, platformId, accountId, assetId, importJobId, sourceProfile, sourceTemplateId, sourceSection, date',
    });
  }
}

export const db = new InvestmentTrackerDB();
