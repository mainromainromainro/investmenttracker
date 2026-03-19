import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeading } from '../../components/PageHeading';
import { usePlatformStore } from '../../stores/platformStore';
import { useAssetStore } from '../../stores/assetStore';
import { useTransactionStore } from '../../stores/transactionStore';
import { usePriceStore } from '../../stores/priceStore';
import { useFxStore } from '../../stores/fxStore';
import { computePortfolioSummary } from '../../lib/computations';
import { PortfolioHistoryPoint, Position } from '../../types';
import { fetchFxRatesToEur, fetchLiveQuotes } from '../../lib/liveMarketData';

interface DisplayPosition extends Position {
  id: string;
  weightPct: number | null;
}

interface AllocationSlice {
  id: string;
  label: string;
  subtitle: string;
  valueEUR: number;
  pct: number;
  color: string;
}

const ALLOCATION_COLORS = [
  '#efe1bf',
  '#d7e3c1',
  '#a9c8a0',
  '#7fa285',
  '#c6d7b6',
  '#93b18e',
  '#e7d6b2',
];

const formatCurrency = (value: number, currency = 'EUR') =>
  new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

const formatSignedCurrency = (value: number, currency = 'EUR') => {
  const absolute = formatCurrency(Math.abs(value), currency);
  return `${value >= 0 ? '+' : '-'}${absolute}`;
};

const formatRatioPercent = (value: number | null) =>
  value === null ? 'n/a' : `${value >= 0 ? '+' : ''}${(value * 100).toFixed(2)}%`;

const formatPercent = (value: number) => `${(value * 100).toFixed(1)}%`;

const formatCompactQty = (value: number) => {
  if (Math.abs(value) >= 1000) return value.toFixed(0);
  if (Math.abs(value) >= 100) return value.toFixed(1);
  if (Math.abs(value) >= 1) return value.toFixed(4);
  return value.toFixed(6);
};

const formatShortDate = (value: number) =>
  new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(value);

const getValueTone = (value: number | null) => {
  if (value === null) return 'text-stone-300';
  return value >= 0 ? 'text-emerald-200' : 'text-rose-200';
};

const getPositionKey = (position: Position) =>
  `${position.assetId}:${position.platformId}:${position.accountId ?? '__platform__'}`;

const polarToCartesian = (cx: number, cy: number, radius: number, angleInDegrees: number) => {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(angleInRadians),
    y: cy + radius * Math.sin(angleInRadians),
  };
};

const describeDonutSegment = (
  cx: number,
  cy: number,
  innerRadius: number,
  outerRadius: number,
  startAngle: number,
  endAngle: number,
) => {
  const sweep = Math.max(0.001, endAngle - startAngle);
  const safeEndAngle = startAngle + Math.min(sweep, 359.999);
  const startOuter = polarToCartesian(cx, cy, outerRadius, safeEndAngle);
  const endOuter = polarToCartesian(cx, cy, outerRadius, startAngle);
  const startInner = polarToCartesian(cx, cy, innerRadius, safeEndAngle);
  const endInner = polarToCartesian(cx, cy, innerRadius, startAngle);
  const largeArcFlag = safeEndAngle - startAngle > 180 ? 1 : 0;

  return [
    `M ${startOuter.x} ${startOuter.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 0 ${endOuter.x} ${endOuter.y}`,
    `L ${endInner.x} ${endInner.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 1 ${startInner.x} ${startInner.y}`,
    'Z',
  ].join(' ');
};

const Panel: React.FC<{
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}> = ({ title, subtitle, children }) => (
  <section className="glass-card overflow-hidden rounded-3xl">
    <div className="border-b border-stone-300/10 px-6 py-4">
      <h3 className="text-lg font-semibold text-white">{title}</h3>
      {subtitle ? <p className="mt-1 text-sm text-stone-300">{subtitle}</p> : null}
    </div>
    {children}
  </section>
);

