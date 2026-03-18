import { Asset, FxSnapshot, Platform, PriceSnapshot, Transaction } from '../types';
import { isPositionSnapshotTransaction } from './positionSnapshots';

export type AnalyticsTransactionKind =
  | Transaction['kind']
  | 'DIVIDEND'
  | 'TRANSFER_IN'
  | 'TRANSFER_OUT'
  | 'SWAP_IN'
  | 'SWAP_OUT'
  | 'STAKING_REWARD'
  | 'AIRDROP'
  | 'DEPOSIT_CASH'
  | 'WITHDRAW_CASH';

export interface AnalyticsTransaction extends Omit<Transaction, 'kind'> {
  kind: AnalyticsTransactionKind;
}

export interface PortfolioAnalyticsInput {
  assets: Asset[];
  platforms: Platform[];
  transactions: AnalyticsTransaction[];
  priceSnapshots: PriceSnapshot[];
  fxSnapshots: FxSnapshot[];
}

export interface PositionAnalyticsDataQuality {
  missingPrice: boolean;
  missingFx: boolean;
  missingCostBasis: boolean;
}

export interface PortfolioAnalyticsPosition {
  assetId: string;
  platformId: string;
  asset: Asset;
  platform: Platform;
  quantity: number;
  latestPrice: number | null;
  latestPriceDate: number | null;
  priceCurrency: string;
  fxRate: number | null;
  marketValueEUR: number | null;
  costBasisEUR: number;
  averageCostEUR: number | null;
  realizedPnlEUR: number;
  unrealizedPnlEUR: number | null;
  unrealizedPnlPct: number | null;
  dividendsEUR: number;
  rewardsEUR: number;
  feesEUR: number;
  dataQuality: PositionAnalyticsDataQuality;
}

export interface PortfolioAnalyticsHolding {
  assetId: string;
  asset: Asset;
  quantity: number;
  latestPrice: number | null;
  latestPriceDate: number | null;
  priceCurrency: string;
  fxRate: number | null;
  marketValueEUR: number | null;
  costBasisEUR: number;
  averageCostEUR: number | null;
  realizedPnlEUR: number;
  unrealizedPnlEUR: number | null;
  unrealizedPnlPct: number | null;
  dividendsEUR: number;
  rewardsEUR: number;
  feesEUR: number;
  dataQuality: PositionAnalyticsDataQuality;
}

export interface PortfolioAnalyticsGroup {
  key: string;
  label: string;
  marketValueEUR: number;
  costBasisEUR: number;
  averageCostEUR: number | null;
  realizedPnlEUR: number;
  unrealizedPnlEUR: number;
  unrealizedPnlPct: number | null;
  dividendsEUR: number;
  rewardsEUR: number;
  feesEUR: number;
  positionCount: number;
  dataQuality: {
    missingPrice: number;
    missingFx: number;
    missingCostBasis: number;
  };
}

export interface PortfolioAnalyticsTotals {
  marketValueEUR: number;
  costBasisEUR: number;
  unrealizedPnlEUR: number;
  unrealizedPnlPct: number | null;
  realizedPnlEUR: number;
  dividendsEUR: number;
  rewardsEUR: number;
  feesEUR: number;
}

export interface PortfolioAnalyticsDataQuality {
  missingPricePositions: number;
  missingFxPositions: number;
  missingCostBasisPositions: number;
  unsupportedTransactionCount: number;
  unmatchedTransferCount: number;
}

export interface PortfolioAnalyticsSummary {
  positions: PortfolioAnalyticsPosition[];
  holdings: PortfolioAnalyticsHolding[];
  byPlatform: PortfolioAnalyticsGroup[];
  byType: PortfolioAnalyticsGroup[];
  winners: PortfolioAnalyticsHolding[];
  losers: PortfolioAnalyticsHolding[];
  totals: PortfolioAnalyticsTotals;
  dataQuality: PortfolioAnalyticsDataQuality;
}

type TransactionKind = AnalyticsTransaction['kind'];

const EPSILON = 1e-8;
const DEFAULT_CURRENCY = 'EUR';

const UNSETTLED_KINDS = new Set<TransactionKind>([
  'DEPOSIT',
  'WITHDRAW',
  'DEPOSIT_CASH',
  'WITHDRAW_CASH',
]);

