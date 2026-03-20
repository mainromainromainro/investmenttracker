import { describe, expect, it } from 'vitest';
import {
  NORMALIZED_POSITION_SNAPSHOT_HEADERS,
  NORMALIZED_TRANSACTION_HEADERS,
  parseNormalizedPositionSnapshotsCsv,
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

  it('parses a Trading 212 export row without manual mapping', () => {
    const csv = buildCsv([
      'Action,Time,ISIN,Ticker,Name,Notes,ID,No. of shares,Price / share,Currency (Price / share),Exchange rate,Result,Currency (Result),Total,Currency (Total),Currency conversion fee,Currency (Currency conversion fee),French transaction tax,Currency (French transaction tax)',
      [
        'Market buy',
        '2025-01-03 12:09:50.447',
        'IE00B3XXRP09',
        'VUSA',
        'Vanguard S&P 500 (Dist)',
        '',
        'EOF25960930110',
        '0.0485920000',
        '108.246000',
        'EUR',
        '1.00000000',
        '',
        'EUR',
        '5.26',
        'EUR',
        '',
        '',
        '',
        '',
      ].join(','),
      [
        'Deposit',
        '2025-01-03 11:15:09',
        '',
        '',
        '',
        'Bank Transfer',
        'fa8f201d-9a60-4721-979d-6bb5cc88f957',
        '',
        '',
        '',
        '',
        '',
        '',
        '50.00',
        'EUR',
        '',
        '',
        '',
        '',
      ].join(','),
    ]);

    const result = parseNormalizedTransactionsCsv(csv, {
      defaultPlatform: 'Trading 212',
    });

    expect(result.errors).toHaveLength(0);
    expect(result.records).toHaveLength(2);
    expect(result.records[0]?.kind).toBe('BUY');
    expect(result.records[0]?.platform).toBe('Trading 212');
    expect(result.records[0]?.assetSymbol).toBe('VUSA');
    expect(result.records[0]?.qty).toBeCloseTo(0.048592, 6);
    expect(result.records[0]?.price).toBeCloseTo(108.246, 3);
    expect(result.records[1]?.kind).toBe('DEPOSIT');
    expect(result.records[1]?.price).toBeCloseTo(50, 2);
  });

  it('parses a Revolut export with BUY - MARKET and DIVIDEND rows', () => {
    const csv = buildCsv([
      'Date,Ticker,Type,Quantity,Price per share,Total Amount,Currency,FX Rate',
      '2025-01-03T09:35:02.169213Z,NKE,DIVIDEND,,,$0.17,USD,1.0318',
      '2025-02-26T14:30:03.659Z,NKE,BUY - MARKET,0.04872107,$82.10,$4,USD,1.0511',
    ]);

    const result = parseNormalizedTransactionsCsv(csv, {
      defaultPlatform: 'Revolut',
    });

    expect(result.errors).toHaveLength(0);
    expect(result.records).toHaveLength(2);
    expect(result.records[0]?.kind).toBe('DIVIDEND');
    expect(result.records[0]?.assetSymbol).toBe('NKE');
    expect(result.records[0]?.price).toBeCloseTo(0.17, 2);
    expect(result.records[1]?.kind).toBe('BUY');
    expect(result.records[1]?.qty).toBeCloseTo(0.04872107, 8);
    expect(result.records[1]?.price).toBeCloseTo(82.1, 2);
  });

  it('ignores result adjustment rows that are not useful for investment tracking', () => {
    const csv = buildCsv([
      'Date,Type,Ticker,Quantity,Price per share,Currency',
      '2025-02-01,Result Adjustment,,,,USD',
      '2025-02-26,BUY - MARKET,NKE,0.04872107,$82.10,USD',
    ]);

    const result = parseNormalizedTransactionsCsv(csv, {
      defaultPlatform: 'Revolut',
    });

    expect(result.errors).toHaveLength(0);
    expect(result.records).toHaveLength(1);
    expect(result.records[0]?.kind).toBe('BUY');
    expect(result.records[0]?.assetSymbol).toBe('NKE');
  });
});

describe('parseNormalizedPositionSnapshotsCsv', () => {
  it('parses a valid monthly position snapshot row', () => {
    const header = NORMALIZED_POSITION_SNAPSHOT_HEADERS.join(',');
    const csv = buildCsv([
      header,
      '2025-02-28,DEGIRO,VWCE,Vanguard FTSE All-World,ETF,12,134.52,EUR,Monthly statement',
    ]);

    const result = parseNormalizedPositionSnapshotsCsv(csv);
    expect(result.errors).toHaveLength(0);
    expect(result.records).toHaveLength(1);

    const [record] = result.records;
    expect(record?.platform).toBe('DEGIRO');
    expect(record?.assetSymbol).toBe('VWCE');
    expect(record?.qty).toBe(12);
    expect(record?.price).toBeCloseTo(134.52);
    expect(record?.currency).toBe('EUR');
  });

  it('accepts snapshots without price and with default platform', () => {
    const csv = buildCsv([
      'date,asset_symbol,qty,currency',
      '2025-03-31,MSFT,5,USD',
    ]);

    const result = parseNormalizedPositionSnapshotsCsv(csv, {
      defaultPlatform: 'Interactive Brokers',
    });

    expect(result.errors).toHaveLength(0);
    expect(result.records).toHaveLength(1);
    expect(result.records[0]?.platform).toBe('Interactive Brokers');
    expect(result.records[0]?.price).toBeUndefined();
  });

  it('auto-detects required snapshot columns when headers are unconventional', () => {
    const csv = buildCsv([
      'date_releve;code_valeur;titres_detenus;devise',
      '2025-03-31;MSFT;5;USD',
    ]);

    const result = parseNormalizedPositionSnapshotsCsv(csv, {
      defaultPlatform: 'Interactive Brokers',
    });

    expect(result.errors).toHaveLength(0);
    expect(result.records).toHaveLength(1);
    expect(result.records[0]?.assetSymbol).toBe('MSFT');
    expect(result.records[0]?.qty).toBe(5);
    expect(result.records[0]?.currency).toBe('USD');
  });

  it('rejects negative snapshot quantities', () => {
    const csv = buildCsv([
      'date,platform,asset_symbol,qty,currency',
      '2025-03-31,DEGIRO,VWCE,-2,EUR',
    ]);

    const result = parseNormalizedPositionSnapshotsCsv(csv);
    expect(result.records).toHaveLength(0);
    expect(result.errors[0]?.message).toContain('qty');
  });
});
