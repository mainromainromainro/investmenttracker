import { Transaction } from '../types';
import { isPositionSnapshotTransaction } from './positionSnapshots';

export interface HoldingsTransactionGroup {
  key: string;
  assetId: string;
  platformId: string;
  accountId?: string;
  transactions: Transaction[];
  qty: number;
}

export interface HoldingsSummary {
  positions: HoldingsTransactionGroup[];
}

const PLATFORM_SCOPE_ACCOUNT_ID = '__platform__';

const buildPairKey = (assetId: string, platformId: string, accountId?: string) =>
  `${assetId}:${platformId}:${accountId ?? PLATFORM_SCOPE_ACCOUNT_ID}`;

const sortTransactionsForHoldings = (left: Transaction, right: Transaction) => {
  if (left.date !== right.date) return left.date - right.date;
  if (left.createdAt !== right.createdAt) return left.createdAt - right.createdAt;
  return left.id.localeCompare(right.id);
};

const snapshotManagedPairKeys = (transactions: Transaction[]): Set<string> => {
  const pairs = new Set<string>();

  for (const transaction of transactions) {
    if (!transaction.assetId || !isPositionSnapshotTransaction(transaction)) {
      continue;
    }
    pairs.add(buildPairKey(transaction.assetId, transaction.platformId, transaction.accountId));
  }

  return pairs;
};

export const getTransactionQuantityDelta = (transaction: Transaction): number => {
  const qty = transaction.qty ?? 0;

  switch (transaction.kind) {
    case 'BUY':
    case 'TRANSFER_IN':
    case 'STAKING_REWARD':
    case 'AIRDROP':
      return qty;
    case 'SELL':
    case 'TRANSFER_OUT':
      return -qty;
    default:
      return 0;
  }
};

export const filterAuthoritativeHoldingsTransactions = (transactions: Transaction[]): Transaction[] => {
  const managedPairs = snapshotManagedPairKeys(transactions);
  if (managedPairs.size === 0) {
    return transactions;
  }

  return transactions.filter((transaction) => {
    if (!transaction.assetId) {
      return true;
    }

    const pairKey = buildPairKey(transaction.assetId, transaction.platformId, transaction.accountId);
    if (!managedPairs.has(pairKey)) {
      return transaction.source !== 'POSITION_SNAPSHOT';
    }

    return transaction.source === 'POSITION_SNAPSHOT';
  });
};

export const computeHoldingsSummary = (transactions: Transaction[]): HoldingsSummary => {
  const authoritativeTransactions = filterAuthoritativeHoldingsTransactions(transactions);
  const groupMap = new Map<string, HoldingsTransactionGroup>();

  for (const transaction of authoritativeTransactions) {
    if (!transaction.assetId) {
      continue;
    }

    const key = buildPairKey(transaction.assetId, transaction.platformId, transaction.accountId);
    let group = groupMap.get(key);
    if (!group) {
      group = {
        key,
        assetId: transaction.assetId,
        platformId: transaction.platformId,
        accountId: transaction.accountId,
        transactions: [],
        qty: 0,
      };
      groupMap.set(key, group);
    }

    group.transactions.push(transaction);
    const delta = getTransactionQuantityDelta(transaction);
    if (delta !== 0) {
      group.qty += delta;
    }
  }

  const positions = Array.from(groupMap.values())
    .map((group) => ({
      ...group,
      transactions: [...group.transactions].sort(sortTransactionsForHoldings),
    }))
    .sort((left, right) => {
      if (left.platformId !== right.platformId) {
        return left.platformId.localeCompare(right.platformId);
      }
      if ((left.accountId ?? '') !== (right.accountId ?? '')) {
        return (left.accountId ?? '').localeCompare(right.accountId ?? '');
      }
      if (left.assetId !== right.assetId) {
        return left.assetId.localeCompare(right.assetId);
      }
      return left.key.localeCompare(right.key);
    });

  return { positions };
};

export const computeHoldingQuantity = (
  transactions: Transaction[],
  assetId: string,
  platformId: string,
  accountId?: string,
): number => {
  const key = buildPairKey(assetId, platformId, accountId);
  const summary = computeHoldingsSummary(transactions);
  return summary.positions.find((position) => position.key === key)?.qty ?? 0;
};