const ACQUISITION_KINDS = new Set<TransactionKind>([
  'BUY',
  'SWAP_IN',
  'STAKING_REWARD',
  'AIRDROP',
  'TRANSFER_IN',
]);

const DISPOSITION_KINDS = new Set<TransactionKind>([
  'SELL',
  'SWAP_OUT',
  'TRANSFER_OUT',
]);

const INCOME_KINDS = new Set<TransactionKind>(['DIVIDEND']);

const roundMoney = (value: number, precision = 10) => Number(value.toFixed(precision));

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isAssetLinked = (
  transaction: AnalyticsTransaction,
): transaction is AnalyticsTransaction & { assetId: string } =>
  transaction.assetId !== undefined && transaction.assetId !== null;

const makePairKey = (assetId: string, platformId: string) => `${assetId}:${platformId}`;

const sortTransactions = (a: AnalyticsTransaction, b: AnalyticsTransaction) => {
  if (a.date !== b.date) return a.date - b.date;
  if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
  return a.id.localeCompare(b.id);
};

const latestPriceForAsset = (prices: PriceSnapshot[], assetId: string) => {
  const candidates = prices.filter((price) => price.assetId === assetId);
  if (candidates.length === 0) return null;
  return candidates.reduce((max, current) => (current.date > max.date ? current : max));
};

const latestFxRate = (fxSnapshots: FxSnapshot[], currency: string) => {
  const normalized = currency.trim().toUpperCase();
  if (!normalized || normalized === DEFAULT_CURRENCY) return 1;
  const pair = `${normalized}/EUR`;
  const candidates = fxSnapshots.filter((fx) => fx.pair === pair);
  if (candidates.length === 0) return null;
  return candidates.reduce((max, current) => (current.date > max.date ? current : max)).rate;
};

const latestFxRateAtOrBefore = (fxSnapshots: FxSnapshot[], currency: string, date: number) => {
  const normalized = currency.trim().toUpperCase();
  if (!normalized || normalized === DEFAULT_CURRENCY) return 1;
  const pair = `${normalized}/EUR`;
  const candidates = fxSnapshots.filter((fx) => fx.pair === pair && fx.date <= date);
  if (candidates.length === 0) return null;
  return candidates.reduce((max, current) => (current.date > max.date ? current : max)).rate;
};

const convertToEur = (
  amount: number | null | undefined,
  currency: string,
  fxSnapshots: FxSnapshot[],
  date: number,
) => {
  if (!isFiniteNumber(amount)) return null;
  const rate = latestFxRateAtOrBefore(fxSnapshots, currency, date);
  if (rate === null) return null;
  return roundMoney(amount * rate);
};

const getNativeAmount = (transaction: AnalyticsTransaction) => {
  if (isFiniteNumber(transaction.qty) && isFiniteNumber(transaction.price)) {
    return roundMoney(transaction.qty * transaction.price);
  }
  if (isFiniteNumber(transaction.price)) return roundMoney(transaction.price);
  if (isFiniteNumber(transaction.qty)) return roundMoney(transaction.qty);
  if (isFiniteNumber(transaction.fee)) return roundMoney(transaction.fee);
  return null;
};

const getFeeAmount = (transaction: AnalyticsTransaction) =>
  isFiniteNumber(transaction.fee) ? roundMoney(transaction.fee) : null;

interface PairLedger {
  quantity: number;
  costBasisEUR: number;
  realizedPnlEUR: number;
  dividendsEUR: number;
  rewardsEUR: number;
  feesEUR: number;
  missingCostBasis: boolean;
  unsupportedTransactionCount: number;
  transferOutBasisById: Map<string, number>;
}

const createPairLedger = (): PairLedger => ({
  quantity: 0,
  costBasisEUR: 0,
  realizedPnlEUR: 0,
  dividendsEUR: 0,
  rewardsEUR: 0,
  feesEUR: 0,
  missingCostBasis: false,
  unsupportedTransactionCount: 0,
  transferOutBasisById: new Map<string, number>(),
});

