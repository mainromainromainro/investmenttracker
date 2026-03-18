import { describe, expect, it } from 'vitest';
import {
  buildImplicitZeroPositionSnapshots,
  buildSyntheticTransactionsFromPositionSnapshots,
  collapsePositionSnapshotInputs,
} from './positionSnapshots';
import { PositionSnapshot } from '../types';

describe('positionSnapshots', () => {
  it('adds implicit zero snapshots when a previously held ticker disappears from a monthly import', () => {
    const existingSnapshots: PositionSnapshot[] = [
      {
        id: 'snap_1',
        platformId: 'p1',
        assetId: 'a_vwce',
        date: Date.UTC(2025, 0, 31),
        qty: 10,
        price: 120,
        currency: 'EUR',
        createdAt: 1,
      },
      {
        id: 'snap_2',
        platformId: 'p1',
        assetId: 'a_msft',
        date: Date.UTC(2025, 0, 31),
        qty: 5,
        price: 400,
        currency: 'USD',
        createdAt: 2,
      },
    ];

    const importedSnapshots = [
      {
        platformId: 'p1',
        assetId: 'a_vwce',
        date: Date.UTC(2025, 1, 28),
        qty: 12,
        price: 123,
        currency: 'EUR',
      },
    ];

    const zeros = buildImplicitZeroPositionSnapshots(existingSnapshots, importedSnapshots);
    expect(zeros).toHaveLength(1);
    expect(zeros[0]).toMatchObject({
      platformId: 'p1',
      assetId: 'a_msft',
      date: Date.UTC(2025, 1, 28),
      qty: 0,
      currency: 'USD',
    });
  });

  it('rebuilds snapshot deltas in chronological order', () => {
    const snapshots = [
      {
        platformId: 'p1',
        assetId: 'a_vwce',
        date: Date.UTC(2025, 1, 28),
        qty: 15,
        price: 130,
        currency: 'EUR',
      },
      {
        platformId: 'p1',
        assetId: 'a_vwce',
        date: Date.UTC(2025, 0, 31),
        qty: 10,
        price: 120,
        currency: 'EUR',
      },
      {
        platformId: 'p1',
        assetId: 'a_vwce',
        date: Date.UTC(2025, 2, 31),
        qty: 9,
        price: 128,
        currency: 'EUR',
      },
    ];

    const transactions = buildSyntheticTransactionsFromPositionSnapshots(snapshots);
    expect(transactions).toHaveLength(3);
    expect(transactions[0]).toMatchObject({
      kind: 'BUY',
      qty: 10,
      date: Date.UTC(2025, 0, 31),
    });
    expect(transactions[1]).toMatchObject({
      kind: 'BUY',
      qty: 5,
      date: Date.UTC(2025, 1, 28),
    });
    expect(transactions[2]).toMatchObject({
      kind: 'SELL',
      qty: 6,
      date: Date.UTC(2025, 2, 31),
    });
  });

  it('collapses duplicate rows for the same platform, asset and month', () => {
    const collapsed = collapsePositionSnapshotInputs([
      {
        platformId: 'p1',
        assetId: 'a_vwce',
        date: Date.UTC(2025, 0, 31),
        qty: 3,
        price: 120,
        currency: 'EUR',
      },
      {
        platformId: 'p1',
        assetId: 'a_vwce',
        date: Date.UTC(2025, 0, 31),
        qty: 2,
        price: 121,
        currency: 'EUR',
      },
    ]);

    expect(collapsed).toHaveLength(1);
    expect(collapsed[0]?.qty).toBe(5);
    expect(collapsed[0]?.price).toBeCloseTo(120.4, 4);
  });
});
