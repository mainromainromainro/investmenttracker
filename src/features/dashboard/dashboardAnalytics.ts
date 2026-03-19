import { Transaction } from '../../types';

/**
 * Cost basis and P&L must stay scoped to the exact holding container.
 * Two accounts can own the same asset on the same platform without sharing
 * acquisition history.
 */
export const getPositionTransactions = (
  transactions: Transaction[],
  assetId: string,
  platformId: string,
  accountId?: string,
) =>
  transactions
    .filter(
      (transaction) =>
        transaction.assetId === assetId &&
        transaction.platformId === platformId &&
        (accountId === undefined
          ? transaction.accountId === undefined
          : transaction.accountId === accountId),
    )
    .sort((left, right) => left.date - right.date);
