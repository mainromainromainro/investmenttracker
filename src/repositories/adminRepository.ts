import { db } from '../db';
import {
  Account,
  Asset,
  AssetResolutionStatus,
  FxSnapshot,
  ImportJob,
  ImportRow,
  ImportMode,
  ImportSourceProfile,
  Platform,
  PositionSnapshot,
  PriceSnapshot,
  ImportSourceAuditFields,
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
  type PositionSnapshotInput,
} from '../lib/positionSnapshots';
import {
  getAssetCanonicalKey,
  normalizeIdentityCurrency,
} from '../lib/assetIdentity';
import { resolveImportedAsset } from '../lib/assetResolver';

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
  sourceContext?: ImportSourceAuditFields;
}

type ImportSourceContextInput = ImportSourceAuditFields & {
  sourceProfile: ImportSourceProfile;
};

const createId = (prefix: string) => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
};

const normalizeKey = (value: string | undefined | null) =>
  String(value ?? '').trim().toLowerCase();

const buildScopedSourceRowKey = (
  sourceAdapterId: string | undefined,
  sourceRowRef: string | undefined,
  accountId: string | undefined,
) =>
  sourceAdapterId && sourceRowRef
    ? `${sourceAdapterId}|${accountId ?? ''}|${sourceRowRef}`
    : '';

const defaultAccountNameForPlatform = (platformName: string) => `${platformName.trim()} Main`;

const buildImportRowId = (importJobId: string, rowNumber: number) =>
  `import_row_${importJobId}_${rowNumber}`;

const normalizeNumberFingerprintPart = (value: number | undefined) =>
  value === undefined ? '' : Number(value.toFixed(12)).toString();

const buildTransactionFingerprint = (row: NormalizedTransactionRow) =>
  [
    row.date,
    row.platform,
    row.kind,
    row.assetSymbol ?? '',
    row.assetIsin ?? '',
    row.brokerSymbol ?? '',
    row.exchange ?? '',
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
    row.assetIsin ?? '',
    row.brokerSymbol ?? '',
    row.exchange ?? '',
    row.qty,
    row.price ?? '',
    row.currency,
    row.note ?? '',
  ].join('|');

const buildCanonicalTransactionFingerprint = (args: {
  row: NormalizedTransactionRow;
  canonicalAssetKey?: string;
  accountId?: string;
}) =>
  [
    'transactions',
    args.row.platform.trim().toLowerCase(),
    args.accountId ?? '',
    args.row.kind,
    args.canonicalAssetKey ?? '',
    args.row.assetIsin ?? '',
    args.row.brokerSymbol ?? args.row.assetSymbol ?? '',
    args.row.exchange ?? '',
    args.row.date,
    normalizeNumberFingerprintPart(args.row.qty),
    normalizeNumberFingerprintPart(args.row.price),
    normalizeIdentityCurrency(args.row.currency) ?? args.row.currency,
    normalizeIdentityCurrency(args.row.cashCurrency) ?? args.row.cashCurrency ?? '',
    (args.row.note ?? '').trim(),
  ].join('|');

const buildCanonicalSnapshotFingerprint = (args: {
  row: NormalizedPositionSnapshotRow;
  canonicalAssetKey?: string;
  accountId?: string;
}) =>
  [
    'monthly_positions',
    args.row.platform.trim().toLowerCase(),
    args.accountId ?? '',
    args.canonicalAssetKey ?? '',
    args.row.assetIsin ?? '',
    args.row.brokerSymbol ?? args.row.assetSymbol,
    args.row.exchange ?? '',
    args.row.date,
    normalizeNumberFingerprintPart(args.row.qty),
    normalizeNumberFingerprintPart(args.row.price),
    normalizeIdentityCurrency(args.row.currency) ?? args.row.currency,
    (args.row.note ?? '').trim(),
  ].join('|');

