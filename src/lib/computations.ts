import {
  Account,
  Asset,
  Transaction,
  PriceSnapshot,
  FxSnapshot,
  Position,
  PortfolioSummary,
  Platform,
  PortfolioHistoryPoint,
  TickerHolding,
} from '../types';
import {
  computeHoldingQuantity,
  computeHoldingsSummary,
  filterAuthoritativeHoldingsTransactions,
  getTransactionQuantityDelta,
} from './holdings';

const toEurAtDate = (
  amount: number | null,
  currency: string,
  fxSnapshots: FxSnapshot[],
  date: number,
): number | null => {
  if (amount === null) return null;
  const fxRate = getLatestFxRateAtDate(fxSnapshots, currency, date);
  if (fxRate === null) return null;
  return amount * fxRate;
};

const computePositionCostState = (
  transactions: Transaction[],
  fxSnapshots: FxSnapshot[],
): {
  costBasisEUR: number | null;
  averageCost: number | null;
  dividendIncomeEUR: number;
  hasKnownCostBasis: boolean;
} => {
  const relevantTransactions = [...transactions].sort((a, b) => a.date - b.date);
  let qty = 0;
  let costBasisEUR = 0;
  let dividendIncomeEUR = 0;
  let hasKnownCostBasis = true;

  for (const transaction of relevantTransactions) {
    const quantity = transaction.qty ?? 0;
    const fee = transaction.fee ?? 0;

    switch (transaction.kind) {
      case 'BUY': {
        const grossAmount = quantity * (transaction.price ?? 0) + fee;
        const amountEUR = toEurAtDate(grossAmount, transaction.currency, fxSnapshots, transaction.date);
        qty += quantity;
        if (amountEUR === null) {
          hasKnownCostBasis = false;
        } else {
          costBasisEUR += amountEUR;
        }
        break;
      }
      case 'TRANSFER_IN':
      case 'STAKING_REWARD':
      case 'AIRDROP': {
        qty += quantity;
        if (transaction.price === undefined) {
          hasKnownCostBasis = false;
          break;
        }
        const amountEUR = toEurAtDate(
          quantity * transaction.price + fee,
          transaction.currency,
          fxSnapshots,
          transaction.date,
        );
        if (amountEUR === null) {
          hasKnownCostBasis = false;
        } else {
          costBasisEUR += amountEUR;
        }
        break;
      }
      case 'SELL':
      case 'TRANSFER_OUT': {
        if (qty <= 1e-12 || costBasisEUR < 0) {
          hasKnownCostBasis = false;
          qty = Math.max(0, qty - quantity);
          break;
        }
        const averageCost = qty > 0 ? costBasisEUR / qty : 0;
        costBasisEUR = Math.max(0, costBasisEUR - averageCost * quantity);
        qty = Math.max(0, qty - quantity);
        break;
      }
      case 'FEE': {
        const feeAmount = fee > 0 ? fee : transaction.price ?? null;
        const feeEUR = toEurAtDate(feeAmount, transaction.currency, fxSnapshots, transaction.date);
        if (feeEUR === null) {
          hasKnownCostBasis = false;
        } else if (transaction.assetId) {
          costBasisEUR += feeEUR;
        }
        break;
      }
      case 'DIVIDEND': {
        const dividendBase =
          transaction.price ?? (transaction.qty !== undefined ? transaction.qty : null);
        const dividendEUR = toEurAtDate(dividendBase, transaction.currency, fxSnapshots, transaction.date);
        if (dividendEUR !== null) {
          dividendIncomeEUR += dividendEUR;
        }
        break;
      }
      default:
        break;
    }
  }

  if (qty <= 1e-12) {
    return {
      costBasisEUR: 0,
      averageCost: null,
      dividendIncomeEUR,
      hasKnownCostBasis,
    };
  }

  return {
    costBasisEUR: hasKnownCostBasis ? costBasisEUR : null,
    averageCost: hasKnownCostBasis ? costBasisEUR / qty : null,
    dividendIncomeEUR,
    hasKnownCostBasis,
  };
};