const applySellLikeReduction = (ledger: PairLedger, quantity: number) => {
  if (Math.abs(ledger.quantity) <= EPSILON) {
    ledger.missingCostBasis = true;
    ledger.quantity = roundMoney(ledger.quantity - quantity);
    return 0;
  }

  const averageCostEUR = ledger.costBasisEUR / ledger.quantity;
  const basisReductionEUR = roundMoney(averageCostEUR * quantity);
  ledger.costBasisEUR = roundMoney(ledger.costBasisEUR - basisReductionEUR);
  ledger.quantity = roundMoney(ledger.quantity - quantity);
  return basisReductionEUR;
};

const analyzePairTransactions = (
  transactions: AnalyticsTransaction[],
  fxSnapshots: FxSnapshot[],
  transferInBasisById: Map<string, number> = new Map(),
) => {
  const ledger = createPairLedger();

  for (const transaction of transactions.slice().sort(sortTransactions)) {
    const quantity = isFiniteNumber(transaction.qty) ? transaction.qty : 0;
    const nativeAmount = getNativeAmount(transaction);
    const feeAmount = getFeeAmount(transaction);
    const transactionCurrency = transaction.currency ?? DEFAULT_CURRENCY;

    switch (transaction.kind) {
      case 'BUY': {
        ledger.quantity = roundMoney(ledger.quantity + quantity);
        const grossEUR = convertToEur(nativeAmount, transactionCurrency, fxSnapshots, transaction.date);
        const feeEUR = convertToEur(feeAmount, transactionCurrency, fxSnapshots, transaction.date) ?? 0;
        if (grossEUR === null) {
          ledger.missingCostBasis = true;
        } else {
          ledger.costBasisEUR = roundMoney(ledger.costBasisEUR + grossEUR + feeEUR);
          ledger.feesEUR = roundMoney(ledger.feesEUR + feeEUR);
        }
        break;
      }

      case 'SELL': {
        const grossEUR = convertToEur(nativeAmount, transactionCurrency, fxSnapshots, transaction.date);
        const feeEUR = convertToEur(feeAmount, transactionCurrency, fxSnapshots, transaction.date) ?? 0;
        const basisReductionEUR = applySellLikeReduction(ledger, quantity);
        if (grossEUR === null) {
          ledger.missingCostBasis = true;
        } else {
          const netProceedsEUR = roundMoney(grossEUR - feeEUR);
          ledger.realizedPnlEUR = roundMoney(ledger.realizedPnlEUR + netProceedsEUR - basisReductionEUR);
          ledger.feesEUR = roundMoney(ledger.feesEUR + feeEUR);
        }
        break;
      }

      case 'TRANSFER_OUT': {
        const basisReductionEUR = applySellLikeReduction(ledger, quantity);
        ledger.transferOutBasisById.set(transaction.id, basisReductionEUR);
        break;
      }

      case 'TRANSFER_IN': {
        ledger.quantity = roundMoney(ledger.quantity + quantity);
        const transferredBasisEUR = transferInBasisById.get(transaction.id);
        if (isFiniteNumber(transferredBasisEUR)) {
          ledger.costBasisEUR = roundMoney(ledger.costBasisEUR + transferredBasisEUR);
        } else {
          ledger.missingCostBasis = true;
        }
        break;
      }

      case 'DIVIDEND': {
        const incomeEUR = convertToEur(nativeAmount, transactionCurrency, fxSnapshots, transaction.date);
        if (incomeEUR === null) {
          ledger.missingCostBasis = true;
        } else {
          ledger.dividendsEUR = roundMoney(ledger.dividendsEUR + incomeEUR);
        }
        break;
      }

      case 'STAKING_REWARD':
      case 'AIRDROP':
      case 'SWAP_IN': {
        ledger.quantity = roundMoney(ledger.quantity + quantity);
        const rewardEUR = convertToEur(nativeAmount, transactionCurrency, fxSnapshots, transaction.date);
        if (rewardEUR === null) {
          ledger.missingCostBasis = true;
        } else {
          ledger.costBasisEUR = roundMoney(ledger.costBasisEUR + rewardEUR);
          ledger.rewardsEUR = roundMoney(ledger.rewardsEUR + rewardEUR);
        }
        break;
      }

      case 'SWAP_OUT': {
        const basisReductionEUR = applySellLikeReduction(ledger, quantity);
        const swapValueEUR = convertToEur(nativeAmount, transactionCurrency, fxSnapshots, transaction.date);
        if (swapValueEUR === null) {
          ledger.missingCostBasis = true;
        } else {
          ledger.realizedPnlEUR = roundMoney(ledger.realizedPnlEUR + swapValueEUR - basisReductionEUR);
        }
        break;
      }

      case 'FEE': {
        const feeEUR = convertToEur(feeAmount ?? nativeAmount, transactionCurrency, fxSnapshots, transaction.date);
        if (feeEUR === null) {
          ledger.missingCostBasis = true;
        } else {
          ledger.feesEUR = roundMoney(ledger.feesEUR + feeEUR);
        }
        break;
      }

      case 'DEPOSIT':
      case 'WITHDRAW':
      case 'DEPOSIT_CASH':
      case 'WITHDRAW_CASH':
        ledger.unsupportedTransactionCount += 1;
        break;

      default:
        ledger.unsupportedTransactionCount += 1;
        break;
    }
  }

  return ledger;
};

