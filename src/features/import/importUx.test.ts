import { describe, expect, it } from 'vitest';
import { buildFileFingerprint } from './importUx';

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
});