const buildSourceContext = (
  row: {
    sourceAdapterId?: ImportSourceAuditFields['sourceAdapterId'];
    sourceSection?: string;
    sourceSignature?: string;
    sourceRowRef?: string;
    sourceOrderType?: string;
    assetSymbol?: string;
    assetIsin?: string;
    brokerSymbol?: string;
    exchange?: string;
    assetName?: string;
    currency: string;
    resolutionStatus?: AssetResolutionStatus;
    resolutionReason?: string;
    matchStrategy?: Asset['identityStrategy'];
  },
  options?: ImportExecutionOptions,
): ImportSourceContextInput => ({
  sourceProfile: options?.sourceProfile ?? 'custom',
  sourceAdapterId: row.sourceAdapterId ?? options?.sourceContext?.sourceAdapterId,
  sourceTemplateId: options?.sourceContext?.sourceTemplateId,
  sourceSection: row.sourceSection ?? options?.sourceContext?.sourceSection,
  sourceSignature: row.sourceSignature ?? options?.sourceContext?.sourceSignature,
  sourceRowRef: row.sourceRowRef ?? options?.sourceContext?.sourceRowRef,
  sourceOrderType: row.sourceOrderType ?? options?.sourceContext?.sourceOrderType,
  sourceTicker: row.assetSymbol,
  sourceBrokerSymbol: row.brokerSymbol,
  sourceExchange: row.exchange,
  sourceIsin: row.assetIsin ?? options?.sourceContext?.sourceIsin,
  sourceName: row.assetName,
  sourceCurrency: row.currency,
  resolutionStatus: row.resolutionStatus,
  resolutionReason: row.resolutionReason,
  matchStrategy: row.matchStrategy,
  sourceRaw: options?.sourceContext?.sourceRaw,
});

const buildBatchSourceContext = (
  options?: ImportExecutionOptions,
): ImportSourceContextInput => ({
  sourceProfile: options?.sourceProfile ?? 'custom',
  sourceAdapterId: options?.sourceContext?.sourceAdapterId,
  sourceTemplateId: options?.sourceContext?.sourceTemplateId,
  sourceSection: options?.sourceContext?.sourceSection,
  sourceSignature: options?.sourceContext?.sourceSignature,
  sourceRowRef: options?.sourceContext?.sourceRowRef,
  sourceOrderType: options?.sourceContext?.sourceOrderType,
  sourceBrokerSymbol: options?.sourceContext?.sourceBrokerSymbol,
  sourceExchange: options?.sourceContext?.sourceExchange,
  sourceIsin: options?.sourceContext?.sourceIsin,
  sourceName: options?.sourceContext?.sourceName,
  sourceCurrency: options?.sourceContext?.sourceCurrency,
  resolutionStatus: options?.sourceContext?.resolutionStatus,
  resolutionReason: options?.sourceContext?.resolutionReason,
  matchStrategy: options?.sourceContext?.matchStrategy,
  sourceRaw: options?.sourceContext?.sourceRaw,
});

