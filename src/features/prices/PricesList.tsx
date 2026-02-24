import React, { useEffect, useState } from 'react';
import { PageHeading } from '../../components/PageHeading';
import { usePriceStore } from '../../stores/priceStore';
import { useAssetStore } from '../../stores/assetStore';

const PricesList: React.FC = () => {
  const prices = usePriceStore((s) => s.prices);
  const fetchPrices = usePriceStore((s) => s.fetchPrices);
  const addPrice = usePriceStore((s) => s.addPrice);
  const deletePrice = usePriceStore((s) => s.deletePrice);
  
  const assets = useAssetStore((s) => s.assets);
  const fetchAssets = useAssetStore((s) => s.fetchAssets);
  
  const [form, setForm] = useState({
    assetId: '',
    date: new Date().toISOString().split('T')[0],
    price: '',
    currency: 'EUR',
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadPrices = async () => {
      setLoading(true);
      setError(null);
      try {
        await Promise.all([fetchPrices(), fetchAssets()]);
      } catch (err) {
        if (!isMounted) return;
        const message = err instanceof Error ? err.message : 'Failed to load prices.';
        setError(message);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void loadPrices();

    return () => {
      isMounted = false;
    };
  }, [fetchPrices, fetchAssets]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.assetId || !form.price) return;
    
    await addPrice({
      id: `price_${Date.now()}`,
      assetId: form.assetId,
      date: new Date(form.date).getTime(),
      price: parseFloat(form.price),
      currency: form.currency,
    });
    setForm({
      assetId: '',
      date: new Date().toISOString().split('T')[0],
      price: '',
      currency: 'EUR',
    });
  };

  if (loading) {
    return <div className="text-center py-6">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeading
        title="Price Snapshots"
        subtitle="Record asset prices at specific dates"
      />

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Form */}
      <div className="bg-white rounded-lg shadow p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Asset</label>
              <select
                value={form.assetId}
                onChange={(e) => setForm({ ...form, assetId: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Select asset</option>
                {assets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.symbol} - {a.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Price</label>
              <input
                type="number"
                step="0.01"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                placeholder="0"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
              <input
                type="text"
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
                placeholder="EUR"
                maxLength={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition font-medium"
          >
            Add Price Snapshot
          </button>
        </form>
      </div>

      {/* List */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Asset</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Date</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-700">Price</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Currency</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {prices.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-4 text-center text-gray-500">
                    No price snapshots yet.
                  </td>
                </tr>
              ) : (
                prices.map((p) => {
                  const asset = assets.find((a) => a.id === p.assetId);
                  return (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-900">
                        {asset?.symbol || '—'} - {asset?.name || '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {new Date(p.date).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">
                        {p.price.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{p.currency}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => deletePrice(p.id)}
                          className="text-red-600 hover:text-red-700 text-xs font-medium"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default PricesList;