const StatTile: React.FC<{
  label: string;
  value: string;
  helper: string;
  tone?: 'neutral' | 'positive' | 'negative' | 'warn';
}> = ({ label, value, helper, tone = 'neutral' }) => {
  const toneClass =
    tone === 'positive'
      ? 'text-emerald-100'
      : tone === 'negative'
        ? 'text-rose-100'
        : tone === 'warn'
          ? 'text-amber-100'
          : 'text-white';

  return (
    <div className="rounded-2xl border border-stone-200/10 bg-black/10 p-4 backdrop-blur">
      <p className="text-xs uppercase tracking-[0.22em] text-stone-400">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${toneClass}`}>{value}</p>
      <p className="mt-2 text-xs leading-5 text-stone-300">{helper}</p>
    </div>
  );
};

const PortfolioEvolutionChart: React.FC<{ history: PortfolioHistoryPoint[] }> = ({ history }) => {
  const points = useMemo(
    () =>
      history
        .filter((entry) => entry.totalValueEUR !== null)
        .sort((left, right) => left.date - right.date)
        .map((entry) => ({
          date: entry.date,
          value: entry.totalValueEUR as number,
        })),
    [history],
  );
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  useEffect(() => {
    if (points.length === 0) {
      setHoveredIndex(null);
      return;
    }
    setHoveredIndex(points.length - 1);
  }, [points]);

  if (points.length === 0) {
    return (
      <Panel
        title="Évolution"
        subtitle="L’évolution apparaîtra dès que le portefeuille aura assez de points datés."
      >
        <div className="p-6 text-sm text-stone-300">
          Importez vos positions puis ajoutez des prix datés pour faire vivre la courbe.
        </div>
      </Panel>
    );
  }

  const width = 760;
  const height = 280;
  const paddingX = 22;
  const paddingY = 18;
  const chartWidth = width - paddingX * 2;
  const chartHeight = height - paddingY * 2;
  const values = points.map((point) => point.value);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const range = maxValue - minValue || Math.max(1, maxValue * 0.02);
  const activeIndex = hoveredIndex === null ? points.length - 1 : hoveredIndex;
  const activePoint = points[Math.max(0, Math.min(activeIndex, points.length - 1))];
  const startPoint = points[0];
  const delta = activePoint.value - startPoint.value;
  const deltaPct = startPoint.value === 0 ? 0 : delta / startPoint.value;

  const toX = (index: number) =>
    points.length <= 1 ? paddingX : paddingX + (index / (points.length - 1)) * chartWidth;
  const toY = (value: number) =>
    height - paddingY - ((value - minValue) / range) * chartHeight;

  const linePoints = points.map((point, index) => `${toX(index)},${toY(point.value)}`);
  const linePath = `M ${linePoints.join(' L ')}`;
  const areaPath = `${linePath} L ${toX(points.length - 1)},${height - paddingY} L ${paddingX},${height - paddingY} Z`;
  const activeX = toX(activeIndex);
  const activeY = toY(activePoint.value);

  return (
    <Panel
      title="Évolution"
      subtitle="Passez la souris sur la courbe pour voir la valeur du portefeuille à une date donnée."
    >
      <div className="bg-gradient-to-br from-[#254535] via-[#315943] to-[#777652] p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-stone-300">Point actif</p>
            <p className="mt-2 text-3xl font-semibold text-white">{formatCurrency(activePoint.value)}</p>
            <p className="mt-1 text-sm text-stone-300">{formatShortDate(activePoint.date)}</p>
          </div>
          <div className="rounded-2xl border border-stone-200/10 bg-black/10 px-4 py-3 text-right">
            <p className="text-xs uppercase tracking-[0.22em] text-stone-400">Variation depuis le départ</p>
            <p className={`mt-2 text-lg font-semibold ${delta >= 0 ? 'text-emerald-100' : 'text-rose-100'}`}>
              {formatSignedCurrency(delta)}
            </p>
            <p className={`text-sm ${delta >= 0 ? 'text-emerald-200' : 'text-rose-200'}`}>
              {formatRatioPercent(deltaPct)}
            </p>
          </div>
        </div>

        <div className="mt-5 overflow-x-auto">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="h-72 w-full min-w-[680px]"
            onMouseLeave={() => setHoveredIndex(points.length - 1)}
          >
            <defs>
              <linearGradient id="simpleDashboardArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f2e4c2" stopOpacity="0.32" />
                <stop offset="100%" stopColor="#f2e4c2" stopOpacity="0.04" />
              </linearGradient>
              <linearGradient id="simpleDashboardLine" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#f3e1b7" />
                <stop offset="100%" stopColor="#9fd0a0" />
              </linearGradient>
            </defs>

            {[0, 1, 2, 3].map((tick) => {
              const y = paddingY + (chartHeight / 3) * tick;
              return (
                <line
                  key={tick}
                  x1={paddingX}
                  x2={width - paddingX}
                  y1={y}
                  y2={y}
                  stroke="rgba(226, 232, 240, 0.16)"
                  strokeWidth="1"
                />
              );
            })}

            <path d={areaPath} fill="url(#simpleDashboardArea)" />
            <path
              d={linePath}
              fill="none"
              stroke="url(#simpleDashboardLine)"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            <line
              x1={activeX}
              x2={activeX}
              y1={paddingY}
              y2={height - paddingY}
              stroke="rgba(245, 245, 244, 0.28)"
              strokeDasharray="4 6"
            />
            <circle cx={activeX} cy={activeY} r="7" fill="#fbf7ef" stroke="#214634" strokeWidth="3" />

            {points.map((point, index) => (
              <g
                key={`${point.date}-${index}`}
                onMouseEnter={() => setHoveredIndex(index)}
              >
                <circle cx={toX(index)} cy={toY(point.value)} r="14" fill="transparent" />
              </g>
            ))}
          </svg>
        </div>

        <div className="mt-2 flex justify-between text-xs text-stone-300">
          <span>{formatShortDate(startPoint.date)}</span>
          <span>{formatShortDate(points[points.length - 1].date)}</span>
        </div>
      </div>
    </Panel>
  );
};

const AllocationFocus: React.FC<{
  slices: AllocationSlice[];
  focusedId: string | null;
  onFocus: (id: string | null) => void;
}> = ({ slices, focusedId, onFocus }) => {
  if (slices.length === 0) {
    return (
      <Panel
        title="Répartition"
        subtitle="La répartition s’affichera dès qu’au moins une position aura une valorisation."
      >
        <div className="p-6 text-sm text-stone-300">
          Aucune position valorisée pour le moment.
        </div>
      </Panel>
    );
  }

  const activeSlice = slices.find((slice) => slice.id === focusedId) ?? slices[0];
  const cx = 140;
  const cy = 140;
  const outerRadius = 104;
  const innerRadius = 64;
  let currentAngle = -90;

  return (
    <Panel
      title="Répartition"
      subtitle="Les plus grosses positions du portefeuille, avec mise en avant au survol."
    >
      <div className="grid gap-6 p-6 xl:grid-cols-[280px_1fr]">
        <div className="mx-auto w-full max-w-[280px]">
          <svg viewBox="0 0 280 280" className="w-full">
            <circle cx={cx} cy={cy} r={outerRadius} fill="rgba(3, 7, 18, 0.18)" />
            {slices.map((slice) => {
              const sweep = slice.pct * 360;
              const startAngle = currentAngle;
              const endAngle = currentAngle + sweep;
              currentAngle = endAngle;
              const isActive = activeSlice.id === slice.id;

              return (
                <path
                  key={slice.id}
                  d={describeDonutSegment(cx, cy, innerRadius, outerRadius, startAngle, endAngle)}
                  fill={slice.color}
                  stroke={isActive ? '#f8fafc' : 'rgba(3, 7, 18, 0.3)'}
                  strokeWidth={isActive ? 3 : 1}
                  opacity={isActive ? 1 : 0.78}
                  onMouseEnter={() => onFocus(slice.id)}
                  onMouseLeave={() => onFocus(null)}
                  className="cursor-pointer transition-opacity"
                />
              );
            })}
            <circle cx={cx} cy={cy} r={innerRadius - 2} fill="#052e2b" />
            <text x={cx} y={cy - 12} textAnchor="middle" className="fill-stone-300 text-[10px] uppercase tracking-[0.24em]">
              Focus
            </text>
            <text x={cx} y={cy + 12} textAnchor="middle" className="fill-white text-[20px] font-semibold">
              {activeSlice.label}
            </text>
            <text x={cx} y={cy + 34} textAnchor="middle" className="fill-stone-300 text-[11px]">
              {formatPercent(activeSlice.pct)}
            </text>
          </svg>
          <div className="mt-4 rounded-2xl border border-stone-200/10 bg-black/10 p-4 text-center">
            <p className="text-sm font-semibold text-white">{formatCurrency(activeSlice.valueEUR)}</p>
            <p className="mt-1 text-xs text-stone-300">{activeSlice.subtitle}</p>
          </div>
        </div>

        <div className="space-y-3">
          {slices.map((slice) => {
            const isActive = activeSlice.id === slice.id;
            return (
              <button
                key={slice.id}
                type="button"
                onMouseEnter={() => onFocus(slice.id)}
                onMouseLeave={() => onFocus(null)}
                className={`flex w-full items-center justify-between gap-4 rounded-2xl border px-4 py-3 text-left transition ${
                  isActive
                    ? 'border-stone-100/40 bg-white/10'
                    : 'border-stone-200/10 bg-black/10 hover:border-stone-200/20 hover:bg-white/5'
                }`}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: slice.color }}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-stone-100">{slice.label}</p>
                    <p className="truncate text-xs text-stone-300">{slice.subtitle}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-white">{formatCurrency(slice.valueEUR)}</p>
                  <p className="text-xs text-stone-300">{formatPercent(slice.pct)}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </Panel>
  );
};

const PositionsTable: React.FC<{
  positions: DisplayPosition[];
  focusedId: string | null;
  onFocus: (id: string | null) => void;
}> = ({ positions, focusedId, onFocus }) => (
  <Panel
    title="Positions"
    subtitle="Toutes vos lignes, avec quantité, valeur actuelle et performance."
  >
    <div className="overflow-x-auto">
      <table className="w-full min-w-[880px] text-sm">
        <thead className="bg-emerald-950/55 text-stone-200">
          <tr>
            <th className="px-6 py-3 text-left font-semibold">Actif</th>
            <th className="px-6 py-3 text-left font-semibold">Plateforme</th>
            <th className="px-6 py-3 text-right font-semibold">Qté</th>
            <th className="px-6 py-3 text-right font-semibold">Prix</th>
            <th className="px-6 py-3 text-right font-semibold">Investi</th>
            <th className="px-6 py-3 text-right font-semibold">Valeur</th>
            <th className="px-6 py-3 text-right font-semibold">Perf</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-emerald-900/40">
          {positions.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-6 py-5 text-center text-stone-300">
                Aucune position pour le moment.
              </td>
            </tr>
          ) : (
            positions.map((position) => {
              const isActive = focusedId === position.id;
              return (
                <tr
                  key={position.id}
                  onMouseEnter={() => onFocus(position.id)}
                  onMouseLeave={() => onFocus(null)}
                  className={`transition ${
                    isActive ? 'bg-white/10' : 'hover:bg-emerald-950/35'
                  }`}
                >
                  <td className="px-6 py-4 text-stone-100">
                    <div className="font-semibold text-white">{position.asset.symbol}</div>
                    <div className="text-xs text-stone-300">{position.asset.name}</div>
                  </td>
                  <td className="px-6 py-4 text-stone-200">
                    <div>{position.platform.name}</div>
                    <div className="text-xs text-stone-300">{position.asset.type}</div>
                  </td>
                  <td className="px-6 py-4 text-right text-stone-100">{formatCompactQty(position.qty)}</td>
                  <td className="px-6 py-4 text-right text-stone-100">
                    {position.latestPrice !== null ? `${position.currency} ${position.latestPrice.toFixed(2)}` : 'Prix manquant'}
                  </td>
                  <td className="px-6 py-4 text-right text-stone-100">
                    {position.costBasisEUR !== null ? formatCurrency(position.costBasisEUR) : 'PRU manquant'}
                  </td>
                  <td className="px-6 py-4 text-right text-white">
                    <div className="font-semibold">
                      {position.valueEUR !== null ? formatCurrency(position.valueEUR) : 'Valorisation manquante'}
                    </div>
                    <div className="mt-2 h-1.5 rounded-full bg-emerald-950/75">
                      <div
                        className="h-1.5 rounded-full bg-gradient-to-r from-amber-200 to-emerald-300"
                        style={{ width: `${Math.max(4, (position.weightPct ?? 0) * 100)}%` }}
                      />
                    </div>
                  </td>
                  <td className={`px-6 py-4 text-right font-semibold ${getValueTone(position.unrealizedPnlEUR)}`}>
                    <div>{position.unrealizedPnlEUR !== null ? formatSignedCurrency(position.unrealizedPnlEUR) : 'n/a'}</div>
                    <div className="text-xs text-stone-300">{formatRatioPercent(position.unrealizedPnlPct)}</div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  </Panel>
);

const Dashboard: React.FC = () => {
  const platforms = usePlatformStore((state) => state.platforms);
  const fetchPlatforms = usePlatformStore((state) => state.fetchPlatforms);

  const assets = useAssetStore((state) => state.assets);
  const fetchAssets = useAssetStore((state) => state.fetchAssets);
  const updateAsset = useAssetStore((state) => state.updateAsset);

  const transactions = useTransactionStore((state) => state.transactions);
  const fetchTransactions = useTransactionStore((state) => state.fetchTransactions);

  const prices = usePriceStore((state) => state.prices);
  const fetchPrices = usePriceStore((state) => state.fetchPrices);
  const addPrice = usePriceStore((state) => state.addPrice);

  const fxSnapshots = useFxStore((state) => state.fxSnapshots);
  const fetchFxSnapshots = useFxStore((state) => state.fetchFxSnapshots);
  const addFxSnapshot = useFxStore((state) => state.addFxSnapshot);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadDashboardData = async () => {
      setLoading(true);
      setError(null);
      try {
        await Promise.all([
          fetchPlatforms(),
          fetchAssets(),
          fetchTransactions(),
          fetchPrices(),
          fetchFxSnapshots(),
        ]);
      } catch (loadError) {
        if (!isMounted) return;
        const message = loadError instanceof Error ? loadError.message : 'Impossible de charger le dashboard.';
        setError(message);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void loadDashboardData();

    return () => {
      isMounted = false;
    };
  }, [fetchPlatforms, fetchAssets, fetchTransactions, fetchPrices, fetchFxSnapshots]);

  const summary = useMemo(
    () => computePortfolioSummary(assets, transactions, prices, fxSnapshots, platforms),
    [assets, transactions, prices, fxSnapshots, platforms],
  );

  const positions = useMemo<DisplayPosition[]>(() => {
    const activePositions = summary.positions
      .filter((position) => Math.abs(position.qty) > 1e-12)
      .slice()
      .sort((left, right) => {
        const leftValue = left.valueEUR ?? -Infinity;
        const rightValue = right.valueEUR ?? -Infinity;
        if (leftValue === rightValue) {
          return left.asset.symbol.localeCompare(right.asset.symbol);
        }
        return rightValue - leftValue;
      });

    const knownValueTotal = activePositions.reduce((sum, position) => sum + (position.valueEUR ?? 0), 0);
    return activePositions.map((position) => ({
      ...position,
      id: getPositionKey(position),
      weightPct:
        position.valueEUR !== null && knownValueTotal > 0
          ? position.valueEUR / knownValueTotal
          : null,
    }));
  }, [summary.positions]);

  useEffect(() => {
    if (focusedId && !positions.some((position) => position.id === focusedId)) {
      setFocusedId(null);
    }
  }, [focusedId, positions]);

  const valuedPositionsCount = positions.filter((position) => position.valueEUR !== null).length;
  const missingValuationCount = positions.length - valuedPositionsCount;
  const missingCostBasisCount = positions.filter((position) => position.costBasisEUR === null).length;
  const knownValueTotal = positions.reduce((sum, position) => sum + (position.valueEUR ?? 0), 0);
  const knownCostBasisTotal = positions.reduce((sum, position) => sum + (position.costBasisEUR ?? 0), 0);
  const knownPerformanceTotal = positions.reduce((sum, position) => sum + (position.unrealizedPnlEUR ?? 0), 0);
  const completeValuation = missingValuationCount === 0;
  const completeCostBasis = missingCostBasisCount === 0;
  const completePerformance =
    completeValuation && completeCostBasis && positions.every((position) => position.unrealizedPnlEUR !== null);
  const coveragePct = positions.length === 0 ? 0 : Math.round((valuedPositionsCount / positions.length) * 100);

  const allocationSlices = useMemo<AllocationSlice[]>(() => {
    const valuedPositions = positions.filter(
      (position): position is DisplayPosition & { valueEUR: number } =>
        position.valueEUR !== null && position.valueEUR > 0,
    );
    if (valuedPositions.length === 0 || knownValueTotal <= 0) {
      return [];
    }

    const topPositions = valuedPositions.slice(0, 6);
    const topValue = topPositions.reduce((sum, position) => sum + position.valueEUR, 0);
    const slices = topPositions.map((position, index) => ({
      id: position.id,
      label: position.asset.symbol,
      subtitle: `${position.platform.name} · ${position.asset.type}`,
      valueEUR: position.valueEUR,
      pct: position.valueEUR / knownValueTotal,
      color: ALLOCATION_COLORS[index % ALLOCATION_COLORS.length],
    }));

    const otherValue = Math.max(0, knownValueTotal - topValue);
    const otherCount = valuedPositions.length - topPositions.length;
    if (otherCount > 0 && otherValue > 0.01) {
      slices.push({
        id: '__other__',
        label: 'Autres',
        subtitle: `${otherCount} position${otherCount > 1 ? 's' : ''}`,
        valueEUR: otherValue,
        pct: otherValue / knownValueTotal,
        color: '#475569',
      });
    }

    return slices;
  }, [knownValueTotal, positions]);

  const handleSyncLiveData = async () => {
    if (!assets.length || syncing) return;

    setSyncing(true);
    setSyncMessage(null);

    try {
      const quoteResult = await fetchLiveQuotes(assets);
      const now = Date.now();

      for (let index = 0; index < quoteResult.quotes.length; index += 1) {
        const quote = quoteResult.quotes[index];
        const relatedAsset = assets.find((asset) => asset.id === quote.assetId);
        if (relatedAsset && relatedAsset.currency !== quote.currency) {
          await updateAsset(relatedAsset.id, { currency: quote.currency });
        }

        await addPrice({
          id: `price_live_${quote.assetId}_${quote.date}_${index}_${now}`,
          assetId: quote.assetId,
          date: quote.date,
          price: quote.price,
          currency: quote.currency,
        });
      }

      const allCurrencies = Array.from(
        new Set([
          ...assets.map((asset) => asset.currency),
          ...quoteResult.quotes.map((quote) => quote.currency),
        ]),
      );
      const fxResult = await fetchFxRatesToEur(allCurrencies);
      const fxEntries = Object.entries(fxResult.rates);

      for (let index = 0; index < fxEntries.length; index += 1) {
        const [currency, rate] = fxEntries[index];
        await addFxSnapshot({
          id: `fx_live_${currency}_${now}_${index}`,
          pair: `${currency}/EUR`,
          date: now,
          rate,
        });
      }

      await Promise.all([fetchAssets(), fetchPrices(), fetchFxSnapshots()]);

      const parts = [
        `${quoteResult.quotes.length}/${assets.length} prix live`,
        `${fxEntries.length} taux FX`,
      ];
      if (quoteResult.errors.length > 0) {
        parts.push(`${quoteResult.errors.length} ticker${quoteResult.errors.length > 1 ? 's' : ''} non résolu${quoteResult.errors.length > 1 ? 's' : ''}`);
      }
      if (fxResult.errors.length > 0) {
        parts.push(`${fxResult.errors.length} paire${fxResult.errors.length > 1 ? 's' : ''} FX manquante${fxResult.errors.length > 1 ? 's' : ''}`);
      }
      setSyncMessage(`Sync terminé: ${parts.join(' · ')}.`);
    } catch (syncError) {
      const message = syncError instanceof Error ? syncError.message : 'Erreur pendant la synchronisation.';
      setSyncMessage(`Échec de la synchro: ${message}`);
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return <div className="py-6 text-center text-[#607060]">Chargement du dashboard...</div>;
  }

  if (positions.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <PageHeading
            title="Dashboard"
            subtitle="Vos positions, leur valeur actuelle et leur évolution."
          />
          <button
            type="button"
            onClick={handleSyncLiveData}
            disabled
            className="h-fit rounded-lg border border-stone-100/20 bg-stone-100/10 px-4 py-2 text-sm font-medium text-stone-200 opacity-60"
          >
            Sync live
          </button>
        </div>

        {error && (
          <div className="rounded-2xl border border-rose-300/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            {error}
          </div>
        )}

        <div className="rounded-3xl border border-[#d6dccd] bg-gradient-to-br from-[#f7f2e8] via-[#eef3e8] to-[#dce7d8] p-8 text-center shadow-[0_24px_60px_rgba(88,102,74,0.12)]">
          <p className="text-xs uppercase tracking-[0.26em] text-[#71806f]">Vue simple</p>
          <h2 className="mt-3 text-3xl font-semibold text-[#173326]">
            Le dashboard affichera ici vos positions, leur valeur et leur évolution.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-[#607060]">
            Commencez par importer un CSV. Ensuite l’accueil se limitera à l’essentiel: les lignes ouvertes,
            la valeur actuelle du portefeuille et quelques graphiques interactifs.
          </p>
          <div className="mt-6">
            <Link
              to="/settings"
              className="inline-flex rounded-full bg-[#2e6a4c] px-5 py-3 text-sm font-semibold text-[#faf5eb] transition hover:bg-[#25563d]"
            >
              Importer un CSV
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageHeading
          title="Dashboard"
          subtitle="Vos positions, leur valeur actuelle et leur évolution."
        />
        <button
          type="button"
          onClick={handleSyncLiveData}
          disabled={syncing || assets.length === 0}
          className="h-fit rounded-lg border border-stone-100/40 bg-stone-100 px-4 py-2 text-sm font-medium text-emerald-950 transition hover:bg-stone-200 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {syncing ? 'Synchro en cours...' : 'Sync live'}
        </button>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-300/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      )}

      {syncMessage && (
        <div className="rounded-2xl border border-emerald-300/20 bg-emerald-500/10 px-4 py-3 text-sm text-stone-100">
          {syncMessage}
        </div>
      )}

      <div className="rounded-3xl border border-stone-200/10 bg-gradient-to-br from-[#264838] via-[#315a42] to-[#797550] p-6 shadow-2xl shadow-emerald-950/20">
        <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
          <div>
            <p className="text-xs uppercase tracking-[0.26em] text-stone-300">Vue simple</p>
            <h2 className="mt-2 text-3xl font-semibold text-white sm:text-4xl">
              Voir rapidement ce que vous détenez et combien ça vaut.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-200">
              L’accueil est recentré sur l’essentiel: les positions ouvertes, la valeur actuelle,
              le capital investi et une lecture visuelle de l’évolution du portefeuille.
            </p>

            <div className="mt-5 flex flex-wrap gap-3 text-xs text-stone-200">
              <span className="rounded-full border border-stone-200/15 bg-black/10 px-3 py-1.5">
                {positions.length} position{positions.length > 1 ? 's' : ''} ouverte{positions.length > 1 ? 's' : ''}
              </span>
              <span className="rounded-full border border-stone-200/15 bg-black/10 px-3 py-1.5">
                {summary.byPlatform.length} plateforme{summary.byPlatform.length > 1 ? 's' : ''}
              </span>
              <span className="rounded-full border border-stone-200/15 bg-black/10 px-3 py-1.5">
                {coveragePct}% valorisé
              </span>
            </div>

            {(missingValuationCount > 0 || missingCostBasisCount > 0) && (
              <div className="mt-5 rounded-2xl border border-amber-300/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                {missingValuationCount > 0
                  ? `${missingValuationCount} position${missingValuationCount > 1 ? 's' : ''} sans prix ou FX complet. `
                  : ''}
                {missingCostBasisCount > 0
                  ? `${missingCostBasisCount} position${missingCostBasisCount > 1 ? 's' : ''} sans PRU complet.`
                  : ''}
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <StatTile
              label="Valeur actuelle"
              value={formatCurrency(completeValuation && summary.totalValueEUR !== null ? summary.totalValueEUR : knownValueTotal)}
              helper={
                completeValuation
                  ? 'Valorisation totale actuelle du portefeuille.'
                  : 'Valeur connue uniquement: certaines lignes n’ont pas encore de prix exploitable.'
              }
              tone="positive"
            />
            <StatTile
              label="Montant investi"
              value={formatCurrency(knownCostBasisTotal)}
              helper={
                completeCostBasis
                  ? 'Base de coût consolidée sur les positions ouvertes.'
                  : 'Partiel: certaines positions n’ont pas encore de PRU complet.'
              }
              tone={completeCostBasis ? 'neutral' : 'warn'}
            />
            <StatTile
              label="Performance"
              value={formatSignedCurrency(knownPerformanceTotal)}
              helper={
                completePerformance
                  ? formatRatioPercent(summary.totalUnrealizedPnlPct)
                  : 'Performance partielle: calcul limité aux lignes avec valorisation et coût connus.'
              }
              tone={knownPerformanceTotal >= 0 ? 'positive' : 'negative'}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.45fr_0.95fr]">
        <PortfolioEvolutionChart history={summary.history} />
        <AllocationFocus
          slices={allocationSlices}
          focusedId={focusedId}
          onFocus={setFocusedId}
        />
      </div>

      <PositionsTable
        positions={positions}
        focusedId={focusedId}
        onFocus={setFocusedId}
      />
    </div>
  );
};

export default Dashboard;
