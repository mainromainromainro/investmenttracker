import { describe, expect, it } from 'vitest';
import { getPositionTransactions, sortHoldingsByQuantity } from './dashboardAnalytics';
import { Transaction, TickerHolding } from '../../types';

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

  it('sorts holdings by quantity before value', () => {
    const holdings: TickerHolding[] = [
      {
        assetId: 'asset_1',
        asset: {
          id: 'asset_1',
          type: 'STOCK',
          symbol: 'AAA',
          name: 'AAA',
          currency: 'EUR',
          createdAt: 1,
        },
        qty: 2,
        latestPrice: 10,
        latestPriceDate: 1,
        currency: 'EUR',
        fxRate: 1,
        costBasisEUR: 20,
        averageCost: 10,
        unrealizedPnlEUR: 0,
        unrealizedPnlPct: 0,
        dividendIncomeEUR: 0,
        hasKnownCostBasis: true,
        valueEUR: 20,
      },
      {
        assetId: 'asset_2',
        asset: {
          id: 'asset_2',
          type: 'STOCK',
          symbol: 'BBB',
          name: 'BBB',
          currency: 'EUR',
          createdAt: 1,
        },
        qty: 10,
        latestPrice: 1,
        latestPriceDate: 1,
        currency: 'EUR',
        fxRate: 1,
        costBasisEUR: 10,
        averageCost: 1,
        unrealizedPnlEUR: 0,
        unrealizedPnlPct: 0,
        dividendIncomeEUR: 0,
        hasKnownCostBasis: true,
        valueEUR: 10,
      },
    ];

    expect(sortHoldingsByQuantity(holdings).map((holding) => holding.asset.symbol)).toEqual([
      'BBB',
      'AAA',
    ]);
  });
});
