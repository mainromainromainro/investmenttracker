import { describe, expect, it } from 'vitest';
import {
  NORMALIZED_TRANSACTION_HEADERS,
  parseNormalizedTransactionsCsv,
} from './csvImport';

const buildCsv = (rows: string[]): string => rows.join('\n');

describe('parseNormalizedTransactionsCsv', () => {
  it('parses a valid BUY row', () => {
    const header = NORMALIZED_TRANSACTION_HEADERS.join(',');
    const csv = buildCsv([
      header,
      '2024-01-01,DEGIRO,EUR,BUY,VWRL,Vanguard FTSE All-World,ETF,10,95.5,0.5,Allocation long terme',
    ]);

    const result = parseNormalizedTransactionsCsv(csv);
    expect(result.errors).toHaveLength(0);
    expect(result.records).toHaveLength(1);

    const [record] = result.records;
    expect(record.platform).toBe('DEGIRO');
    expect(record.assetSymbol).toBe('VWRL');
    expect(record.assetType).toBe('ETF');
    expect(record.qty).toBe(10);
    expect(record.price).toBe(95.5);
    expect(record.currency).toBe('EUR');
    expect(record.cashCurrency).toBe('EUR');
    expect(record.note).toBe('Allocation long terme');
  });

  it('rejects missing required headers', () => {
    const csv = buildCsv([
      'date,kind,qty',
      '2024-01-01,BUY,10',
    ]);

    const result = parseNormalizedTransactionsCsv(csv);
    expect(result.records).toHaveLength(0);
    expect(result.errors[0]?.message).toContain('Colonnes manquantes');
  });

  it('collects row level validation errors', () => {
    const header = NORMALIZED_TRANSACTION_HEADERS.join(',');
    const csv = buildCsv([
      header,
      'not-a-date,DEGIRO,EUR,BUY,VWRL,Vanguard,ETF,-5,abc,,',
    ]);

    const result = parseNormalizedTransactionsCsv(csv);
    expect(result.records).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.row).toBe(2);
  });

  it('supports optional fields for DEPOSIT transactions', () => {
    const header = NORMALIZED_TRANSACTION_HEADERS.join(',');
    const csv = buildCsv([
      header,
      '2024-01-10,DEGIRO,EUR,DEPOSIT,,,,,1000,,Depot',
    ]);

    const result = parseNormalizedTransactionsCsv(csv);
    expect(result.errors).toHaveLength(0);
    expect(result.records[0]?.kind).toBe('DEPOSIT');
    expect(result.records[0]?.assetSymbol).toBeUndefined();
    expect(result.records[0]?.currency).toBe('EUR');
  });

  it('parses Trading212 normalized columns with aliases', () => {
    const csv = buildCsv([
      'Date,Ticker,Type,Shares,Price,Broker,Fees',
      '2025-01-03,VUSA,BUY,0.048592,108.246,Trading212,0.0',
    ]);

    const result = parseNormalizedTransactionsCsv(csv, { defaultCurrency: 'EUR' });
    expect(result.errors).toHaveLength(0);
    expect(result.records).toHaveLength(1);
    const record = result.records[0]!;
    expect(record.platform).toBe('Trading212');
    expect(record.assetSymbol).toBe('VUSA');
    expect(record.qty).toBeCloseTo(0.048592);
    expect(record.price).toBeCloseTo(108.246);
    expect(record.currency).toBe('EUR');
    expect(record.cashCurrency).toBe('EUR');
    expect(record.assetType).toBe('STOCK');
  });
});