const buildSnapshotSourceContext = (
  snapshot: PositionSnapshotInput & Partial<ImportSourceContextInput>,
  options?: ImportExecutionOptions,
): ImportSourceContextInput => ({
  sourceProfile: snapshot.sourceProfile ?? options?.sourceProfile ?? 'custom',
  sourceAdapterId: snapshot.sourceAdapterId ?? options?.sourceContext?.sourceAdapterId,
  sourceTemplateId: snapshot.sourceTemplateId ?? options?.sourceContext?.sourceTemplateId,
  sourceSection: snapshot.sourceSection ?? options?.sourceContext?.sourceSection,
  sourceSignature: snapshot.sourceSignature ?? options?.sourceContext?.sourceSignature,
  sourceRowRef: snapshot.sourceRowRef ?? options?.sourceContext?.sourceRowRef,
  sourceOrderType: snapshot.sourceOrderType ?? options?.sourceContext?.sourceOrderType,
  sourceTicker: snapshot.sourceTicker,
  sourceBrokerSymbol:
    snapshot.sourceBrokerSymbol ?? options?.sourceContext?.sourceBrokerSymbol,
  sourceExchange: snapshot.sourceExchange ?? options?.sourceContext?.sourceExchange,
  sourceIsin: snapshot.sourceIsin ?? options?.sourceContext?.sourceIsin,
  sourceName: snapshot.sourceName,
  sourceCurrency: snapshot.sourceCurrency ?? snapshot.currency,
  resolutionStatus: snapshot.resolutionStatus ?? options?.sourceContext?.resolutionStatus,
  resolutionReason: snapshot.resolutionReason ?? options?.sourceContext?.resolutionReason,
  matchStrategy: snapshot.matchStrategy ?? options?.sourceContext?.matchStrategy,
  sourceRaw: snapshot.sourceRaw ?? options?.sourceContext?.sourceRaw,
});

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
  sourceAdapterId: args.options.sourceContext?.sourceAdapterId,
  sourceTemplateId: args.options.sourceContext?.sourceTemplateId,
  sourceSection: args.options.sourceContext?.sourceSection,
  sourceSignature: args.options.sourceContext?.sourceSignature,
  sourceRowRef: args.options.sourceContext?.sourceRowRef,
  sourceTicker: args.options.sourceContext?.sourceTicker,
  sourceBrokerSymbol: args.options.sourceContext?.sourceBrokerSymbol,
  sourceExchange: args.options.sourceContext?.sourceExchange,
  sourceIsin: args.options.sourceContext?.sourceIsin,
  sourceName: args.options.sourceContext?.sourceName,
  sourceCurrency: args.options.sourceContext?.sourceCurrency,
  resolutionStatus: args.options.sourceContext?.resolutionStatus,
  resolutionReason: args.options.sourceContext?.resolutionReason,
  matchStrategy: args.options.sourceContext?.matchStrategy,
  sourceRaw: args.options.sourceContext?.sourceRaw,
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