const buildTransferMatchMap = (transactions: AnalyticsTransaction[]) => {
  const outsByAsset = new Map<string, AnalyticsTransaction[]>();
  const insByAsset = new Map<string, AnalyticsTransaction[]>();

  for (const transaction of transactions) {
    if (!isAssetLinked(transaction)) continue;
    if (transaction.kind === 'TRANSFER_OUT') {
      const list = outsByAsset.get(transaction.assetId);
      if (list) list.push(transaction);
      else outsByAsset.set(transaction.assetId, [transaction]);
    }
    if (transaction.kind === 'TRANSFER_IN') {
      const list = insByAsset.get(transaction.assetId);
      if (list) list.push(transaction);
      else insByAsset.set(transaction.assetId, [transaction]);
    }
  }

  const matchedTransferInById = new Map<string, AnalyticsTransaction>();
  const matchedTransferOutById = new Map<string, AnalyticsTransaction>();

  for (const [assetId, inboundCandidates] of insByAsset.entries()) {
    const outboundCandidates = [...(outsByAsset.get(assetId) ?? [])].sort(sortTransactions);
    const sortedInbound = [...inboundCandidates].sort(sortTransactions);
    const usedOutIds = new Set<string>();

    for (const inbound of sortedInbound) {
      if (!isFiniteNumber(inbound.qty)) continue;
      const inboundQty = inbound.qty;

      const matchIndex = outboundCandidates.findIndex((outbound) => {
        if (usedOutIds.has(outbound.id)) return false;
        if (!isFiniteNumber(outbound.qty)) return false;
        const outboundQty = outbound.qty;
        if (Math.abs(outboundQty - inboundQty) > EPSILON) return false;
        if (outbound.date > inbound.date) return false;
        if (inbound.date - outbound.date > 45 * 24 * 60 * 60 * 1000) return false;
        return true;
      });

      if (matchIndex === -1) continue;

      const outbound = outboundCandidates[matchIndex]!;
      usedOutIds.add(outbound.id);
      matchedTransferInById.set(inbound.id, outbound);
      matchedTransferOutById.set(outbound.id, inbound);
    }
  }

  return { matchedTransferInById, matchedTransferOutById };
};

const selectAuthoritativeTransactions = (transactions: AnalyticsTransaction[]) => {
  const snapshotManagedPairs = new Set<string>();

  for (const transaction of transactions) {
    if (transaction.assetId && isPositionSnapshotTransaction(transaction)) {
      snapshotManagedPairs.add(makePairKey(transaction.assetId, transaction.platformId));
    }
  }

  if (snapshotManagedPairs.size === 0) {
    return transactions;
  }

  return transactions.filter((transaction) => {
    if (!transaction.assetId) return true;
    const key = makePairKey(transaction.assetId, transaction.platformId);
    if (!snapshotManagedPairs.has(key)) {
      return !isPositionSnapshotTransaction(transaction);
    }
    return isPositionSnapshotTransaction(transaction);
  });
};

