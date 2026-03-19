import { db } from '../db';
import {
  Account,
  Asset,
  FxSnapshot,
  ImportJob,
  ImportRow,
  ImportMode,
  ImportSourceProfile,
  Platform,
  PositionSnapshot,
  PriceSnapshot,
  Transaction,
} from '../types';
import {
  NormalizedPositionSnapshotRow,
  NormalizedTransactionRow,
} from '../lib/csvImport';
import {
  buildImplicitZeroPositionSnapshots,
  buildPositionSnapshotGroupKey,
  buildPositionSnapshotId,
  buildPositionSnapshotPriceId,
  buildSyntheticTransactionsFromPositionSnapshots,
  collapsePositionSnapshotInputs,
  isPositionSnapshotTransaction,
} from '../lib/positionSnapshots';

const withTables = [
  db.platforms,
  db.accounts,
  db.assets,
  db.transactions,
  db.priceSnapshots,
  db.fxSnapshots,
  db.importJobs,
  db.importRows,
  db.positionSnapshots,
];

const DEFAULT_IMPORT_CHECKSUM_VERSION = 'fnv1a-v1';
const DEFAULT_ACCOUNT_TYPE_BY_SOURCE: Record<ImportSourceProfile, Account['type']> = {
  broker_export: 'BROKERAGE',
  crypto_exchange: 'EXCHANGE',
  wallet_export: 'WALLET',
  monthly_statement: 'BROKERAGE',
  custom: 'OTHER',
};

interface ImportExecutionOptions {
  fileName: string;
  fileSize: number;
  fileLastModified: number;
  fileFingerprint: string;
  sourceProfile: ImportSourceProfile;
  targetAccountName?: string;
}

const createId = (prefix: string) => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
};

const normalizeKey = (value: string | undefined | null) =>
  String(value ?? '').trim().toLowerCase();

const defaultAccountNameForPlatform = (platformName: string) => `${platformName.trim()} Main`;

const buildImportRowId = (importJobId: string, rowNumber: number) =>
  `import_row_${importJobId}_${rowNumber}`;

const buildTransactionFingerprint = (row: NormalizedTransactionRow) =>
  [
    row.date,
    row.platform,
    row.kind,
    row.assetSymbol ?? '',
    row.qty ?? '',
    row.price ?? '',
    row.currency,
    row.cashCurrency ?? '',
    row.note ?? '',
  ].join('|');

const buildSnapshotFingerprint = (row: NormalizedPositionSnapshotRow) =>
  [
    row.date,
    row.platform,
    row.assetSymbol,
    row.qty,
    row.price ?? '',
    row.currency,
    row.note ?? '',
  ].join('|');

const buildImportJob = (args: {
  id: string;
  mode: ImportMode;
  status: ImportJob['status'];
  options: ImportExecutionOptions;
  rowCount: number;
  parsedRowCount: number;
  errorCount: number;
  duplicateRowCount: number;
  summary: string;
  importedAt: number;
  platformId?: string;
  accountId?: string;
}): ImportJob => ({
  id: args.id,
  mode: args.mode,
  sourceProfile: args.options.sourceProfile,
  status: args.status,
  platformId: args.platformId,
  accountId: args.accountId,
  fileName: args.options.fileName,
  fileSize: args.options.fileSize,
  fileLastModified: args.options.fileLastModified,
  fileFingerprint: args.options.fileFingerprint,
  checksumVersion: DEFAULT_IMPORT_CHECKSUM_VERSION,
  rowCount: args.rowCount,
  parsedRowCount: args.parsedRowCount,
  errorCount: args.errorCount,
  duplicateRowCount: args.duplicateRowCount,
  summary: args.summary,
  importedAt: args.importedAt,
  createdAt: args.importedAt,
});

const upsertAccount = async (args: {
  existingAccounts: Account[];
  accountMap: Map<string, Account>;
  platformId: string;
  platformName: string;
  sourceProfile: ImportSourceProfile;
  targetAccountName?: string;
  timestamp: number;
}): Promise<{ account: Account; created?: Account }> => {
  const accountName = (args.targetAccountName?.trim() || defaultAccountNameForPlatform(args.platformName)).trim();
  const accountKey = `${args.platformId}:${normalizeKey(accountName)}`;
  const existing = args.accountMap.get(accountKey) ?? args.existingAccounts.find(
    (account) =>
      account.platformId === args.platformId && normalizeKey(account.name) === normalizeKey(accountName),
  );

  if (existing) {
    args.accountMap.set(accountKey, existing);
    return { account: existing };
  }

  const account: Account = {
    id: createId('account'),
    platformId: args.platformId,
    name: accountName,
    type: DEFAULT_ACCOUNT_TYPE_BY_SOURCE[args.sourceProfile],
    createdAt: args.timestamp,
  };

  args.accountMap.set(accountKey, account);
  args.existingAccounts.push(account);
  return { account, created: account };
};