const syncResolvedAsset = (args: {
  asset: Asset;
  assetUpdates?: Partial<Asset>;
  existingAssets: Asset[];
}) => {
  if (!args.assetUpdates || Object.keys(args.assetUpdates).length === 0) {
    return args.asset;
  }

  const nextAsset = {
    ...args.asset,
    ...args.assetUpdates,
  };
  const assetIndex = args.existingAssets.findIndex((asset) => asset.id === args.asset.id);
  if (assetIndex >= 0) {
    args.existingAssets[assetIndex] = nextAsset;
  }
  return nextAsset;
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
    const updatedAssets = new Map<string, Asset>();
    const priceKeySet = new Set<string>();
    const rowFingerprintSet = new Set<string>();
    const sourceRowRefSet = new Set<string>();
    let duplicateExistingCount = 0;
    let unresolvedCount = 0;
    let ambiguousCount = 0;
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
            rows.map((row, index) => {
              const sourceContext = buildSourceContext(row, options);
              return {
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
                ...sourceContext,
                createdAt: timestamp + index,
              };
            }),
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

      importJobId = options ? createId('import_job') : null;

      for (const row of rows) {
        const rowNumber = importRows.length + 1;
        const importRowId = importJobId ? buildImportRowId(importJobId, rowNumber) : undefined;
        const rawFingerprint = buildTransactionFingerprint(row);

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
        let canonicalFingerprint = '';
        let resolutionStatus: AssetResolutionStatus | undefined;
        let resolutionReason: string | undefined;
        let matchStrategy: Asset['identityStrategy'] | undefined;
        let duplicateOfImportRowId: string | undefined;
        const isRecognizedImport = Boolean(row.sourceAdapterId);
        const scopedSourceRowKey = buildScopedSourceRowKey(
          row.sourceAdapterId,
          row.sourceRowRef,
          account.id,
        );

        if (row.assetSymbol || row.assetIsin || row.brokerSymbol) {
          const resolution = resolveImportedAsset({
            existingAssets,
            input: {
              assetName: row.assetName,
              assetSymbol: row.assetSymbol,
              brokerSymbol: row.brokerSymbol,
              exchange: row.exchange,
              assetIsin: row.assetIsin,
              assetType: row.assetType,
              currency: row.currency,
              platform: row.platform,
            },
            createId,
            timestamp,
            allowLegacyLooseMatch: !isRecognizedImport,
          });
          resolutionStatus = resolution.status;
          resolutionReason = resolution.resolutionReason;
          matchStrategy = resolution.identityStrategy;
          canonicalFingerprint = buildCanonicalTransactionFingerprint({
            row,
            canonicalAssetKey: resolution.canonicalAssetKey,
            accountId: account.id,
          });

          if (resolution.status === 'AMBIGUOUS') {
            ambiguousCount += 1;
            const sourceContext = buildSourceContext(
              {
                ...row,
                resolutionStatus,
                resolutionReason,
                matchStrategy,
              },
              options,
            );
            importRows.push({
              id: importRowId ?? createId('import_row'),
              importJobId: importJobId ?? 'legacy_import',
              rowNumber,
              fingerprint: rawFingerprint,
              canonicalFingerprint,
              status: 'AMBIGUOUS_ASSET',
              date: row.date,
              platformName: row.platform,
              accountName: account.name,
              assetSymbol: row.assetSymbol,
              kind: row.kind,
              qty: row.qty,
              currency: row.cashCurrency ?? row.currency,
              message: resolutionReason,
              ...sourceContext,
              createdAt: timestamp + importRows.length,
            });
            continue;
          }

          if (resolution.status === 'UNRESOLVED') {
            unresolvedCount += 1;
            const sourceContext = buildSourceContext(
              {
                ...row,
                resolutionStatus,
                resolutionReason,
                matchStrategy,
              },
              options,
            );
            importRows.push({
              id: importRowId ?? createId('import_row'),
              importJobId: importJobId ?? 'legacy_import',
              rowNumber,
              fingerprint: rawFingerprint,
              canonicalFingerprint,
              status: 'UNRESOLVED_ASSET',
              date: row.date,
              platformName: row.platform,
              accountName: account.name,
              assetSymbol: row.assetSymbol,
              kind: row.kind,
              qty: row.qty,
              currency: row.cashCurrency ?? row.currency,
              message: resolutionReason,
              ...sourceContext,
              createdAt: timestamp + importRows.length,
            });
            continue;
          }

          if (resolution.asset) {
            asset = syncResolvedAsset({
              asset: resolution.asset,
              assetUpdates: resolution.assetUpdates,
              existingAssets,
            });
            if (resolution.assetUpdates && Object.keys(resolution.assetUpdates).length > 0) {
              updatedAssets.set(asset.id, asset);
            }
          } else if (resolution.createAsset) {
            asset = resolution.createAsset;
            existingAssets.push(asset);
            assetsCreated.push(asset);
          }
        }

        canonicalFingerprint =
          canonicalFingerprint ||
          buildCanonicalTransactionFingerprint({
            row,
            canonicalAssetKey: asset ? getAssetCanonicalKey(asset) : undefined,
            accountId: account.id,
          });

        const isDuplicateInFile = rowFingerprintSet.has(canonicalFingerprint);
        const isDuplicateSourceRowInFile =
          !isDuplicateInFile && scopedSourceRowKey ? sourceRowRefSet.has(scopedSourceRowKey) : false;
        let isDuplicateExisting = false;
        if (!isDuplicateInFile && !isDuplicateSourceRowInFile && row.sourceAdapterId && row.sourceRowRef) {
          const existingImportRow = await db.importRows
            .where('[sourceAdapterId+sourceRowRef]')
            .equals([row.sourceAdapterId, row.sourceRowRef])
            .filter(
              (importRow) =>
                importRow.accountName === account.name &&
                (importRow.status === 'IMPORTED' ||
                  importRow.status === 'MERGED_IN_FILE' ||
                  importRow.status === 'IMPLICIT_CLOSE'),
            )
            .first();
          if (existingImportRow) {
            isDuplicateExisting = true;
            duplicateExistingCount += 1;
            duplicateOfImportRowId = existingImportRow.id;
          }
        }
        if (!isDuplicateInFile && !isDuplicateSourceRowInFile && !isDuplicateExisting && canonicalFingerprint) {
          const existingImportRow = await db.importRows
            .where('canonicalFingerprint')
            .equals(canonicalFingerprint)
            .filter(
              (importRow) =>
                importRow.status === 'IMPORTED' ||
                importRow.status === 'MERGED_IN_FILE' ||
                importRow.status === 'IMPLICIT_CLOSE',
            )
            .first();
          if (existingImportRow) {
            isDuplicateExisting = true;
            duplicateExistingCount += 1;
            duplicateOfImportRowId = existingImportRow.id;
          }
        }

        const sourceContext = buildSourceContext(
          {
            ...row,
            resolutionStatus: resolutionStatus ?? (asset ? 'RESOLVED' : undefined),
            resolutionReason,
            matchStrategy,
          },
          options,
        );

        importRows.push({
          id: importRowId ?? createId('import_row'),
          importJobId: importJobId ?? 'legacy_import',
          rowNumber,
          fingerprint: rawFingerprint,
          canonicalFingerprint,
          status: isDuplicateInFile
            ? 'DUPLICATE_IN_FILE'
            : isDuplicateSourceRowInFile
            ? 'DUPLICATE_IN_FILE'
            : isDuplicateExisting
              ? 'SKIPPED_DUPLICATE_EXISTING'
              : 'IMPORTED',
          date: row.date,
          platformName: row.platform,
          accountName: account.name,
          assetSymbol: row.assetSymbol,
          resolvedAssetId: asset?.id,
          duplicateOfImportRowId,
          kind: row.kind,
          qty: row.qty,
          currency: row.cashCurrency ?? row.currency,
          message: isDuplicateInFile
            ? 'Duplicate row inside the same file.'
            : isDuplicateSourceRowInFile
              ? 'Duplicate source row reference inside the same file.'
            : isDuplicateExisting
              ? 'Skipped because an equivalent row was already imported from another file.'
              : resolutionReason,
          ...sourceContext,
          createdAt: timestamp + importRows.length,
        });
        rowFingerprintSet.add(canonicalFingerprint);
        if (scopedSourceRowKey) {
          sourceRowRefSet.add(scopedSourceRowKey);
        }

        // Keep duplicate rows in the audit trail, but never persist them as
        // transactions or price points. Otherwise one bad CSV line duplicates
        // both holdings and valuation inputs.
        if (isDuplicateInFile || isDuplicateSourceRowInFile || isDuplicateExisting) {
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
          fingerprint: canonicalFingerprint,
          ...sourceContext,
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
              ...sourceContext,
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
      const assetsToPersist = Array.from(
        new Map(
          [...assetsCreated, ...updatedAssets.values()].map((asset) => [asset.id, asset]),
        ).values(),
      );
      if (assetsToPersist.length) {
        await db.assets.bulkPut(assetsToPersist);
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
            parsedRowCount: transactionsToCreate.length,
            errorCount: importRows.filter(
              (row) =>
                row.status === 'UNRESOLVED_ASSET' ||
                row.status === 'AMBIGUOUS_ASSET' ||
                row.status === 'ERROR',
            ).length,
            duplicateRowCount: importRows.filter(
              (row) =>
                row.status === 'DUPLICATE_IN_FILE' ||
                row.status === 'SKIPPED_DUPLICATE_EXISTING',
            ).length,
            summary: `${transactionsToCreate.length} transaction(s) imported successfully, ${duplicateExistingCount} duplicate(s) skipped, ${unresolvedCount} unresolved row(s), ${ambiguousCount} ambiguous row(s).`,
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
      duplicateExistingCount,
      unresolvedCount,
      ambiguousCount,
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
    const updatedAssets = new Map<string, Asset>();
    const importRows: ImportRow[] = [];
    let importedSnapshotCount = 0;
    let implicitClosureCount = 0;
    let syntheticTransactionCount = 0;
    let duplicateExistingCount = 0;
    let unresolvedCount = 0;
    let ambiguousCount = 0;
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
            rows.map((row, index) => {
              const sourceContext = buildSourceContext(row, options);
              return {
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
                ...sourceContext,
                createdAt: timestamp + index,
              };
            }),
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

      importJobId = options ? createId('import_job') : null;

      const snapshotInputs: Array<PositionSnapshotInput & ImportSourceContextInput> = [];
      const rowFingerprintSet = new Set<string>();
      const sourceRowRefSet = new Set<string>();
      const mergedSnapshotScopeKeys = new Set<string>();
      for (const row of rows) {
        const rowNumber = importRows.length + 1;
        const importRowId = importJobId ? buildImportRowId(importJobId, rowNumber) : undefined;
        const rawFingerprint = buildSnapshotFingerprint(row);
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

        const resolution = resolveImportedAsset({
          existingAssets,
          input: {
            assetName: row.assetName,
            assetSymbol: row.assetSymbol,
            brokerSymbol: row.brokerSymbol,
            exchange: row.exchange,
            assetIsin: row.assetIsin,
            assetType: row.assetType,
            currency: row.currency,
            platform: row.platform,
          },
          createId,
          timestamp,
          allowLegacyLooseMatch: !row.sourceAdapterId,
        });
        const canonicalFingerprint = buildCanonicalSnapshotFingerprint({
          row,
          canonicalAssetKey: resolution.canonicalAssetKey,
          accountId: account.id,
        });
        const sourceContext = buildSourceContext(
          {
            ...row,
            resolutionStatus: resolution.status,
            resolutionReason: resolution.resolutionReason,
            matchStrategy: resolution.identityStrategy,
          },
          options,
        );

        if (resolution.status === 'AMBIGUOUS') {
          ambiguousCount += 1;
          importRows.push({
            id: importRowId ?? createId('import_row'),
            importJobId: importJobId ?? 'legacy_import',
            rowNumber,
            fingerprint: rawFingerprint,
            canonicalFingerprint,
            status: 'AMBIGUOUS_ASSET',
            date: row.date,
            platformName: row.platform,
            accountName: account.name,
            assetSymbol: row.assetSymbol,
            qty: row.qty,
            currency: row.currency,
            message: resolution.resolutionReason,
            ...sourceContext,
            createdAt: timestamp + importRows.length,
          });
          continue;
        }

        if (resolution.status === 'UNRESOLVED') {
          unresolvedCount += 1;
          importRows.push({
            id: importRowId ?? createId('import_row'),
            importJobId: importJobId ?? 'legacy_import',
            rowNumber,
            fingerprint: rawFingerprint,
            canonicalFingerprint,
            status: 'UNRESOLVED_ASSET',
            date: row.date,
            platformName: row.platform,
            accountName: account.name,
            assetSymbol: row.assetSymbol,
            qty: row.qty,
            currency: row.currency,
            message: resolution.resolutionReason,
            ...sourceContext,
            createdAt: timestamp + importRows.length,
          });
          continue;
        }

        let asset = resolution.asset;
        if (asset) {
          asset = syncResolvedAsset({
            asset,
            assetUpdates: resolution.assetUpdates,
            existingAssets,
          });
          if (resolution.assetUpdates && Object.keys(resolution.assetUpdates).length > 0) {
            updatedAssets.set(asset.id, asset);
          }
        } else if (resolution.createAsset) {
          asset = resolution.createAsset;
          existingAssets.push(asset);
          assetsCreated.push(asset);
        }

        if (!asset) {
          unresolvedCount += 1;
          importRows.push({
            id: importRowId ?? createId('import_row'),
            importJobId: importJobId ?? 'legacy_import',
            rowNumber,
            fingerprint: rawFingerprint,
            canonicalFingerprint,
            status: 'UNRESOLVED_ASSET',
            date: row.date,
            platformName: row.platform,
            accountName: account.name,
            assetSymbol: row.assetSymbol,
            qty: row.qty,
            currency: row.currency,
            message: 'Asset could not be resolved.',
            ...sourceContext,
            createdAt: timestamp + importRows.length,
          });
          continue;
        }

        const targetSnapshotId = buildPositionSnapshotId(
          platform.id,
          asset.id,
          row.date,
          account.id,
        );
        const isDuplicateInFile = rowFingerprintSet.has(canonicalFingerprint);
        const scopedSourceRowKey = buildScopedSourceRowKey(
          row.sourceAdapterId,
          row.sourceRowRef,
          account.id,
        );
        const isDuplicateSourceRowInFile =
          !isDuplicateInFile && scopedSourceRowKey ? sourceRowRefSet.has(scopedSourceRowKey) : false;
        const isMergedInFile = !isDuplicateInFile && mergedSnapshotScopeKeys.has(targetSnapshotId);
        let isDuplicateExisting = false;
        let duplicateOfImportRowId: string | undefined;
        if (
          !isDuplicateInFile &&
          !isDuplicateSourceRowInFile &&
          !isMergedInFile &&
          row.sourceAdapterId &&
          row.sourceRowRef
        ) {
          const existingImportRow = await db.importRows
            .where('[sourceAdapterId+sourceRowRef]')
            .equals([row.sourceAdapterId, row.sourceRowRef])
            .filter(
              (importRow) =>
                importRow.accountName === account.name &&
                (importRow.status === 'IMPORTED' ||
                  importRow.status === 'MERGED_IN_FILE' ||
                  importRow.status === 'IMPLICIT_CLOSE'),
            )
            .first();
          if (existingImportRow) {
            isDuplicateExisting = true;
            duplicateExistingCount += 1;
            duplicateOfImportRowId = existingImportRow.id;
          }
        }
        if (!isDuplicateInFile && !isDuplicateSourceRowInFile && !isMergedInFile && !isDuplicateExisting && canonicalFingerprint) {
          const existingImportRow = await db.importRows
            .where('canonicalFingerprint')
            .equals(canonicalFingerprint)
            .filter(
              (importRow) =>
                importRow.status === 'IMPORTED' ||
                importRow.status === 'MERGED_IN_FILE' ||
                importRow.status === 'IMPLICIT_CLOSE',
            )
            .first();
          if (existingImportRow) {
            isDuplicateExisting = true;
            duplicateExistingCount += 1;
            duplicateOfImportRowId = existingImportRow.id;
          }
        }

        importRows.push({
          id: importRowId ?? createId('import_row'),
          importJobId: importJobId ?? 'legacy_import',
          rowNumber,
          fingerprint: rawFingerprint,
          canonicalFingerprint,
          status: isDuplicateInFile
            ? 'DUPLICATE_IN_FILE'
            : isDuplicateSourceRowInFile
              ? 'DUPLICATE_IN_FILE'
            : isMergedInFile
              ? 'MERGED_IN_FILE'
              : isDuplicateExisting
                ? 'SKIPPED_DUPLICATE_EXISTING'
                : 'IMPORTED',
          date: row.date,
          platformName: row.platform,
          accountName: account.name,
          assetSymbol: row.assetSymbol,
          resolvedAssetId: asset.id,
          duplicateOfImportRowId,
          qty: row.qty,
          currency: row.currency,
          message: isDuplicateInFile
            ? 'Duplicate row inside the same file.'
            : isDuplicateSourceRowInFile
              ? 'Duplicate source row reference inside the same file.'
            : isMergedInFile
              ? 'Merged into another snapshot row with the same platform, account, asset, and date.'
              : isDuplicateExisting
                ? 'Skipped because an equivalent snapshot row was already imported from another file.'
                : resolution.resolutionReason,
          ...sourceContext,
          createdAt: timestamp + importRows.length,
        });
        rowFingerprintSet.add(canonicalFingerprint);
        if (scopedSourceRowKey) {
          sourceRowRefSet.add(scopedSourceRowKey);
        }
        mergedSnapshotScopeKeys.add(targetSnapshotId);

        if (isDuplicateInFile || isDuplicateSourceRowInFile || isDuplicateExisting) {
          continue;
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
          sourceBrokerSymbol: row.brokerSymbol,
          sourceExchange: row.exchange,
          sourceIsin: row.assetIsin,
          resolutionStatus: resolution.status,
          resolutionReason: resolution.resolutionReason,
          matchStrategy: resolution.identityStrategy,
          ...sourceContext,
        });
      }

      const importedSnapshotInputs = collapsePositionSnapshotInputs(
        snapshotInputs,
      ) as Array<PositionSnapshotInput & ImportSourceContextInput>;

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
      ].map((snapshot, index) => {
        const sourceContext = buildSnapshotSourceContext(snapshot, options);
        return {
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
          ...sourceContext,
          createdAt: timestamp + index,
        };
      });

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
        ...buildBatchSourceContext(options),
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
          const sourceContext = buildSnapshotSourceContext(snapshot, options);
          priceSnapshotMap.set(buildPositionSnapshotPriceId(snapshot.assetId, snapshot.date), {
            id: buildPositionSnapshotPriceId(snapshot.assetId, snapshot.date),
            assetId: snapshot.assetId,
            date: snapshot.date,
            price: snapshot.price!,
            currency: snapshot.currency,
            importJobId: importJobId ?? undefined,
            ...sourceContext,
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
      const assetsToPersist = Array.from(
        new Map(
          [...assetsCreated, ...updatedAssets.values()].map((asset) => [asset.id, asset]),
        ).values(),
      );
      if (assetsToPersist.length) {
        await db.assets.bulkPut(assetsToPersist);
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
        const syntheticImportRows: ImportRow[] = implicitZeroInputs.map((snapshot, index) => ({
          id: buildImportRowId(importJobId!, rows.length + index + 1),
          importJobId: importJobId!,
          rowNumber: rows.length + index + 1,
          fingerprint: `${snapshot.platformId}|${snapshot.accountId ?? ''}|${snapshot.assetId}|${snapshot.date}|0`,
          canonicalFingerprint: `${snapshot.platformId}|${snapshot.accountId ?? ''}|${snapshot.assetId}|${snapshot.date}|0`,
          status: 'IMPLICIT_CLOSE',
          date: snapshot.date,
          platformName:
            existingPlatforms.find((platform) => platform.id === snapshot.platformId)?.name ??
            platformsCreated.find((platform) => platform.id === snapshot.platformId)?.name,
          accountName:
            existingAccounts.find((account) => account.id === snapshot.accountId)?.name,
          resolvedAssetId: snapshot.assetId,
          qty: 0,
          currency: snapshot.currency,
          message: snapshot.note ?? 'Implicit close from monthly snapshot import.',
          createdAt: timestamp + rows.length + index,
        }));
        await db.importJobs.add(
          buildImportJob({
            id: importJobId,
            mode: 'monthly_positions',
            status: 'IMPORTED',
            options,
            rowCount: rows.length,
            parsedRowCount: importedSnapshotCount,
            errorCount: importRows.filter(
              (row) =>
                row.status === 'UNRESOLVED_ASSET' ||
                row.status === 'AMBIGUOUS_ASSET' ||
                row.status === 'ERROR',
            ).length,
            duplicateRowCount: importRows.filter(
              (row) =>
                row.status === 'DUPLICATE_IN_FILE' ||
                row.status === 'SKIPPED_DUPLICATE_EXISTING',
            ).length,
            summary: `${importedSnapshotCount} snapshot(s) imported, ${implicitClosureCount} implicit close(s), ${duplicateExistingCount} duplicate(s) skipped, ${unresolvedCount} unresolved row(s), ${ambiguousCount} ambiguous row(s).`,
            importedAt: timestamp,
            platformId: snapshotsToUpsert[0]?.platformId,
            accountId: snapshotsToUpsert[0]?.accountId,
          }),
        );
        await db.importRows.bulkPut([...importRows, ...syntheticImportRows]);
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
      duplicateExistingCount,
      unresolvedCount,
      ambiguousCount,
      duplicateSkipped,
    };
  },
};