const buildPositionAnalytics = (
  asset: Asset,
  platform: Platform,
  transactions: AnalyticsTransaction[],
  priceSnapshots: PriceSnapshot[],
  fxSnapshots: FxSnapshot[],
  transferInBasisById: Map<string, number>,
): PortfolioAnalyticsPosition | null => {
  const relevantTransactions = transactions.filter(
    (transaction) => transaction.assetId === asset.id && transaction.platformId === platform.id,
  );

  if (relevantTransactions.length === 0) {
    return null;
  }

  const ledger = analyzePairTransactions(relevantTransactions, fxSnapshots, transferInBasisById);

  if (Math.abs(ledger.quantity) <= EPSILON) {
    return null;
  }

  const latestPrice = latestPriceForAsset(priceSnapshots, asset.id);
  const priceCurrency = latestPrice?.currency ?? asset.currency;
  const fxRate = latestPrice
    ? latestFxRate(fxSnapshots, priceCurrency)
    : latestFxRate(fxSnapshots, asset.currency);
  const marketValueEUR =
    latestPrice && fxRate !== null
      ? roundMoney(ledger.quantity * latestPrice.price * fxRate)
      : null;
  const averageCostEUR = Math.abs(ledger.quantity) > EPSILON ? roundMoney(ledger.costBasisEUR / ledger.quantity) : null;
  const unrealizedPnlEUR = marketValueEUR !== null ? roundMoney(marketValueEUR - ledger.costBasisEUR) : null;
  const unrealizedPnlPct =
    marketValueEUR !== null && ledger.costBasisEUR > EPSILON
      ? roundMoney((marketValueEUR - ledger.costBasisEUR) / ledger.costBasisEUR, 6)
      : null;

  return {
    assetId: asset.id,
    platformId: platform.id,
    asset,
    platform,
    quantity: roundMoney(ledger.quantity),
    latestPrice: latestPrice?.price ?? null,
    latestPriceDate: latestPrice?.date ?? null,
    priceCurrency,
    fxRate: marketValueEUR !== null ? fxRate : null,
    marketValueEUR,
    costBasisEUR: roundMoney(ledger.costBasisEUR),
    averageCostEUR,
    realizedPnlEUR: roundMoney(ledger.realizedPnlEUR),
    unrealizedPnlEUR,
    unrealizedPnlPct,
    dividendsEUR: roundMoney(ledger.dividendsEUR),
    rewardsEUR: roundMoney(ledger.rewardsEUR),
    feesEUR: roundMoney(ledger.feesEUR),
    dataQuality: {
      missingPrice: marketValueEUR === null,
      missingFx: marketValueEUR === null
        ? latestFxRate(fxSnapshots, priceCurrency) === null
        : fxRate === null,
      missingCostBasis: ledger.missingCostBasis || (Math.abs(ledger.quantity) > EPSILON && ledger.costBasisEUR <= EPSILON),
    },
  };
};

const aggregateHoldings = (positions: PortfolioAnalyticsPosition[]) => {
  const map = new Map<string, PortfolioAnalyticsHolding>();

  for (const position of positions) {
    const existing = map.get(position.assetId);
    if (!existing) {
      map.set(position.assetId, {
        assetId: position.assetId,
        asset: position.asset,
        quantity: position.quantity,
        latestPrice: position.latestPrice,
        latestPriceDate: position.latestPriceDate,
        priceCurrency: position.priceCurrency,
        fxRate: position.fxRate,
        marketValueEUR: position.marketValueEUR ?? 0,
        costBasisEUR: position.costBasisEUR,
        averageCostEUR: position.averageCostEUR,
        realizedPnlEUR: position.realizedPnlEUR,
        unrealizedPnlEUR: position.unrealizedPnlEUR ?? 0,
        unrealizedPnlPct: position.unrealizedPnlPct,
        dividendsEUR: position.dividendsEUR,
        rewardsEUR: position.rewardsEUR,
        feesEUR: position.feesEUR,
        dataQuality: { ...position.dataQuality },
      });
      continue;
    }

    existing.quantity = roundMoney(existing.quantity + position.quantity);
    existing.realizedPnlEUR = roundMoney(existing.realizedPnlEUR + position.realizedPnlEUR);
    existing.dividendsEUR = roundMoney(existing.dividendsEUR + position.dividendsEUR);
    existing.rewardsEUR = roundMoney(existing.rewardsEUR + position.rewardsEUR);
    existing.feesEUR = roundMoney(existing.feesEUR + position.feesEUR);
    existing.marketValueEUR = roundMoney((existing.marketValueEUR ?? 0) + (position.marketValueEUR ?? 0));
    existing.costBasisEUR = roundMoney(existing.costBasisEUR + position.costBasisEUR);
    existing.unrealizedPnlEUR = roundMoney((existing.unrealizedPnlEUR ?? 0) + (position.unrealizedPnlEUR ?? 0));
    existing.dataQuality.missingPrice = existing.dataQuality.missingPrice || position.dataQuality.missingPrice;
    existing.dataQuality.missingFx = existing.dataQuality.missingFx || position.dataQuality.missingFx;
    existing.dataQuality.missingCostBasis = existing.dataQuality.missingCostBasis || position.dataQuality.missingCostBasis;
    if (existing.latestPriceDate === null || (position.latestPriceDate !== null && position.latestPriceDate > existing.latestPriceDate)) {
      existing.latestPrice = position.latestPrice;
      existing.latestPriceDate = position.latestPriceDate;
      existing.priceCurrency = position.priceCurrency;
      existing.fxRate = position.fxRate;
    }
  }

  for (const holding of map.values()) {
    holding.averageCostEUR = Math.abs(holding.quantity) > EPSILON ? roundMoney(holding.costBasisEUR / holding.quantity) : null;
    holding.unrealizedPnlPct = holding.costBasisEUR > EPSILON
      ? roundMoney((holding.unrealizedPnlEUR ?? 0) / holding.costBasisEUR, 6)
      : null;
  }

  return Array.from(map.values()).filter((holding) => Math.abs(holding.quantity) > EPSILON);
};

