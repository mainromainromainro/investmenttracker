import { PositionSnapshot, Transaction } from '../types';

export interface PositionSnapshotInput {
  platformId: string;
  assetId: string;
  date: number;
  qty: number;
  price?: number;
  currency: string;
  note?: string;
}

const POSITION_EPSILON = 1e-8;

export const POSITION_SNAPSHOT_ID_PREFIX = '__position_snapshot__';
export const POSITION_SNAPSHOT_TRANSACTION_ID_PREFIX = '__position_snapshot_tx__';
export const POSITION_SNAPSHOT_PRICE_ID_PREFIX = '__position_snapshot_price__';

const buildPairKey = (platformId: string, assetId: string) => `${platformId}:${assetId}`;

const normalizeQty = (value: number) => {
  if (Math.abs(value) <= POSITION_EPSILON) {
    return 0;
  }
  return Number(value.toFixed(8));
};

const formatQty = (value: number) => {
  const normalized = normalizeQty(value).toFixed(8);
  return normalized.replace(/\.?0+$/, '');
};

const getCreatedAt = (snapshot: PositionSnapshotInput | PositionSnapshot) =>
  'createdAt' in snapshot ? snapshot.createdAt : undefined;

export const buildPositionSnapshotId = (
  platformId: string,
  assetId: string,
  date: number,
) => `${POSITION_SNAPSHOT_ID_PREFIX}:${platformId}:${assetId}:${date}`;

export const buildPositionSnapshotTransactionId = (
  platformId: string,
  assetId: string,
  date: number,
) => `${POSITION_SNAPSHOT_TRANSACTION_ID_PREFIX}:${platformId}:${assetId}:${date}`;

export const buildPositionSnapshotPriceId = (
  assetId: string,
  date: number,
) => `${POSITION_SNAPSHOT_PRICE_ID_PREFIX}:${assetId}:${date}`;

export const isPositionSnapshotTransaction = (
  transaction: Pick<Transaction, 'id' | 'source'>,
) =>
  transaction.source === 'POSITION_SNAPSHOT' ||
  transaction.id.startsWith(POSITION_SNAPSHOT_TRANSACTION_ID_PREFIX);

export const collapsePositionSnapshotInputs = (
  inputs: PositionSnapshotInput[],
): PositionSnapshotInput[] => {
  const merged = new Map<string, PositionSnapshotInput>();

  for (const input of inputs) {
    const key = buildPositionSnapshotId(input.platformId, input.assetId, input.date);
    const normalizedQty = normalizeQty(input.qty);
    const existing = merged.get(key);

    if (!existing) {
      merged.set(key, {
        ...input,
        qty: normalizedQty,
      });
      continue;
    }

    const nextQty = normalizeQty(existing.qty + normalizedQty);
    let nextPrice = existing.price;
    if (input.price !== undefined) {
      if (nextPrice === undefined) {
        nextPrice = input.price;
      } else {
        const totalWeight = Math.abs(existing.qty) + Math.abs(normalizedQty);
        nextPrice =
          totalWeight <= POSITION_EPSILON
            ? input.price
            : (
                (nextPrice * Math.abs(existing.qty) +
                  input.price * Math.abs(normalizedQty)) /
                totalWeight
              );
      }
    }

    merged.set(key, {
      ...existing,
      qty: nextQty,
      price: nextPrice,
      currency: input.currency || existing.currency,
      note: input.note ?? existing.note,
    });
  }

  return Array.from(merged.values()).sort((a, b) => {
    if (a.platformId !== b.platformId) {
      return a.platformId.localeCompare(b.platformId);
    }
    if (a.date !== b.date) {
      return a.date - b.date;
    }
    return a.assetId.localeCompare(b.assetId);
  });
};

