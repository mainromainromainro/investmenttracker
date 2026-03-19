import { describe, expect, it } from 'vitest';
import { getPositionTransactions } from './dashboardAnalytics';
import { Transaction } from '../../types';

describe('dashboardAnalytics', () => {
  it('keeps same-platform holdings isolated by account when building cost basis inputs', () => {
    const transactions: Transaction[] = [
      {
        id: 'tx_account_a',
        platformId: 'platform_1',
        accountId: 'account_a',
        assetId: 'asset_1',
        kind: 'BUY',
        date: 1,
        qty: 2,
        price: 100,
        currency: 'USD',
        createdAt: 1,
      },
      {
        id: 'tx_account_b',
        platformId: 'platform_1',
        accountId: 'account_b',
        assetId: 'asset_1',
        kind: 'BUY',
        date: 2,
        qty: 5,
        price: 120,
        currency: 'USD',
        createdAt: 2,
      },
    ];

    expect(getPositionTransactions(transactions, 'asset_1', 'platform_1', 'account_a')).toEqual([
      transactions[0],
    ]);
    expect(getPositionTransactions(transactions, 'asset_1', 'platform_1', 'account_b')).toEqual([
      transactions[1],
    ]);
  });

  it('keeps platform-scoped legacy holdings isolated from account-scoped positions', () => {
    const transactions: Transaction[] = [
      {
        id: 'legacy_platform_scope',
        platformId: 'platform_1',
        assetId: 'asset_1',
        kind: 'BUY',
        date: 1,
        qty: 1,
        price: 50,
        currency: 'EUR',
        createdAt: 1,
      },
      {
        id: 'account_scope',
        platformId: 'platform_1',
        accountId: 'account_a',
        assetId: 'asset_1',
        kind: 'BUY',
        date: 2,
        qty: 3,
        price: 55,
        currency: 'EUR',
        createdAt: 2,
      },
    ];

    expect(getPositionTransactions(transactions, 'asset_1', 'platform_1')).toEqual([
      transactions[0],
    ]);
    expect(getPositionTransactions(transactions, 'asset_1', 'platform_1', 'account_a')).toEqual([
      transactions[1],
    ]);
  });
});
