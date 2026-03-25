import { describe, expect, it } from 'vitest';
import {
  buildFileFingerprint,
  detectImportPreset,
  extractIbkrOpenPositionSummaryRows,
  getImportSupportLabel,
} from './importUx';

describe('buildFileFingerprint', () => {
  it('changes when the target scope changes', () => {
    const csv = 'date,asset_symbol,qty\n2025-03-31,VWCE,10';

    expect(buildFileFingerprint(csv, 'monthly_positions', 'CTO')).not.toBe(
      buildFileFingerprint(csv, 'monthly_positions', 'PEA'),
    );
  });

  it('normalizes scope spacing and casing', () => {
    const csv = 'date,asset_symbol,qty\n2025-03-31,VWCE,10';

    expect(buildFileFingerprint(csv, 'monthly_positions', '  CTO Perso  ')).toBe(
      buildFileFingerprint(csv, 'monthly_positions', 'cto perso'),
    );
  });

  it('detects an IBKR report and marks it as partially supported', () => {
    const csv = [
      'Introduction,Header,Name,Account,Alias,BaseCurrency,AccountType,AnalysisPeriod,PerformanceMeasure',
      'Open Position Summary,MetaInfo,As Of,"March 24, 2026"',
      'Open Position Summary,Header,Date,FinancialInstrument,Currency,Symbol,Description,Sector,Quantity,ClosePrice,Value,Cost Basis,UnrealizedP&L,FXRateToBase',
      'Open Position Summary,Data,03/24/2026,ETFs,EUR,DCAM,AMUNDI PEA MONDE MSCI WORLD,Broad,477,5.303,2529.53,2594.640285,-65.110285,1',
      'Open Position Summary,Data,03/24/2026,Cash,EUR,EUR,Euro,Cash,5.359715,1,5.359715,,,1',
    ].join('\n');

    const preset = detectImportPreset(csv, 'Romain_Henrion_IBKR.csv');
    expect(preset?.label).toBe('Interactive Brokers');
    expect(preset?.supportStatus).toBe('partial');
    expect(preset?.supportedSections).toContain('Open Position Summary');
    expect(getImportSupportLabel(preset?.supportStatus ?? 'manual')).toBe('Partiel');

    const result = extractIbkrOpenPositionSummaryRows(csv, 'Interactive Brokers');
    expect(result.errors).toHaveLength(1);
    expect(result.records).toHaveLength(1);
    expect(result.records[0]?.assetSymbol).toBe('DCAM');
    expect(result.records[0]?.qty).toBe(477);
    expect(result.records[0]?.price).toBeCloseTo(5.303);
  });
});
