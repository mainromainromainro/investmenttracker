import React, { useEffect, useState } from 'react';
import { PageHeading } from '../../components/PageHeading';
import { useTransactionStore } from '../../stores/transactionStore';
import { usePlatformStore } from '../../stores/platformStore';
import { useAssetStore } from '../../stores/assetStore';
import { Transaction, TransactionKind } from '../../types';

const TransactionsList: React.FC = () => {
  const transactions = useTransactionStore((s) => s.transactions);
  const fetchTransactions = useTransactionStore((s) => s.fetchTransactions);
  const addTransaction = useTransactionStore((s) => s.addTransaction);
  const updateTransaction = useTransactionStore((s) => s.updateTransaction);
  const deleteTransaction = useTransactionStore((s) => s.deleteTransaction);
  
  const platforms = usePlatformStore((s) => s.platforms);
  const fetchPlatforms = usePlatformStore((s) => s.fetchPlatforms);
  
  const assets = useAssetStore((s) => s.assets);
  const fetchAssets = useAssetStore((s) => s.fetchAssets);
  
  const [form, setForm] = useState({
    kind: 'BUY' as TransactionKind,
    platformId: '',
    assetId: '',
    date: new Date().toISOString().split('T')[0],
    qty: '',
    price: '',
    fee: '',
    currency: 'EUR',
    note: '',
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    kind: 'BUY' as TransactionKind,
    platformId: '',
    assetId: '',
    date: new Date().toISOString().split('T')[0],
    qty: '',
    price: '',
    fee: '',
    currency: 'EUR',
    note: '',
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadTransactions = async () => {
      setLoading(true);
      setError(null);
      try {
        await Promise.all([
          fetchTransactions(),
          fetchPlatforms(),
          fetchAssets(),
        ]);
      } catch (err) {
        if (!isMounted) return;
        const message = err instanceof Error ? err.message : 'Failed to load transactions.';
        setError(message);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void loadTransactions();

    return () => {
      isMounted = false;
    };
  }, [fetchTransactions, fetchPlatforms, fetchAssets]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.platformId) return;
    
    const transaction: Omit<Transaction, 'createdAt'> = {
      id: `tx_${Date.now()}`,
      kind: form.kind,
      platformId: form.platformId,
      date: new Date(form.date).getTime(),
      currency: form.currency,
    };

    // Add asset and amount fields based on kind
    if (['BUY', 'SELL'].includes(form.kind)) {
      if (!form.assetId || !form.qty || !form.price) return;
      transaction.assetId = form.assetId;
      transaction.qty = parseFloat(form.qty);
      transaction.price = parseFloat(form.price);
    }

    if (form.fee) {
      transaction.fee = parseFloat(form.fee);
    }

    if (form.note.trim()) {
      transaction.note = form.note.trim();
    }

    await addTransaction(transaction);
    setForm({
      kind: 'BUY',
      platformId: '',
      assetId: '',
      date: new Date().toISOString().split('T')[0],
      qty: '',
      price: '',
      fee: '',
      currency: 'EUR',
      note: '',
    });
  };

  if (loading) {
    return <div className="text-center py-6">Loading...</div>;
  }

  const showAssetFields = ['BUY', 'SELL'].includes(form.kind);
  const showEditAssetFields = ['BUY', 'SELL'].includes(editForm.kind);

  const beginEdit = (transaction: Transaction) => {
    setEditingId(transaction.id);
    setEditForm({
      kind: transaction.kind,
      platformId: transaction.platformId,
      assetId: transaction.assetId ?? '',
      date: new Date(transaction.date).toISOString().split('T')[0],
      qty: transaction.qty?.toString() ?? '',
      price: transaction.price?.toString() ?? '',
      fee: transaction.fee?.toString() ?? '',
      currency: transaction.currency,
      note: transaction.note ?? '',
    });
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;
    if (!editForm.platformId) return;

    const updates: Partial<Transaction> = {
      kind: editForm.kind,
      platformId: editForm.platformId,
      assetId: editForm.assetId || undefined,
      date: new Date(editForm.date).getTime(),
      currency: editForm.currency,
      note: editForm.note.trim() || undefined,
      qty: editForm.qty ? parseFloat(editForm.qty) : undefined,
      price: editForm.price ? parseFloat(editForm.price) : undefined,
      fee: editForm.fee ? parseFloat(editForm.fee) : undefined,
    };
    await updateTransaction(editingId, updates);
    setEditingId(null);
  };

  return (
    <div className="space-y-6">
      <PageHeading
        title="Transactions"
        subtitle="Record buy/sell/deposit/withdraw transactions"
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select
                value={form.kind}
                onChange={(e) => setForm({ ...form, kind: e.target.value as TransactionKind })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              >
                <option>BUY</option>
                <option>SELL</option>
                <option>DEPOSIT</option>
                <option>WITHDRAW</option>
                <option>FEE</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Platform</label>
              <select
                value={form.platformId}
                onChange={(e) => setForm({ ...form, platformId: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Select platform</option>
                {platforms.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
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

          {showAssetFields && (
            <>
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

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={form.qty}
                    onChange={(e) => setForm({ ...form, qty: e.target.value })}
                    placeholder="0"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

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
              </div>
            </>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fee (optional)</label>
            <input
              type="number"
              step="0.01"
              value={form.fee}
              onChange={(e) => setForm({ ...form, fee: e.target.value })}
              placeholder="0"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Note (optional)</label>
            <input
              type="text"
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder="Dividend, bonus, etc."
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <button
            type="submit"
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition font-medium"
          >
            Add Transaction
          </button>
        </form>
      </div>

      {editingId && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Modifier la transaction</h3>
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select
                  value={editForm.kind}
                  onChange={(e) =>
                    setEditForm({ ...editForm, kind: e.target.value as TransactionKind })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                >
                  <option>BUY</option>
                  <option>SELL</option>
                  <option>DEPOSIT</option>
                  <option>WITHDRAW</option>
                  <option>FEE</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Platform</label>
                <select
                  value={editForm.platformId}
                  onChange={(e) => setEditForm({ ...editForm, platformId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Select platform</option>
                  {platforms.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                <input
                  type="date"
                  value={editForm.date}
                  onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
                <input
                  type="text"
                  value={editForm.currency}
                  onChange={(e) =>
                    setEditForm({ ...editForm, currency: e.target.value.toUpperCase() })
                  }
                  maxLength={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            {showEditAssetFields && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Asset</label>
                  <select
                    value={editForm.assetId}
                    onChange={(e) => setEditForm({ ...editForm, assetId: e.target.value })}
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

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
                    <input
                      type="number"
                      step="0.0001"
                      value={editForm.qty}
                      onChange={(e) => setEditForm({ ...editForm, qty: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Price</label>
                    <input
                      type="number"
                      step="0.01"
                      value={editForm.price}
                      onChange={(e) => setEditForm({ ...editForm, price: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
              </>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fee</label>
                <input
                  type="number"
                  step="0.01"
                  value={editForm.fee}
                  onChange={(e) => setEditForm({ ...editForm, fee: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Note</label>
                <input
                  type="text"
                  value={editForm.note}
                  onChange={(e) => setEditForm({ ...editForm, note: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition"
              >
                Enregistrer
              </button>
              <button
                type="button"
                onClick={() => setEditingId(null)}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                Annuler
              </button>
            </div>
          </form>
        </div>
      )}

      {/* List */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Date</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Type</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Platform</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Asset</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-700">Qty</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-700">Price</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-700">Fee</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-4 text-center text-gray-500">
                    No transactions yet.
                  </td>
                </tr>
              ) : (
                transactions.map((t) => {
                  const platform = platforms.find((p) => p.id === t.platformId);
                  const asset = t.assetId ? assets.find((a) => a.id === t.assetId) : null;
                  return (
                    <tr key={t.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-900">
                        {new Date(t.date).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                          {t.kind}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{platform?.name || '—'}</td>
                      <td className="px-4 py-3 text-gray-700">{asset?.symbol || '—'}</td>
                      <td className="px-4 py-3 text-right text-gray-900">
                        {t.qty ? t.qty.toFixed(4) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-900">
                        {t.price ? t.price.toFixed(2) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-900">
                        {t.fee ? t.fee.toFixed(2) : '—'}
                      </td>
                    <td className="px-4 py-3 text-right space-x-3">
                      <button
                        onClick={() => beginEdit(t)}
                        className="text-blue-600 hover:text-blue-700 text-xs font-medium"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deleteTransaction(t.id)}
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

export default TransactionsList;
