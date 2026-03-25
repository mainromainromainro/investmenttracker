import { describe, expect, it } from 'vitest';
import {
  detectCsvSourceProfile,
  extractInteractiveBrokersOpenPositionSummary,
  extractStructuredCsvSections,
} from './csvSourceProfiles';

const buildCsv = (rows: string[]): string => rows.join('\n');

describe('csvSourceProfiles', () => {
  it('detects Trading 212, Revolut Stock, and IBKR report formats', () => {
    const trading212 = buildCsv([
      'Action,Time,ISIN,Ticker,Name,Notes,ID,No. of shares,Price / share,Currency (Price / share),Exchange rate,Result,Currency (Result),Total,Currency (Total)',
      'Market buy,2025-01-03 12:09:50.447,IE00B3XXRP09,VUSA,Vanguard S&P 500 (Dist),,EOF25960930110,0.0485920000,108.246000,EUR,1.00000000,,EUR,5.26,EUR',
    ]);
    const revolut = buildCsv([
      'Date,Ticker,Type,Quantity,Price per share,Total Amount,Currency,FX Rate',
      '2025-02-26T14:30:03.659Z,NKE,BUY - MARKET,0.04872107,$82.10,$4,USD,1.0511',
    ]);
    const ibkr = buildCsv([
      'Introduction,Header,Name,Account,Alias,BaseCurrency,AccountType,AnalysisPeriod,PerformanceMeasure',
      'Introduction,Data,Romain Henrion,U17342113,,EUR,Individual,"March 25, 2025 to March 24, 2026 (Monthly)",TWR',
      'Open Position Summary,MetaInfo,As Of,"March 24, 2026"',
      'Open Position Summary,Header,Date,FinancialInstrument,Currency,Symbol,Description,Sector,Quantity,ClosePrice,Value,Cost Basis,UnrealizedP&L,FXRateToBase',
      'Open Position Summary,Data,03/24/2026,ETFs,EUR,DCAM,AMUNDI PEA MONDE MSCI WORLD,Broad,477,5.303,2529.53,2594.640285,-65.110285,1',
    ]);

    expect(detectCsvSourceProfile(trading212).sourceProfile).toBe('trading212');
    expect(detectCsvSourceProfile(revolut).sourceProfile).toBe('revolut_stock');
    expect(detectCsvSourceProfile(ibkr).sourceProfile).toBe('interactive_brokers');
  });

  it('extracts IBKR structured sections and marks unsupported sections explicitly', () => {
    const csv = buildCsv([
      'Introduction,Header,Name,Account,Alias,BaseCurrency,AccountType,AnalysisPeriod,PerformanceMeasure',
      'Introduction,Data,Romain Henrion,U17342113,,EUR,Individual,"March 25, 2025 to March 24, 2026 (Monthly)",TWR',
      'Open Position Summary,MetaInfo,As Of,"March 24, 2026"',
      'Open Position Summary,Header,Date,FinancialInstrument,Currency,Symbol,Description,Sector,Quantity,ClosePrice,Value,Cost Basis,UnrealizedP&L,FXRateToBase',
      'Open Position Summary,Data,03/24/2026,ETFs,EUR,DCAM,AMUNDI PEA MONDE MSCI WORLD,Broad,477,5.303,2529.53,2594.640285,-65.110285,1',
      'Trade Summary,Header,Financial Instrument,Currency,Symbol,Description,Sector,Quantity Bought,Average Price Bought,Proceeds Bought,Proceeds Bought in Base,Quantity Sold,Average Price Sold,Proceeds Sold,Proceeds Sold in Base',
      'Trade Summary,Data,ETFs,Euro,DCAM,AMUNDI PEA MONDE MSCI WORLD,Broad,477,5.414375262,-2582.657,-2582.657,0,0,0,0',
    ]);

    const sections = extractStructuredCsvSections(csv);
    const openPositionSummary = extractInteractiveBrokersOpenPositionSummary(csv);

    expect(sections.map((section) => section.name)).toEqual([
      'Introduction',
      'Open Position Summary',
      'Trade Summary',
    ]);
    expect(openPositionSummary.section?.headers).toContain('Symbol');
    expect(openPositionSummary.unsupportedSections).toContain('Introduction');
    expect(openPositionSummary.unsupportedSections).toContain('Trade Summary');
  });
});