export const adminRepository = {
  /**
   * Clear every IndexedDB table inside a single Dexie transaction to avoid
   * partially reset states when an error occurs mid-operation.
   */
  resetDatabase: async () => {
    await db.transaction('rw', withTables, async () => {
      await Promise.all([
        db.platforms.clear(),
        db.accounts.clear(),
        db.assets.clear(),
        db.transactions.clear(),
        db.priceSnapshots.clear(),
        db.fxSnapshots.clear(),
        db.importJobs.clear(),
        db.importRows.clear(),
        db.positionSnapshots.clear(),
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

    const sampleAccounts: Account[] = [
      { id: 'account_1', platformId: 'platform_1', name: 'DEGIRO CTO', type: 'BROKERAGE', createdAt: timestamp },
      { id: 'account_2', platformId: 'platform_2', name: 'IBKR Crypto', type: 'EXCHANGE', createdAt: timestamp },
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
        accountId: 'account_1',
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
        accountId: 'account_1',
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
        accountId: 'account_2',
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

    await db.transaction('rw', withTables, async () => {
      await db.platforms.bulkPut(samplePlatforms);
      await db.accounts.bulkPut(sampleAccounts);
      await db.assets.bulkPut(sampleAssets);
      await db.transactions.bulkPut(sampleTransactions);
      await db.priceSnapshots.bulkPut(samplePrices);
      await db.fxSnapshots.bulkPut(sampleFxRates);
    });
  },

  importNormalizedTransactions: async (
    rows: NormalizedTransactionRow[],
    options?: ImportExecutionOptions,
  ) => {
    if (rows.length === 0) {
      return {
        importJobId: null,
        transactionsCreated: 0,
        platformsCreated: 0,
        accountsCreated: 0,
        assetsCreated: 0,
        duplicateSkipped: false,
      };
    }

    const timestamp = Date.now();
    const platformsCreated: Platform[] = [];
    const accountsCreated: Account[] = [];
    const assetsCreated: Asset[] = [];
    const transactionsToCreate: Transaction[] = [];
    const priceSnapshots: PriceSnapshot[] = [];
    const importRows: ImportRow[] = [];
    const priceKeySet = new Set<string>();
    const rowFingerprintSet = new Set<string>();
    let importJobId: string | null = null;
    let duplicateSkipped = false;

    await db.transaction('rw', withTables, async () => {
      if (options) {
        const existingJob = await db.importJobs
          .where('fileFingerprint')
          .equals(options.fileFingerprint)
          .filter((job) => job.status === 'IMPORTED')
          .first();

        if (existingJob) {
          importJobId = createId('import_job');
          duplicateSkipped = true;

          const duplicateJob = buildImportJob({
            id: importJobId,
            mode: 'transactions',
            status: 'DUPLICATE',
            options,
            rowCount: rows.length,
            parsedRowCount: rows.length,
            errorCount: 0,
            duplicateRowCount: rows.length,
            summary: `Skipped duplicate import. Fingerprint already imported via ${existingJob.id}.`,
            importedAt: timestamp,
            platformId: existingJob.platformId,
            accountId: existingJob.accountId,
          });

          await db.importJobs.add(duplicateJob);
          await db.importRows.bulkPut(
            rows.map((row, index) => ({
              id: buildImportRowId(importJobId!, index + 1),
              importJobId: importJobId!,
              rowNumber: index + 1,
              fingerprint: buildTransactionFingerprint(row),
              status: 'SKIPPED_DUPLICATE_IMPORT',
              date: row.date,
              platformName: row.platform,
              accountName: options.targetAccountName,
              assetSymbol: row.assetSymbol,
              kind: row.kind,
              qty: row.qty,
              currency: row.cashCurrency ?? row.currency,
              message: 'Skipped because this file fingerprint was already imported.',
              createdAt: timestamp + index,
            })),
          );

          return;
        }
      }

      const existingPlatforms = await db.platforms.toArray();
      const existingAccounts = await db.accounts.toArray();
      const existingAssets = await db.assets.toArray();

      const platformMap = new Map<string, Platform>();
      existingPlatforms.forEach((platform) => {
        platformMap.set(normalizeKey(platform.name), platform);
      });

      const accountMap = new Map<string, Account>();
      existingAccounts.forEach((account) => {
        accountMap.set(`${account.platformId}:${normalizeKey(account.name)}`, account);
      });

      const assetMap = new Map<string, Asset>();
      existingAssets.forEach((asset) => {
        assetMap.set(asset.symbol.toUpperCase(), asset);
      });

      importJobId = options ? createId('import_job') : null;

      for (const row of rows) {
        const rowNumber = importRows.length + 1;
        const rowFingerprint = buildTransactionFingerprint(row);
        const importRowId = importJobId ? buildImportRowId(importJobId, rowNumber) : undefined;
        const isDuplicateInFile = rowFingerprintSet.has(rowFingerprint);

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

        const { account, created } = await upsertAccount({
          existingAccounts,
          accountMap,
          platformId: platform.id,
          platformName: platform.name,
          sourceProfile: options?.sourceProfile ?? 'custom',
          targetAccountName: options?.targetAccountName,
          timestamp,
        });
        if (created) {
          accountsCreated.push(created);
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
        importRows.push({
          id: importRowId ?? createId('import_row'),
          importJobId: importJobId ?? 'legacy_import',
          rowNumber,
          fingerprint: rowFingerprint,
          status: isDuplicateInFile ? 'DUPLICATE_IN_FILE' : 'IMPORTED',
          date: row.date,
          platformName: row.platform,
          accountName: account.name,
          assetSymbol: row.assetSymbol,
          kind: row.kind,
          qty: row.qty,
          currency: row.cashCurrency ?? row.currency,
          message: isDuplicateInFile ? 'Duplicate row inside the same file.' : undefined,
          createdAt: timestamp + importRows.length,
        });
        rowFingerprintSet.add(rowFingerprint);

        // Keep duplicate rows in the audit trail, but never persist them as
        // transactions or price points. Otherwise one bad CSV line duplicates
        // both holdings and valuation inputs.
        if (isDuplicateInFile) {
          continue;
        }

        const transaction: Transaction = {
          id: createId('tx'),
          platformId: platform.id,
          accountId: account.id,
          assetId: asset?.id,
          kind: row.kind,
          date: row.date,
          qty: row.qty ?? undefined,
          price: row.price ?? undefined,
          fee: row.fee ?? undefined,
          currency: row.cashCurrency ?? row.currency,
          note: row.note ?? undefined,
          source: 'CSV_TRANSACTION',
          importJobId: importJobId ?? undefined,
          importRowId,
          fingerprint: rowFingerprint,
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
              importJobId: importJobId ?? undefined,
              createdAt: timestamp + priceSnapshots.length,
            });
            priceKeySet.add(priceKey);
          }
        }
      }

      if (platformsCreated.length) {
        await db.platforms.bulkAdd(platformsCreated);
      }
      if (accountsCreated.length) {
        await db.accounts.bulkAdd(accountsCreated);
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
      if (options && importJobId) {
        await db.importJobs.add(
          buildImportJob({
            id: importJobId,
            mode: 'transactions',
            status: 'IMPORTED',
            options,
            rowCount: rows.length,
            parsedRowCount: rows.length,
            errorCount: 0,
            duplicateRowCount: importRows.filter((row) => row.status === 'DUPLICATE_IN_FILE').length,
            summary: `${transactionsToCreate.length} transaction(s) imported successfully.`,
            importedAt: timestamp,
            platformId: transactionsToCreate[0]?.platformId,
            accountId: transactionsToCreate[0]?.accountId,
          }),
        );
        await db.importRows.bulkPut(importRows);
      }
    });

    return {
      importJobId,
      transactionsCreated: transactionsToCreate.length,
      platformsCreated: platformsCreated.length,
      accountsCreated: accountsCreated.length,
      assetsCreated: assetsCreated.length,
      duplicateSkipped,
    };
  },

  importMonthlyPositionSnapshots: async (
    rows: NormalizedPositionSnapshotRow[],
    options?: ImportExecutionOptions,
  ) => {
    if (rows.length === 0) {
      return {
        importJobId: null,
        snapshotsUpserted: 0,
        implicitClosures: 0,
        syntheticTransactionsRebuilt: 0,
        platformsCreated: 0,
        accountsCreated: 0,
        assetsCreated: 0,
        duplicateSkipped: false,
      };
    }

    const timestamp = Date.now();
    const platformsCreated: Platform[] = [];
    const accountsCreated: Account[] = [];
    const assetsCreated: Asset[] = [];
    let importedSnapshotCount = 0;
    let implicitClosureCount = 0;
    let syntheticTransactionCount = 0;
    let importJobId: string | null = null;
    let duplicateSkipped = false;

    await db.transaction('rw', withTables, async () => {
      if (options) {
        const existingJob = await db.importJobs
          .where('fileFingerprint')
          .equals(options.fileFingerprint)
          .filter((job) => job.status === 'IMPORTED')
          .first();

        if (existingJob) {
          importJobId = createId('import_job');
          duplicateSkipped = true;
          await db.importJobs.add(
            buildImportJob({
              id: importJobId,
              mode: 'monthly_positions',
              status: 'DUPLICATE',
              options,
              rowCount: rows.length,
              parsedRowCount: rows.length,
              errorCount: 0,
              duplicateRowCount: rows.length,
              summary: `Skipped duplicate snapshot import. Fingerprint already imported via ${existingJob.id}.`,
              importedAt: timestamp,
              platformId: existingJob.platformId,
              accountId: existingJob.accountId,
            }),
          );
          await db.importRows.bulkPut(
            rows.map((row, index) => ({
              id: buildImportRowId(importJobId!, index + 1),
              importJobId: importJobId!,
              rowNumber: index + 1,
              fingerprint: buildSnapshotFingerprint(row),
              status: 'SKIPPED_DUPLICATE_IMPORT',
              date: row.date,
              platformName: row.platform,
              accountName: options.targetAccountName,
              assetSymbol: row.assetSymbol,
              qty: row.qty,
              currency: row.currency,
              message: 'Skipped because this file fingerprint was already imported.',
              createdAt: timestamp + index,
            })),
          );
          return;
        }
      }

      const existingPlatforms = await db.platforms.toArray();
      const existingAccounts = await db.accounts.toArray();
      const existingAssets = await db.assets.toArray();
      const existingSnapshots = await db.positionSnapshots.toArray();
      const existingTransactions = await db.transactions.toArray();

      const platformMap = new Map<string, Platform>();
      existingPlatforms.forEach((platform) => {
        platformMap.set(normalizeKey(platform.name), platform);
      });

      const accountMap = new Map<string, Account>();
      existingAccounts.forEach((account) => {
        accountMap.set(`${account.platformId}:${normalizeKey(account.name)}`, account);
      });

      const assetMap = new Map<string, Asset>();
      existingAssets.forEach((asset) => {
        assetMap.set(asset.symbol.toUpperCase(), asset);
      });

      importJobId = options ? createId('import_job') : null;

      const snapshotInputs = [];
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

        const { account, created } = await upsertAccount({
          existingAccounts,
          accountMap,
          platformId: platform.id,
          platformName: platform.name,
          sourceProfile: options?.sourceProfile ?? 'monthly_statement',
          targetAccountName: options?.targetAccountName,
          timestamp,
        });
        if (created) {
          accountsCreated.push(created);
        }

        const symbol = row.assetSymbol.toUpperCase();
        let asset = assetMap.get(symbol);
        if (!asset) {
          asset = {
            id: createId('asset'),
            type: row.assetType ?? 'STOCK',
            symbol,
            name: row.assetName || row.assetSymbol,
            currency: row.currency,
            createdAt: timestamp,
          };
          assetMap.set(symbol, asset);
          assetsCreated.push(asset);
        }

        snapshotInputs.push({
          platformId: platform.id,
          accountId: account.id,
          assetId: asset.id,
          date: row.date,
          qty: row.qty,
          price: row.price,
          currency: row.currency,
          note: row.note,
        });
      }

      const importedSnapshotInputs = collapsePositionSnapshotInputs(snapshotInputs);

      const implicitZeroInputs = buildImplicitZeroPositionSnapshots(
        existingSnapshots,
        importedSnapshotInputs,
      );
      importedSnapshotCount = importedSnapshotInputs.length;
      implicitClosureCount = implicitZeroInputs.length;
      const replacedSnapshotGroups = new Set(
        importedSnapshotInputs.map((snapshot) =>
          buildPositionSnapshotGroupKey(snapshot.platformId, snapshot.date, snapshot.accountId),
        ),
      );
      const replacedSnapshotIds = existingSnapshots
        .filter((snapshot) =>
          replacedSnapshotGroups.has(
            buildPositionSnapshotGroupKey(snapshot.platformId, snapshot.date, snapshot.accountId),
          ),
        )
        .map((snapshot) => snapshot.id);

      const snapshotsToUpsert: PositionSnapshot[] = [
        ...importedSnapshotInputs,
        ...implicitZeroInputs,
      ].map((snapshot, index) => ({
        id: buildPositionSnapshotId(
          snapshot.platformId,
          snapshot.assetId,
          snapshot.date,
          snapshot.accountId,
        ),
        platformId: snapshot.platformId,
        accountId: snapshot.accountId,
        assetId: snapshot.assetId,
        date: snapshot.date,
        qty: snapshot.qty,
        price: snapshot.price,
        currency: snapshot.currency,
        note: snapshot.note,
        importJobId: importJobId ?? undefined,
        createdAt: timestamp + index,
      }));

      const mergedSnapshotMap = new Map<string, PositionSnapshot>();
      existingSnapshots.forEach((snapshot) => {
        const replacementKey = buildPositionSnapshotGroupKey(
          snapshot.platformId,
          snapshot.date,
          snapshot.accountId,
        );
        if (replacedSnapshotGroups.has(replacementKey)) {
          return;
        }
        mergedSnapshotMap.set(snapshot.id, snapshot);
      });
      snapshotsToUpsert.forEach((snapshot) => {
        mergedSnapshotMap.set(snapshot.id, snapshot);
      });

      const syntheticTransactions = buildSyntheticTransactionsFromPositionSnapshots(
        Array.from(mergedSnapshotMap.values()),
      ).map((transaction, index) => ({
        ...transaction,
        createdAt: timestamp + index,
      }));
      syntheticTransactionCount = syntheticTransactions.length;

      const syntheticTransactionIds = existingTransactions
        .filter((transaction) => isPositionSnapshotTransaction(transaction))
        .map((transaction) => transaction.id);

      const priceSnapshotMap = new Map<string, PriceSnapshot>();
      importedSnapshotInputs
        .filter((snapshot) => snapshot.price !== undefined)
        .forEach((snapshot, index) => {
          priceSnapshotMap.set(buildPositionSnapshotPriceId(snapshot.assetId, snapshot.date), {
            id: buildPositionSnapshotPriceId(snapshot.assetId, snapshot.date),
            assetId: snapshot.assetId,
            date: snapshot.date,
            price: snapshot.price!,
            currency: snapshot.currency,
            importJobId: importJobId ?? undefined,
            createdAt: timestamp + index,
          });
        });
      const priceSnapshots = Array.from(priceSnapshotMap.values());

      if (platformsCreated.length) {
        await db.platforms.bulkAdd(platformsCreated);
      }
      if (accountsCreated.length) {
        await db.accounts.bulkAdd(accountsCreated);
      }
      if (assetsCreated.length) {
        await db.assets.bulkAdd(assetsCreated);
      }
      if (replacedSnapshotIds.length) {
        await db.positionSnapshots.bulkDelete(replacedSnapshotIds);
      }
      if (snapshotsToUpsert.length) {
        await db.positionSnapshots.bulkPut(snapshotsToUpsert);
      }
      if (priceSnapshots.length) {
        await db.priceSnapshots.bulkPut(priceSnapshots);
      }
      if (syntheticTransactionIds.length) {
        await db.transactions.bulkDelete(syntheticTransactionIds);
      }
      if (syntheticTransactions.length) {
        await db.transactions.bulkPut(syntheticTransactions);
      }
      if (options && importJobId) {
        await db.importJobs.add(
          buildImportJob({
            id: importJobId,
            mode: 'monthly_positions',
            status: 'IMPORTED',
            options,
            rowCount: rows.length,
            parsedRowCount: rows.length,
            errorCount: 0,
            duplicateRowCount: 0,
            summary: `${importedSnapshotCount} snapshot(s) imported and ${syntheticTransactionCount} synthetic transaction(s) rebuilt.`,
            importedAt: timestamp,
            platformId: snapshotsToUpsert[0]?.platformId,
            accountId: snapshotsToUpsert[0]?.accountId,
          }),
        );
        await db.importRows.bulkPut(
          rows.map((row, index) => ({
            id: buildImportRowId(importJobId!, index + 1),
            importJobId: importJobId!,
            rowNumber: index + 1,
            fingerprint: buildSnapshotFingerprint(row),
            status: 'IMPORTED',
            date: row.date,
            platformName: row.platform,
            accountName: options.targetAccountName,
            assetSymbol: row.assetSymbol,
            qty: row.qty,
            currency: row.currency,
            createdAt: timestamp + index,
          })),
        );
      }
    });

    return {
      importJobId,
      snapshotsUpserted: importedSnapshotCount,
      implicitClosures: implicitClosureCount,
      syntheticTransactionsRebuilt: syntheticTransactionCount,
      platformsCreated: platformsCreated.length,
      accountsCreated: accountsCreated.length,
      assetsCreated: assetsCreated.length,
      duplicateSkipped,
    };
  },
};