export const buildImplicitZeroPositionSnapshots = (
  existingSnapshots: Array<PositionSnapshotInput | PositionSnapshot>,
  importedSnapshots: PositionSnapshotInput[],
): PositionSnapshotInput[] => {
  const collapsedImports = collapsePositionSnapshotInputs(importedSnapshots);
  const groupedImports = new Map<string, PositionSnapshotInput[]>();

  for (const snapshot of collapsedImports) {
    const key = `${snapshot.platformId}:${snapshot.date}`;
    const group = groupedImports.get(key);
    if (group) {
      group.push(snapshot);
    } else {
      groupedImports.set(key, [snapshot]);
    }
  }

  const existingByPlatform = new Map<string, PositionSnapshotInput[]>();
  for (const snapshot of existingSnapshots) {
    const normalized: PositionSnapshotInput = {
      platformId: snapshot.platformId,
      assetId: snapshot.assetId,
      date: snapshot.date,
      qty: normalizeQty(snapshot.qty),
      price: snapshot.price,
      currency: snapshot.currency,
      note: snapshot.note,
    };
    const list = existingByPlatform.get(normalized.platformId);
    if (list) {
      list.push(normalized);
    } else {
      existingByPlatform.set(normalized.platformId, [normalized]);
    }
  }

  for (const snapshots of existingByPlatform.values()) {
    snapshots.sort((a, b) => {
      if (a.date !== b.date) {
        return a.date - b.date;
      }
      return a.assetId.localeCompare(b.assetId);
    });
  }

  const platformState = new Map<
    string,
    {
      cursor: number;
      existing: PositionSnapshotInput[];
      latestByAsset: Map<string, PositionSnapshotInput>;
    }
  >();

  const implicitZeros: PositionSnapshotInput[] = [];
  const importGroups = Array.from(groupedImports.values()).sort((a, b) => {
    const firstA = a[0]!;
    const firstB = b[0]!;
    if (firstA.platformId !== firstB.platformId) {
      return firstA.platformId.localeCompare(firstB.platformId);
    }
    return firstA.date - firstB.date;
  });

  for (const group of importGroups) {
    const platformId = group[0]!.platformId;
    const date = group[0]!.date;

    let state = platformState.get(platformId);
    if (!state) {
      state = {
        cursor: 0,
        existing: existingByPlatform.get(platformId) ?? [],
        latestByAsset: new Map<string, PositionSnapshotInput>(),
      };
      platformState.set(platformId, state);
    }

    while (
      state.cursor < state.existing.length &&
      state.existing[state.cursor]!.date < date
    ) {
      const snapshot = state.existing[state.cursor]!;
      state.latestByAsset.set(snapshot.assetId, snapshot);
      state.cursor += 1;
    }

    const importedAssetIds = new Set(group.map((snapshot) => snapshot.assetId));
    const zerosForGroup: PositionSnapshotInput[] = [];

    for (const latest of state.latestByAsset.values()) {
      if (latest.date >= date) {
        continue;
      }
      if (normalizeQty(latest.qty) <= POSITION_EPSILON) {
        continue;
      }
      if (importedAssetIds.has(latest.assetId)) {
        continue;
      }

      zerosForGroup.push({
        platformId,
        assetId: latest.assetId,
        date,
        qty: 0,
        currency: latest.currency,
        note: 'Implicit close from monthly snapshot import.',
      });
    }

    for (const snapshot of group) {
      state.latestByAsset.set(snapshot.assetId, snapshot);
    }
    for (const snapshot of zerosForGroup) {
      state.latestByAsset.set(snapshot.assetId, snapshot);
    }

    implicitZeros.push(...zerosForGroup);
  }

  return collapsePositionSnapshotInputs(implicitZeros);
};

const sortSnapshotsForReconciliation = (
  snapshots: Array<PositionSnapshotInput | PositionSnapshot>,
) =>
  [...snapshots].sort((a, b) => {
    if (a.platformId !== b.platformId) {
      return a.platformId.localeCompare(b.platformId);
    }
    if (a.assetId !== b.assetId) {
      return a.assetId.localeCompare(b.assetId);
    }
    if (a.date !== b.date) {
      return a.date - b.date;
    }
    return (getCreatedAt(a) ?? a.date) - (getCreatedAt(b) ?? b.date);
  });

export const buildSyntheticTransactionsFromPositionSnapshots = (
  snapshots: Array<PositionSnapshotInput | PositionSnapshot>,
): Transaction[] => {
  const transactions: Transaction[] = [];
  const previousQtyByPair = new Map<string, number>();

  for (const snapshot of sortSnapshotsForReconciliation(snapshots)) {
    const pairKey = buildPairKey(snapshot.platformId, snapshot.assetId);
    const previousQty = previousQtyByPair.get(pairKey) ?? 0;
    const currentQty = normalizeQty(snapshot.qty);
    const delta = normalizeQty(currentQty - previousQty);

    if (Math.abs(delta) > POSITION_EPSILON) {
      const notePrefix = `Monthly snapshot import. Target qty: ${formatQty(currentQty)}.`;
      transactions.push({
        id: buildPositionSnapshotTransactionId(
          snapshot.platformId,
          snapshot.assetId,
          snapshot.date,
        ),
        platformId: snapshot.platformId,
        assetId: snapshot.assetId,
        kind: delta > 0 ? 'BUY' : 'SELL',
        date: snapshot.date,
        qty: Math.abs(delta),
        price: snapshot.price,
        currency: snapshot.currency,
        note: snapshot.note ? `${notePrefix} ${snapshot.note}` : notePrefix,
        source: 'POSITION_SNAPSHOT',
        createdAt: getCreatedAt(snapshot) ?? snapshot.date,
      });
    }

    previousQtyByPair.set(pairKey, currentQty);
  }

  return transactions;
};