const aggregateGroups = (
  positions: PortfolioAnalyticsPosition[],
  selector: (position: PortfolioAnalyticsPosition) => { key: string; label: string },
): PortfolioAnalyticsGroup[] => {
  const map = new Map<string, PortfolioAnalyticsGroup>();

  for (const position of positions) {
    const { key, label } = selector(position);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        key,
        label,
        marketValueEUR: position.marketValueEUR ?? 0,
        costBasisEUR: position.costBasisEUR,
        averageCostEUR: position.averageCostEUR,
        realizedPnlEUR: position.realizedPnlEUR,
        unrealizedPnlEUR: position.unrealizedPnlEUR ?? 0,
        unrealizedPnlPct: position.unrealizedPnlPct,
        dividendsEUR: position.dividendsEUR,
        rewardsEUR: position.rewardsEUR,
        feesEUR: position.feesEUR,
        positionCount: 1,
        dataQuality: {
          missingPrice: position.dataQuality.missingPrice ? 1 : 0,
          missingFx: position.dataQuality.missingFx ? 1 : 0,
          missingCostBasis: position.dataQuality.missingCostBasis ? 1 : 0,
        },
      });
      continue;
    }

    existing.positionCount += 1;
    existing.marketValueEUR = roundMoney(existing.marketValueEUR + (position.marketValueEUR ?? 0));
    existing.costBasisEUR = roundMoney(existing.costBasisEUR + position.costBasisEUR);
    existing.realizedPnlEUR = roundMoney(existing.realizedPnlEUR + position.realizedPnlEUR);
    existing.unrealizedPnlEUR = roundMoney(existing.unrealizedPnlEUR + (position.unrealizedPnlEUR ?? 0));
    existing.dividendsEUR = roundMoney(existing.dividendsEUR + position.dividendsEUR);
    existing.rewardsEUR = roundMoney(existing.rewardsEUR + position.rewardsEUR);
    existing.feesEUR = roundMoney(existing.feesEUR + position.feesEUR);
    existing.dataQuality.missingPrice += position.dataQuality.missingPrice ? 1 : 0;
    existing.dataQuality.missingFx += position.dataQuality.missingFx ? 1 : 0;
    existing.dataQuality.missingCostBasis += position.dataQuality.missingCostBasis ? 1 : 0;
  }

  for (const group of map.values()) {
    group.averageCostEUR = group.positionCount > 0 ? roundMoney(group.costBasisEUR / group.positionCount) : null;
    group.unrealizedPnlPct = group.costBasisEUR > EPSILON
      ? roundMoney(group.unrealizedPnlEUR / group.costBasisEUR, 6)
      : null;
  }

  return Array.from(map.values()).sort(
    (a, b) => (b.marketValueEUR ?? 0) - (a.marketValueEUR ?? 0),
  );
};

