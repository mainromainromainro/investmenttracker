import { describe, expect, it } from 'vitest';
import {
  NORMALIZED_TRANSACTION_HEADERS,
  parseNormalizedTransactionsCsv,
  suggestCsvColumnMapping,
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
      'platform,qty',
      'DEGIRO,10',
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

  it('does not crash when a row has missing trailing cells', () => {
    const csv = buildCsv([
      'date,platform,kind,asset_symbol,qty,price',
      '2025-01-03,Trading212,BUY,VUSA,0.048592',
    ]);

    const result = parseNormalizedTransactionsCsv(csv, { defaultCurrency: 'EUR' });
    expect(result.records).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.message).toContain('price doit');
  });

  it('auto-detects common broker column names and action aliases', () => {
    const csv = buildCsv([
      'Trade Date,Broker,Action,Ticker Symbol,Instrument Name,Quantity,Unit Price,Currency,Commission',
      '2025-02-01,Interactive Brokers,Purchase,MSFT,Microsoft,12,420.55,USD,1.25',
      '2025-02-05,Interactive Brokers,Sell,MSFT,Microsoft,2,430.10,USD,1.05',
    ]);

    const result = parseNormalizedTransactionsCsv(csv, { defaultCurrency: 'EUR' });
    expect(result.errors).toHaveLength(0);
    expect(result.records).toHaveLength(2);
    expect(result.records[0]?.kind).toBe('BUY');
    expect(result.records[1]?.kind).toBe('SELL');
    expect(result.records[0]?.assetSymbol).toBe('MSFT');
    expect(result.records[0]?.qty).toBe(12);
    expect(result.records[0]?.price).toBe(420.55);
  });

  it('parses European decimal formats and french-like headers', () => {
    const csv = buildCsv([
      'Date operation,Courtier,Operation,Ticker,Quantite,Prix,Devise,Frais',
      '01/02/2025,Trading212,Achat,VUSA,"0,048592","108,246",EUR,"0,20"',
    ]);

    const result = parseNormalizedTransactionsCsv(csv, { defaultCurrency: 'EUR' });
    expect(result.errors).toHaveLength(0);
    expect(result.records).toHaveLength(1);
    const record = result.records[0]!;
    expect(record.kind).toBe('BUY');
    expect(record.qty).toBeCloseTo(0.048592, 6);
    expect(record.price).toBeCloseTo(108.246, 3);
    expect(record.fee).toBeCloseTo(0.2, 3);
  });

  it('suggests a mapping with confidence for unknown headers', () => {
    const csv = buildCsv([
      'when,where,side,tkr,units,px,ccy',
      '2025-02-08,Degiro,BUY,VWCE,2,123.45,EUR',
    ]);

    const suggestion = suggestCsvColumnMapping(csv);
    expect(suggestion.headers).toHaveLength(7);
    expect(suggestion.mapping.date).toBe('when');
    expect(suggestion.mapping.platform).toBe('where');
    expect(suggestion.mapping.kind).toBe('side');
    expect(suggestion.mapping.qty).toBe('units');
    expect((suggestion.confidence.kind ?? 0)).toBeGreaterThan(0.5);
  });

  it('parses rows using manual mapping override', () => {
    const csv = buildCsv([
      'when,where,side,tkr,units,px,ccy',
      '2025-02-08,Degiro,BUY,VWCE,2,123.45,EUR',
    ]);

    const result = parseNormalizedTransactionsCsv(csv, {
      defaultCurrency: 'EUR',
      columnMapping: {
        date: 'when',
        platform: 'where',
        kind: 'side',
        asset_symbol: 'tkr',
        qty: 'units',
        price: 'px',
        currency: 'ccy',
      },
    });

    expect(result.errors).toHaveLength(0);
    expect(result.records).toHaveLength(1);
    expect(result.records[0]?.assetSymbol).toBe('VWCE');
    expect(result.records[0]?.kind).toBe('BUY');
    expect(result.records[0]?.price).toBeCloseTo(123.45);
  });

  it('accepts CSV without platform column when default platform is provided', () => {
    const csv = buildCsv([
      'date,kind,asset_symbol,qty,price,currency',
      '2025-02-12,BUY,VWCE,2,123.45,EUR',
    ]);

    const result = parseNormalizedTransactionsCsv(csv, {
      defaultCurrency: 'EUR',
      defaultPlatform: 'Trading 212',
    });

    expect(result.errors).toHaveLength(0);
    expect(result.records).toHaveLength(1);
    expect(result.records[0]?.platform).toBe('Trading 212');
  });

  it('fails without platform column when no default platform is provided', () => {
    const csv = buildCsv([
      'date,kind,asset_symbol,qty,price,currency',
      '2025-02-12,BUY,VWCE,2,123.45,EUR',
    ]);

    const result = parseNormalizedTransactionsCsv(csv, {
      defaultCurrency: 'EUR',
    });

    expect(result.records).toHaveLength(0);
    expect(result.errors[0]?.message).toContain('broker');
  });
});
