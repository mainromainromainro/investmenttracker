import { describe, expect, it } from 'vitest';
import { computeHoldingsSummary, getTransactionQuantityDelta } from './holdings';
import { Transaction } from '../types';

describe('holdings', () => {
  it('keeps only position-affecting deltas in the quantity engine', () => {
    const transactions: Transaction[] = [
      {
        id: 'buy',
        platformId: 'p1',
        accountId: 'account_a',
        assetId: 'a1',
        kind: 'BUY',
        date: 1,
        qty: 10,
        price: 100,
        currency: 'EUR',
        createdAt: 1,
      },
      {
        id: 'deposit',
        platformId: 'p1',
        accountId: 'account_a',
        kind: 'DEPOSIT',
        date: 2,
        currency: 'EUR',
        createdAt: 2,
      },
      {
        id: 'dividend',
        platformId: 'p1',
        accountId: 'account_a',
        assetId: 'a1',
        kind: 'DIVIDEND',
        date: 3,
        qty: 1.25,
        currency: 'EUR',
        createdAt: 3,
      },
      {
        id: 'fee',
        platformId: 'p1',
        accountId: 'account_a',
        assetId: 'a1',
        kind: 'FEE',
        date: 4,
        fee: 0.75,
        currency: 'EUR',
        createdAt: 4,
      },
      {
        id: 'sell',
        platformId: 'p1',
        accountId: 'account_a',
        assetId: 'a1',
        kind: 'SELL',
        date: 5,
        qty: 4,
        price: 110,
        currency: 'EUR',
        createdAt: 5,
      },
    ];

    const summary = computeHoldingsSummary(transactions);
    expect(summary.positions).toHaveLength(1);
    expect(summary.positions[0]?.qty).toBe(6);
    expect(getTransactionQuantityDelta(transactions[1]!)).toBe(0);
  });

  it('prefers detailed transactions over POSITION_SNAPSHOT rows for the same holding pair', () => {
    const transactions: Transaction[] = [
      {
        id: 'legacy',
        platformId: 'p1',
        accountId: 'account_a',
        assetId: 'a1',
        kind: 'BUY',
        date: 1,
        qty: 100,
        price: 100,
        currency: 'EUR',
        createdAt: 1,
      },
      {
        id: 'snapshot_buy',
        platformId: 'p1',
        accountId: 'account_a',
        assetId: 'a1',
        kind: 'BUY',
        date: 2,
        qty: 10,
        price: 100,
        currency: 'EUR',
        source: 'POSITION_SNAPSHOT',
        createdAt: 2,
      },
      {
        id: 'snapshot_sell',
        platformId: 'p1',
        accountId: 'account_a',
        assetId: 'a1',
        kind: 'SELL',
        date: 3,
        qty: 4,
        price: 100,
        currency: 'EUR',
        source: 'POSITION_SNAPSHOT',
        createdAt: 3,
      },
    ];

    const summary = computeHoldingsSummary(transactions);
    expect(summary.positions).toHaveLength(1);
    expect(summary.positions[0]?.qty).toBe(100);
    expect(summary.positions[0]?.transactions).toHaveLength(1);
  });
});
