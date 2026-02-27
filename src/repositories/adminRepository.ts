import { db } from '../db';
import {
  Asset,
  FxSnapshot,
  Platform,
  PriceSnapshot,
  Transaction,
} from '../types';
import { NormalizedTransactionRow } from '../lib/csvImport';

const withTables = [
  db.platforms,
  db.assets,
  db.transactions,
  db.priceSnapshots,
  db.fxSnapshots,
] as const;

const createId = (prefix: string) => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
};

const normalizeKey = (value: string | undefined | null) =>
  String(value ?? '').trim().toLowerCase();

export const adminRepository = {
  /**
   * Clear every IndexedDB table inside a single Dexie transaction to avoid
   * partially reset states when an error occurs mid-operation.
   */
  resetDatabase: async () => {
    await db.transaction('rw', ...withTables, async () => {
      await Promise.all([
        db.platforms.clear(),
        db.assets.clear(),
        db.transactions.clear(),
        db.priceSnapshots.clear(),
        db.fxSnapshots.clear(),
      ]);
    });
  },

  /**
   * Seed deterministic sample data that mirrors the previous inline Settings
   * implementation while keeping all persistence logic in one place.
   */
  seedSampleData: async () => {
    const timestamp = Date.now();

    const samplePlatforms: Platform[] = [
      { id: 'platform_1', name: 'DEGIRO', createdAt: timestamp },
      { id: 'platform_2', name: 'Interactive Brokers', createdAt: timestamp },
    ];

    const sampleAssets: Asset[] = [
      {
        id: 'asset_1',
        type: 'ETF',
        symbol: 'VWRL',
        name: 'Vanguard FTSE All-World UCITS ETF',
        currency: 'EUR',
        createdAt: timestamp,
      },
      {
        id: 'asset_2',
        type: 'STOCK',
        symbol: 'AAPL',
        name: 'Apple Inc.',
        currency: 'USD',
        createdAt: timestamp,
      },
      {
        id: 'asset_3',
        type: 'CRYPTO',
        symbol: 'BTC',
        name: 'Bitcoin',
        currency: 'USD',
        createdAt: timestamp,
      },
    ];

    const sampleTransactions: Transaction[] = [
      {
        id: 'tx_1',
        platformId: 'platform_1',
        assetId: 'asset_1',
        kind: 'BUY',
        date: new Date('2024-01-01').getTime(),
        qty: 100,
        price: 90.5,
        currency: 'EUR',
        createdAt: timestamp,
      },
      {
        id: 'tx_2',
        platformId: 'platform_1',
        assetId: 'asset_2',
        kind: 'BUY',
        date: new Date('2024-01-15').getTime(),
        qty: 10,
        price: 150,
        currency: 'USD',
        createdAt: timestamp,
      },
      {
        id: 'tx_3',
        platformId: 'platform_2',
        assetId: 'asset_3',
        kind: 'BUY',
        date: new Date('2024-02-01').getTime(),
        qty: 0.5,
        price: 45000,
        currency: 'USD',
        createdAt: timestamp,
      },
    ];

    const samplePrices: PriceSnapshot[] = [
      {
        id: 'price_1',
        assetId: 'asset_1',
        date: timestamp,
        price: 95.75,
        currency: 'EUR',
        createdAt: timestamp,
      },
      {
        id: 'price_2',
        assetId: 'asset_2',
        date: timestamp,
        price: 175.5,
        currency: 'USD',
        createdAt: timestamp,
      },
      {
        id: 'price_3',
        assetId: 'asset_3',
        date: timestamp,
        price: 52000,
        currency: 'USD',
        createdAt: timestamp,
      },
    ];

    const sampleFxRates: FxSnapshot[] = [
      {
        id: 'fx_1',
        pair: 'USD/EUR',
        date: timestamp,
        rate: 0.92,
        createdAt: timestamp,
      },
    ];

    await db.transaction('rw', ...withTables, async () => {
      await db.platforms.bulkPut(samplePlatforms);
      await db.assets.bulkPut(sampleAssets);
      await db.transactions.bulkPut(sampleTransactions);
      await db.priceSnapshots.bulkPut(samplePrices);
      await db.fxSnapshots.bulkPut(sampleFxRates);
    });
  },

  importNormalizedTransactions: async (rows: NormalizedTransactionRow[]) => {
    if (rows.length === 0) {
      return {
        transactionsCreated: 0,
        platformsCreated: 0,
        assetsCreated: 0,
      };
    }

    const timestamp = Date.now();
    const platformsCreated: Platform[] = [];
    const assetsCreated: Asset[] = [];
    const transactionsToCreate: Transaction[] = [];
    const priceSnapshots: PriceSnapshot[] = [];
    const priceKeySet = new Set<string>();

    await db.transaction('rw', ...withTables, async () => {
      const existingPlatforms = await db.platforms.toArray();
      const existingAssets = await db.assets.toArray();

      const platformMap = new Map<string, Platform>();
      existingPlatforms.forEach((platform) => {
        platformMap.set(normalizeKey(platform.name), platform);
      });

      const assetMap = new Map<string, Asset>();
      existingAssets.forEach((asset) => {
        assetMap.set(asset.symbol.toUpperCase(), asset);
      });

      for (const row of rows) {
        const platformKey = normalizeKey(row.platform);
        let platform = platformMap.get(platformKey);
        if (!platform) {
          platform = {
            id: createId('platform'),
            name: row.platform.trim(),
            createdAt: timestamp,
          };
          platformMap.set(platformKey, platform);
          platformsCreated.push(platform);
        }

        let asset: Asset | undefined;
        if (row.assetSymbol) {
          const symbol = row.assetSymbol.toUpperCase();
          asset = assetMap.get(symbol);
          if (!asset) {
            asset = {
              id: createId('asset'),
              type: row.assetType ?? 'ETF',
              symbol,
              name: row.assetName || row.assetSymbol,
              currency: row.currency,
              createdAt: timestamp,
            };
            assetMap.set(symbol, asset);
            assetsCreated.push(asset);
          }
        }

        const transaction: Transaction = {
          id: createId('tx'),
          platformId: platform.id,
          assetId: asset?.id,
          kind: row.kind,
          date: row.date,
          qty: row.qty ?? undefined,
          price: row.price ?? undefined,
          fee: row.fee ?? undefined,
          currency: row.cashCurrency ?? row.currency,
          note: row.note ?? undefined,
          createdAt: timestamp + transactionsToCreate.length,
        };
        transactionsToCreate.push(transaction);

        if (asset && row.price) {
          const priceKey = `${asset.id}:${row.date}`;
          if (!priceKeySet.has(priceKey)) {
            priceSnapshots.push({
              id: createId('price'),
              assetId: asset.id,
              date: row.date,
              price: row.price,
              currency: row.currency,
              createdAt: timestamp + priceSnapshots.length,
            });
            priceKeySet.add(priceKey);
          }
        }
      }

      if (platformsCreated.length) {
        await db.platforms.bulkAdd(platformsCreated);
      }
      if (assetsCreated.length) {
        await db.assets.bulkAdd(assetsCreated);
      }
      if (transactionsToCreate.length) {
        await db.transactions.bulkAdd(transactionsToCreate);
      }
      if (priceSnapshots.length) {
        await db.priceSnapshots.bulkAdd(priceSnapshots);
      }
    });

    return {
      transactionsCreated: transactionsToCreate.length,
      platformsCreated: platformsCreated.length,
      assetsCreated: assetsCreated.length,
    };
  },
};