const computeTotals = (positions: PortfolioAnalyticsPosition[]): PortfolioAnalyticsTotals => {
  const marketValueEUR = roundMoney(
    positions.reduce((sum, position) => sum + (position.marketValueEUR ?? 0), 0),
  );
  const costBasisEUR = roundMoney(positions.reduce((sum, position) => sum + position.costBasisEUR, 0));
  const realizedPnlEUR = roundMoney(positions.reduce((sum, position) => sum + position.realizedPnlEUR, 0));
  const dividendsEUR = roundMoney(positions.reduce((sum, position) => sum + position.dividendsEUR, 0));
  const rewardsEUR = roundMoney(positions.reduce((sum, position) => sum + position.rewardsEUR, 0));
  const feesEUR = roundMoney(positions.reduce((sum, position) => sum + position.feesEUR, 0));
  const unrealizedPnlEUR = roundMoney(
    positions.reduce((sum, position) => sum + (position.unrealizedPnlEUR ?? 0), 0),
  );

  return {
    marketValueEUR,
    costBasisEUR,
    unrealizedPnlEUR,
    unrealizedPnlPct: costBasisEUR > EPSILON ? roundMoney(unrealizedPnlEUR / costBasisEUR, 6) : null,
    realizedPnlEUR,
    dividendsEUR,
    rewardsEUR,
    feesEUR,
  };
};

const computeStandaloneTransactionTotals = (
  transactions: AnalyticsTransaction[],
  fxSnapshots: FxSnapshot[],
) => {
  let dividendsEUR = 0;
  let rewardsEUR = 0;
  let feesEUR = 0;

  for (const transaction of transactions) {
    if (isAssetLinked(transaction)) continue;
    const transactionCurrency = transaction.currency ?? DEFAULT_CURRENCY;
    const nativeAmount = getNativeAmount(transaction);
    const feeAmount = getFeeAmount(transaction);

    if (transaction.kind === 'DIVIDEND') {
      const incomeEUR = convertToEur(nativeAmount, transactionCurrency, fxSnapshots, transaction.date);
      if (incomeEUR !== null) dividendsEUR = roundMoney(dividendsEUR + incomeEUR);
    }

    if (transaction.kind === 'STAKING_REWARD' || transaction.kind === 'AIRDROP' || transaction.kind === 'SWAP_IN') {
      const rewardEUR = convertToEur(nativeAmount, transactionCurrency, fxSnapshots, transaction.date);
      if (rewardEUR !== null) rewardsEUR = roundMoney(rewardsEUR + rewardEUR);
    }

    if (transaction.kind === 'FEE') {
      const feeEUR = convertToEur(feeAmount ?? nativeAmount, transactionCurrency, fxSnapshots, transaction.date);
      if (feeEUR !== null) feesEUR = roundMoney(feesEUR + feeEUR);
    }
  }

  return { dividendsEUR, rewardsEUR, feesEUR };
};

const computeDataQuality = (
  positions: PortfolioAnalyticsPosition[],
  transactions: AnalyticsTransaction[],
  matchedTransferInById: Map<string, AnalyticsTransaction>,
  matchedTransferOutById: Map<string, AnalyticsTransaction>,
): PortfolioAnalyticsDataQuality => ({
  missingPricePositions: positions.filter((position) => position.dataQuality.missingPrice).length,
  missingFxPositions: positions.filter((position) => position.dataQuality.missingFx).length,
  missingCostBasisPositions: positions.filter((position) => position.dataQuality.missingCostBasis).length,
  unsupportedTransactionCount: transactions.filter((transaction) =>
    !ACQUISITION_KINDS.has(transaction.kind) &&
    !DISPOSITION_KINDS.has(transaction.kind) &&
    !INCOME_KINDS.has(transaction.kind) &&
    transaction.kind !== 'FEE' &&
    !UNSETTLED_KINDS.has(transaction.kind) &&
    transaction.kind !== 'TRANSFER_IN' &&
    transaction.kind !== 'TRANSFER_OUT' &&
    transaction.kind !== 'SWAP_IN' &&
    transaction.kind !== 'SWAP_OUT',
  ).length,
  unmatchedTransferCount: transactions.filter((transaction) =>
    (transaction.kind === 'TRANSFER_IN' || transaction.kind === 'TRANSFER_OUT') &&
    !matchedTransferInById.has(transaction.id) &&
    !matchedTransferOutById.has(transaction.id),
  ).length,
});