/**
 * Compute position quantity for an asset on a platform
 * qty = sum(BUY.qty) - sum(SELL.qty)
 */
export const computePositionQty = (
  transactions: Transaction[],
  assetId: string,
  platformId: string,
  accountId?: string,
): number => {
  return computeHoldingQuantity(transactions, assetId, platformId, accountId);
};

/**
 * Get latest price for an asset
 */
export const getLatestPrice = (
  prices: PriceSnapshot[],
  assetId: string
): { price: number; date: number; currency: string } | null => {
  const assetPrices = prices.filter((p) => p.assetId === assetId);
  if (assetPrices.length === 0) return null;
  
  const latest = assetPrices.reduce((max, current) =>
    current.date > max.date ? current : max
  );
  
  return { price: latest.price, date: latest.date, currency: latest.currency };
};

const getLatestPriceAtDate = (
  prices: PriceSnapshot[],
  assetId: string,
  date: number
): { price: number; date: number; currency: string } | null => {
  const candidates = prices.filter((p) => p.assetId === assetId && p.date <= date);
  if (candidates.length === 0) return null;
  const latest = candidates.reduce((max, current) =>
    current.date > max.date ? current : max
  );
  return { price: latest.price, date: latest.date, currency: latest.currency };
};

/**
 * Get latest FX rate for a currency to EUR
 * If currency is EUR, returns 1
 */
export const getLatestFxRate = (
  fxSnapshots: FxSnapshot[],
  currency: string
): number | null => {
  if (currency === 'EUR') return 1;
  
  const pair = `${currency}/EUR`;
  const snapshots = fxSnapshots.filter((fx) => fx.pair === pair);
  if (snapshots.length === 0) return null;
  
  const latest = snapshots.reduce((max, current) =>
    current.date > max.date ? current : max
  );
  
  return latest.rate;
};

const getLatestFxRateAtDate = (
  fxSnapshots: FxSnapshot[],
  currency: string,
  date: number
): number | null => {
  if (currency === 'EUR') return 1;

  const pair = `${currency}/EUR`;
  const snapshots = fxSnapshots.filter((fx) => fx.pair === pair && fx.date <= date);
  if (snapshots.length === 0) return null;

  const latest = snapshots.reduce((max, current) =>
    current.date > max.date ? current : max
  );

  return latest.rate;
};

/**
 * Compute value in EUR for a position
 */
export const computeValueEUR = (
  qty: number,
  price: number | null,
  fxRate: number | null
): number | null => {
  if (price === null || fxRate === null) return null;
  return qty * price * fxRate;
};

/**
 * Compute all positions and portfolio summary
 */
