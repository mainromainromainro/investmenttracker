import { Transaction } from '../../types';

type QuantitySortable = {
  qty: number;
  asset: {
    symbol: string;
  };
  valueEUR?: number | null;
};

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

export const sortHoldingsByQuantity = <THolding extends QuantitySortable>(holdings: THolding[]) =>
  [...holdings].sort((left, right) => {
    const leftQty = Math.abs(left.qty);
    const rightQty = Math.abs(right.qty);
    if (leftQty !== rightQty) {
      return rightQty - leftQty;
    }

    const leftValue = left.valueEUR ?? -Infinity;
    const rightValue = right.valueEUR ?? -Infinity;
    if (leftValue !== rightValue) {
      return rightValue - leftValue;
    }

    return left.asset.symbol.localeCompare(right.asset.symbol);
  });