export const analyzePortfolio = (input: PortfolioAnalyticsInput): PortfolioAnalyticsSummary => {
  const authoritativeTransactions = selectAuthoritativeTransactions(input.transactions);
  const standaloneTotals = computeStandaloneTransactionTotals(authoritativeTransactions, input.fxSnapshots);
  const transferOutBasisById = new Map<string, number>();

  const firstPassByPair = new Map<string, AnalyticsTransaction[]>();
  for (const transaction of authoritativeTransactions) {
    if (!isAssetLinked(transaction)) continue;
    const key = makePairKey(transaction.assetId, transaction.platformId);
    const list = firstPassByPair.get(key);
    if (list) list.push(transaction);
    else firstPassByPair.set(key, [transaction]);
  }

  for (const transactions of firstPassByPair.values()) {
    const ledger = analyzePairTransactions(transactions, input.fxSnapshots);
    for (const [id, basis] of ledger.transferOutBasisById.entries()) {
      transferOutBasisById.set(id, basis);
    }
  }

  const { matchedTransferInById, matchedTransferOutById } = buildTransferMatchMap(authoritativeTransactions);
  const transferInBasisById = new Map<string, number>();
  for (const [transferInId, transferOut] of matchedTransferInById.entries()) {
    const basis = transferOutBasisById.get(transferOut.id);
    if (isFiniteNumber(basis)) {
      transferInBasisById.set(transferInId, basis);
    }
  }

  const positions: PortfolioAnalyticsPosition[] = [];
  for (const asset of input.assets) {
    for (const platform of input.platforms) {
      const position = buildPositionAnalytics(
        asset,
        platform,
        authoritativeTransactions,
        input.priceSnapshots,
        input.fxSnapshots,
        transferInBasisById,
      );
      if (position) {
        positions.push(position);
      }
    }
  }

  positions.sort((a, b) => {
    if (a.marketValueEUR === null && b.marketValueEUR === null) return a.asset.symbol.localeCompare(b.asset.symbol);
    if (a.marketValueEUR === null) return 1;
    if (b.marketValueEUR === null) return -1;
    if (b.marketValueEUR !== a.marketValueEUR) return b.marketValueEUR - a.marketValueEUR;
    if (a.platformId !== b.platformId) return a.platformId.localeCompare(b.platformId);
    return a.asset.symbol.localeCompare(b.asset.symbol);
  });

  const holdings = aggregateHoldings(positions).sort((a, b) => {
    const left = a.marketValueEUR ?? -Infinity;
    const right = b.marketValueEUR ?? -Infinity;
    if (left !== right) return right - left;
    return a.asset.symbol.localeCompare(b.asset.symbol);
  });

  const byPlatform = aggregateGroups(positions, (position) => ({
    key: position.platformId,
    label: position.platform.name,
  }));

  const byType = aggregateGroups(positions, (position) => ({
    key: position.asset.type,
    label: position.asset.type,
  }));

  const winners = holdings
    .filter((holding) => holding.unrealizedPnlEUR !== null && holding.unrealizedPnlEUR > 0)
    .sort((a, b) => (b.unrealizedPnlPct ?? -Infinity) - (a.unrealizedPnlPct ?? -Infinity));

  const losers = holdings
    .filter((holding) => holding.unrealizedPnlEUR !== null && holding.unrealizedPnlEUR < 0)
    .sort((a, b) => (a.unrealizedPnlPct ?? Infinity) - (b.unrealizedPnlPct ?? Infinity));

  const totals = computeTotals(positions);

  return {
    positions,
    holdings,
    byPlatform,
    byType,
    winners,
    losers,
    totals: {
      ...totals,
      dividendsEUR: roundMoney(totals.dividendsEUR + standaloneTotals.dividendsEUR),
      rewardsEUR: roundMoney(totals.rewardsEUR + standaloneTotals.rewardsEUR),
      feesEUR: roundMoney(totals.feesEUR + standaloneTotals.feesEUR),
    },
    dataQuality: computeDataQuality(positions, authoritativeTransactions, matchedTransferInById, matchedTransferOutById),
  };
};

export const analyzePortfolioTotals = (input: PortfolioAnalyticsInput) =>
  analyzePortfolio(input).totals;

export const analyzePortfolioDataQuality = (input: PortfolioAnalyticsInput) =>
  analyzePortfolio(input).dataQuality;