export const computePortfolioSummary = (
  assets: Asset[],
  transactions: Transaction[],
  priceSnapshots: PriceSnapshot[],
  fxSnapshots: FxSnapshot[],
  platforms: Platform[],
  accounts: Account[] = [],
): PortfolioSummary => {
  const authoritativeTransactions = filterAuthoritativeHoldingsTransactions(transactions);
  const holdings = computeHoldingsSummary(transactions);
  const positions: Position[] = [];
  const assetMap = new Map(assets.map((asset) => [asset.id, asset]));
  const accountMap = new Map(accounts.map((account) => [account.id, account]));

  // Compute position for each canonical holdings pair.
  for (const holding of holdings.positions) {
    const asset = assetMap.get(holding.assetId);
    const platform = platforms.find((p) => p.id === holding.platformId);
    const account = holding.accountId ? accountMap.get(holding.accountId) : undefined;

    if (!asset || !platform) continue;

    const pairTransactions = holding.transactions;
    const qty = holding.qty;
    if (Math.abs(qty) <= 1e-12 && pairTransactions.every((transaction) => transaction.kind !== 'DIVIDEND')) {
      continue;
    }
    const latestPriceData = getLatestPrice(priceSnapshots, holding.assetId);
    const valuationCurrency = latestPriceData?.currency ?? asset.currency;
    const fxRate = getLatestFxRate(fxSnapshots, valuationCurrency);
    const costState = computePositionCostState(pairTransactions, fxSnapshots);
    
    const valueEUR = computeValueEUR(
      qty,
      latestPriceData?.price ?? null,
      fxRate
    );
    const unrealizedPnlEUR =
      valueEUR !== null && costState.costBasisEUR !== null
        ? valueEUR - costState.costBasisEUR
        : null;
    const unrealizedPnlPct =
      unrealizedPnlEUR !== null &&
      costState.costBasisEUR !== null &&
      costState.costBasisEUR > 1e-12
        ? unrealizedPnlEUR / costState.costBasisEUR
        : null;
    
    positions.push({
      assetId: holding.assetId,
      platformId: holding.platformId,
      accountId: holding.accountId,
      asset,
      platform,
      account,
      qty,
      latestPrice: latestPriceData?.price ?? null,
      latestPriceDate: latestPriceData?.date ?? null,
      currency: valuationCurrency,
      fxRate,
      costBasisEUR: costState.costBasisEUR,
      averageCost: costState.averageCost,
      unrealizedPnlEUR,
      unrealizedPnlPct,
      dividendIncomeEUR: costState.dividendIncomeEUR,
      hasKnownCostBasis: costState.hasKnownCostBasis,
      valueEUR,
    });
  }
  
  // Aggregate by platform
  const byPlatformMap = new Map<string, { platformId: string; name: string; valueEUR: number | null }>();
  
  for (const position of positions) {
    const key = position.platformId;
    if (!byPlatformMap.has(key)) {
      byPlatformMap.set(key, {
        platformId: position.platformId,
        name: position.platform.name,
        valueEUR: 0,
      });
    }
    const entry = byPlatformMap.get(key)!;
    if (position.valueEUR === null) {
      entry.valueEUR = null;
      continue;
    }
    if (entry.valueEUR === null) continue;
    entry.valueEUR += position.valueEUR;
  }

  const byAccountMap = new Map<
    string,
    {
      accountId: string | null;
      platformId: string;
      name: string;
      valueEUR: number | null;
      costBasisEUR: number | null;
      unrealizedPnlEUR: number | null;
    }
  >();

  for (const position of positions) {
    const key = `${position.platformId}:${position.accountId ?? '__none__'}`;
    const defaultName = position.account?.name ?? `${position.platform.name} / Unassigned`;
    if (!byAccountMap.has(key)) {
      byAccountMap.set(key, {
        accountId: position.accountId ?? null,
        platformId: position.platformId,
        name: defaultName,
        valueEUR: 0,
        costBasisEUR: 0,
        unrealizedPnlEUR: 0,
      });
    }
    const entry = byAccountMap.get(key)!;
    if (position.valueEUR === null) {
      entry.valueEUR = null;
    } else if (entry.valueEUR !== null) {
      entry.valueEUR += position.valueEUR;
    }

    if (position.costBasisEUR === null) {
      entry.costBasisEUR = null;
    } else if (entry.costBasisEUR !== null) {
      entry.costBasisEUR += position.costBasisEUR;
    }

    if (position.unrealizedPnlEUR === null) {
      entry.unrealizedPnlEUR = null;
    } else if (entry.unrealizedPnlEUR !== null) {
      entry.unrealizedPnlEUR += position.unrealizedPnlEUR;
    }
  }
  
  // Aggregate by type
  const byTypeMap = new Map<string, { type: Asset['type']; valueEUR: number | null }>();
  
  for (const position of positions) {
    const key = position.asset.type;
    if (!byTypeMap.has(key)) {
      byTypeMap.set(key, { type: key, valueEUR: 0 });
    }
    const entry = byTypeMap.get(key)!;
    if (position.valueEUR === null) {
      entry.valueEUR = null;
      continue;
    }
    if (entry.valueEUR === null) continue;
    entry.valueEUR += position.valueEUR;
  }
  
  // Aggregate by ticker across all platforms.
  const byTickerMap = new Map<string, TickerHolding>();
  for (const position of positions) {
    const existing = byTickerMap.get(position.assetId);
    if (!existing) {
      byTickerMap.set(position.assetId, {
        assetId: position.assetId,
        asset: position.asset,
        qty: position.qty,
        latestPrice: position.latestPrice,
        latestPriceDate: position.latestPriceDate,
        currency: position.currency,
        fxRate: position.fxRate,
        costBasisEUR: position.costBasisEUR,
        averageCost: position.averageCost,
        unrealizedPnlEUR: position.unrealizedPnlEUR,
        unrealizedPnlPct: position.unrealizedPnlPct,
        dividendIncomeEUR: position.dividendIncomeEUR,
        hasKnownCostBasis: position.hasKnownCostBasis,
        valueEUR: position.valueEUR,
      });
      continue;
    }

    existing.qty += position.qty;
    existing.dividendIncomeEUR += position.dividendIncomeEUR;
    if (
      existing.latestPriceDate === null ||
      (position.latestPriceDate !== null && position.latestPriceDate > existing.latestPriceDate)
    ) {
      existing.latestPrice = position.latestPrice;
      existing.latestPriceDate = position.latestPriceDate;
      existing.currency = position.currency;
      existing.fxRate = position.fxRate;
    }
    if (existing.valueEUR === null || position.valueEUR === null) {
      existing.valueEUR = null;
    } else {
      existing.valueEUR += position.valueEUR;
    }
    if (existing.costBasisEUR === null || position.costBasisEUR === null) {
      existing.costBasisEUR = null;
      existing.averageCost = null;
      existing.unrealizedPnlEUR = null;
      existing.unrealizedPnlPct = null;
      existing.hasKnownCostBasis = false;
    } else {
      existing.costBasisEUR += position.costBasisEUR;
      existing.averageCost = Math.abs(existing.qty) > 1e-12 ? existing.costBasisEUR / existing.qty : null;
      existing.unrealizedPnlEUR =
        existing.valueEUR !== null ? existing.valueEUR - existing.costBasisEUR : null;
      existing.unrealizedPnlPct =
        existing.unrealizedPnlEUR !== null && existing.costBasisEUR > 1e-12
          ? existing.unrealizedPnlEUR / existing.costBasisEUR
          : null;
      existing.hasKnownCostBasis = existing.hasKnownCostBasis && position.hasKnownCostBasis;
    }
  }

  const byTicker = Array.from(byTickerMap.values())
    .filter((holding) => Math.abs(holding.qty) > 1e-12)
    .sort((a, b) => {
      const valueA = a.valueEUR ?? -Infinity;
      const valueB = b.valueEUR ?? -Infinity;
      if (valueA === valueB) {
        return a.asset.symbol.localeCompare(b.asset.symbol);
      }
      return valueB - valueA;
    });

  // Build portfolio evolution over time from transactional and market dates.
  const datedTransactions = authoritativeTransactions
    .filter((tx) => tx.assetId && getTransactionQuantityDelta(tx) !== 0)
    .sort((a, b) => a.date - b.date);
  const timelineSet = new Set<number>();
  for (const tx of datedTransactions) timelineSet.add(tx.date);
  for (const price of priceSnapshots) timelineSet.add(price.date);
  for (const fx of fxSnapshots) timelineSet.add(fx.date);
  const timelineDates = Array.from(timelineSet).sort((a, b) => a - b);

  const history: PortfolioHistoryPoint[] = [];
  const qtyByAsset = new Map<string, number>();
  let txIndex = 0;

  for (const date of timelineDates) {
    while (txIndex < datedTransactions.length && datedTransactions[txIndex].date <= date) {
      const tx = datedTransactions[txIndex];
      const assetId = tx.assetId!;
      const previousQty = qtyByAsset.get(assetId) ?? 0;
      const delta = getTransactionQuantityDelta(tx);
      qtyByAsset.set(assetId, previousQty + delta);
      txIndex++;
    }

    let knownValueEUR = 0;
    let hasMissingData = false;
    let hasOpenPosition = false;

    for (const [assetId, qty] of qtyByAsset) {
      if (Math.abs(qty) <= 1e-12) continue;
      hasOpenPosition = true;

      const asset = assetMap.get(assetId);
      if (!asset) continue;

      const priceAtDate = getLatestPriceAtDate(priceSnapshots, assetId, date);
      const priceCurrency = priceAtDate?.currency ?? asset.currency;
      const fxRateAtDate = getLatestFxRateAtDate(fxSnapshots, priceCurrency, date);
      const valueEUR = computeValueEUR(qty, priceAtDate?.price ?? null, fxRateAtDate);

      if (valueEUR === null) {
        hasMissingData = true;
      } else {
        knownValueEUR += valueEUR;
      }
    }

    if (!hasOpenPosition) continue;
    history.push({
      date,
      totalValueEUR: hasMissingData ? null : knownValueEUR,
      knownValueEUR,
      hasMissingData,
    });
  }

  const totalValueEUR = positions.some((p) => p.valueEUR === null)
    ? null
    : positions.reduce((sum, p) => sum + (p.valueEUR ?? 0), 0);
  const totalCostBasisEUR = positions.some((p) => p.costBasisEUR === null)
    ? null
    : positions.reduce((sum, p) => sum + (p.costBasisEUR ?? 0), 0);
  const totalUnrealizedPnlEUR =
    totalValueEUR !== null && totalCostBasisEUR !== null
      ? totalValueEUR - totalCostBasisEUR
      : null;
  const totalUnrealizedPnlPct =
    totalUnrealizedPnlEUR !== null &&
    totalCostBasisEUR !== null &&
    totalCostBasisEUR > 1e-12
      ? totalUnrealizedPnlEUR / totalCostBasisEUR
      : null;
  const totalDividendIncomeEUR = positions.reduce(
    (sum, position) => sum + position.dividendIncomeEUR,
    0,
  );
  const tickerWithPnl = byTicker.filter((holding) => holding.unrealizedPnlPct !== null);
  const bestPerformer =
    tickerWithPnl.length > 0
      ? [...tickerWithPnl].sort(
          (left, right) => (right.unrealizedPnlPct ?? -Infinity) - (left.unrealizedPnlPct ?? -Infinity),
        )[0] ?? null
      : null;
  const worstPerformer =
    tickerWithPnl.length > 0
      ? [...tickerWithPnl].sort(
          (left, right) => (left.unrealizedPnlPct ?? Infinity) - (right.unrealizedPnlPct ?? Infinity),
        )[0] ?? null
      : null;
  
  return {
    positions,
    byTicker,
    history,
    totalValueEUR,
    totalCostBasisEUR,
    totalUnrealizedPnlEUR,
    totalUnrealizedPnlPct,
    totalDividendIncomeEUR,
    bestPerformer,
    worstPerformer,
    byAccount: Array.from(byAccountMap.values()),
    byPlatform: Array.from(byPlatformMap.values()),
    byType: Array.from(byTypeMap.values()),
    dataQuality: {
      missingPriceCount: positions.filter((position) => position.latestPrice === null).length,
      missingFxCount: positions.filter(
        (position) => position.latestPrice !== null && position.fxRate === null,
      ).length,
      missingCostBasisCount: positions.filter((position) => !position.hasKnownCostBasis).length,
    },
  };
};
