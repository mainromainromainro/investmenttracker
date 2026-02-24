import React, { useEffect, useMemo, useState } from 'react';
import { PageHeading } from '../../components/PageHeading';
import { usePlatformStore } from '../../stores/platformStore';
import { useAssetStore } from '../../stores/assetStore';
import { useTransactionStore } from '../../stores/transactionStore';
import { usePriceStore } from '../../stores/priceStore';
import { useFxStore } from '../../stores/fxStore';
import { computePortfolioSummary } from '../../lib/computations';

const Dashboard: React.FC = () => {
  const platforms = usePlatformStore((s) => s.platforms);
  const fetchPlatforms = usePlatformStore((s) => s.fetchPlatforms);
  
  const assets = useAssetStore((s) => s.assets);
  const fetchAssets = useAssetStore((s) => s.fetchAssets);
  
  const transactions = useTransactionStore((s) => s.transactions);
  const fetchTransactions = useTransactionStore((s) => s.fetchTransactions);
  
  const prices = usePriceStore((s) => s.prices);
  const fetchPrices = usePriceStore((s) => s.fetchPrices);
  
  const fxSnapshots = useFxStore((s) => s.fxSnapshots);
  const fetchFxSnapshots = useFxStore((s) => s.fetchFxSnapshots);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      } catch (err) {
        if (!isMounted) return;
        const message = err instanceof Error ? err.message : 'Failed to load dashboard data.';
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
  }, [
    fetchPlatforms,
    fetchAssets,
    fetchTransactions,
    fetchPrices,
    fetchFxSnapshots,
  ]);

  const summary = useMemo(
    () => computePortfolioSummary(assets, transactions, prices, fxSnapshots, platforms),
    [assets, transactions, prices, fxSnapshots, platforms]
  );

  if (loading) {
    return <div className="text-center py-6">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeading
        title="Dashboard"
        subtitle="Portfolio overview in EUR"
      />

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Total Value KPI */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="text-center">
          <p className="text-gray-600 text-sm font-medium">Total Portfolio Value</p>
          <p className="text-5xl font-bold text-gray-900 mt-2">
            {summary.totalValueEUR !== null ? `€${summary.totalValueEUR.toFixed(2)}` : '—'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* By Platform */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">By Platform</h3>
          <div className="space-y-3">
            {summary.byPlatform.length === 0 ? (
              <p className="text-gray-500 text-sm">No platforms</p>
            ) : (
              summary.byPlatform.map((p) => (
                <div key={p.platformId} className="flex justify-between">
                  <span className="text-gray-700">{p.name}</span>
                  <span className="font-semibold text-gray-900">
                    {p.valueEUR !== null ? `€${p.valueEUR.toFixed(2)}` : 'Missing FX'}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* By Type */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">By Asset Type</h3>
          <div className="space-y-3">
            {summary.byType.length === 0 ? (
              <p className="text-gray-500 text-sm">No assets</p>
            ) : (
              summary.byType.map((t) => (
                <div key={t.type} className="flex justify-between">
                  <span className="text-gray-700">{t.type}</span>
                  <span className="font-semibold text-gray-900">
                    {t.valueEUR !== null ? `€${t.valueEUR.toFixed(2)}` : 'Missing FX'}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* All Positions Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b">
          <h3 className="text-lg font-semibold text-gray-900">All Positions</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Asset</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Platform</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Type</th>
                <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">Qty</th>
                <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">Price</th>
                <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">FX Rate</th>
                <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">Value EUR</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {summary.positions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-4 text-center text-gray-500">
                    No positions yet
                  </td>
                </tr>
              ) : (
                summary.positions.map((p) => (
                  <tr key={`${p.assetId}:${p.platformId}`} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-900">
                      <div>{p.asset.name}</div>
                      <div className="text-gray-500 text-xs">{p.asset.symbol}</div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">{p.platform.name}</td>
                    <td className="px-6 py-4 text-sm text-gray-700">{p.asset.type}</td>
                    <td className="px-6 py-4 text-sm text-right text-gray-900">{p.qty.toFixed(4)}</td>
                    <td className="px-6 py-4 text-sm text-right text-gray-900">
                      {p.latestPrice ? `${p.asset.currency} ${p.latestPrice.toFixed(2)}` : '—'}
                    </td>
                    <td className="px-6 py-4 text-sm text-right text-gray-900">
                      {p.fxRate !== null ? p.fxRate.toFixed(4) : '—'}
                    </td>
                    <td className="px-6 py-4 text-sm text-right font-semibold text-gray-900">
                      {p.valueEUR !== null ? `€${p.valueEUR.toFixed(2)}` : 'Missing FX'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
