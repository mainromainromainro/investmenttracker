import { normalizeCsvToken, parseCsvRows } from './csvText';

export type CsvSourceProfile = 'trading212' | 'revolut_stock' | 'interactive_brokers' | 'unknown';

export interface CsvSourceDetection {
  sourceProfile: CsvSourceProfile;
  platformName: string | null;
  confidence: number;
  reportKind: 'flat_csv' | 'structured_report' | 'unknown';
  reasons: string[];
  sectionNames: string[];
}

export interface StructuredCsvSection {
  name: string;
  normalizedName: string;
  headers: string[];
  dataRows: string[][];
  metaRows: string[][];
}

export interface InteractiveBrokersOpenPositionSummaryExtraction {
  section: StructuredCsvSection | null;
  unsupportedSections: string[];
}

const KNOWN_IBKR_SECTION_NAMES = new Set([
  'open_position_summary',
  'trade_summary',
  'deposits_and_withdrawals',
  'performance_by_symbol',
  'performance_by_long_short',
  'historical_performance_benchmark_comparison',
  'concentration',
  'esg',
]);

const getFileNameHints = (fileName?: string): string[] =>
  normalizeCsvToken(fileName).split('_').filter(Boolean);

const parseFlatHeaderSet = (csvText: string): Set<string> => {
  const rows = parseCsvRows(csvText);
  const headers = rows[0] ?? [];
  return new Set(headers.map((header) => normalizeCsvToken(header)));
};

export const extractStructuredCsvSections = (csvText: string): StructuredCsvSection[] => {
  const rows = parseCsvRows(csvText);
  const sections: StructuredCsvSection[] = [];
  let currentSection: StructuredCsvSection | null = null;

  for (const row of rows) {
    const sectionName = row[0]?.trim() ?? '';
    const rowKind = normalizeCsvToken(row[1]);

    if (!sectionName || (rowKind !== 'metainfo' && rowKind !== 'header' && rowKind !== 'data')) {
      continue;
    }

    const normalizedName = normalizeCsvToken(sectionName);
    if (!currentSection || currentSection.normalizedName !== normalizedName) {
      currentSection = {
        name: sectionName,
        normalizedName,
        headers: [],
        dataRows: [],
        metaRows: [],
      };
      sections.push(currentSection);
    }

    if (rowKind === 'header') {
      currentSection.headers = row.slice(2);
    } else if (rowKind === 'data') {
      currentSection.dataRows.push(row.slice(2));
    } else {
      currentSection.metaRows.push(row.slice(2));
    }
  }

  return sections;
};

export const extractStructuredCsvSection = (
  csvText: string,
  sectionName: string,
): StructuredCsvSection | null => {
  const normalizedSectionName = normalizeCsvToken(sectionName);
  return (
    extractStructuredCsvSections(csvText).find(
      (section) => section.normalizedName === normalizedSectionName,
    ) ?? null
  );
};

export const detectCsvSourceProfile = (
  csvText: string,
  fileName?: string,
): CsvSourceDetection => {
  const sectionNames = extractStructuredCsvSections(csvText).map((section) => section.normalizedName);
  const sectionNameSet = new Set(sectionNames);
  const flatHeaders = parseFlatHeaderSet(csvText);
  const fileNameHints = getFileNameHints(fileName);
  const reasons: string[] = [];

  const hasKnownIbkrSection = sectionNames.some((sectionName) => KNOWN_IBKR_SECTION_NAMES.has(sectionName));

  if (hasKnownIbkrSection) {
    reasons.push('structured IBKR sections detected');
    return {
      sourceProfile: 'interactive_brokers',
      platformName: 'Interactive Brokers',
      confidence: sectionNameSet.has('open_position_summary') ? 0.99 : 0.91,
      reportKind: 'structured_report',
      reasons,
      sectionNames,
    };
  }

  if (
    (flatHeaders.has('action') &&
      flatHeaders.has('time') &&
      flatHeaders.has('ticker') &&
      flatHeaders.has('no_of_shares') &&
      flatHeaders.has('price_share')) ||
    fileNameHints.includes('t212') ||
    fileNameHints.includes('trading212')
  ) {
    reasons.push('Trading 212 style flat export detected');
    return {
      sourceProfile: 'trading212',
      platformName: 'Trading 212',
      confidence: 0.97,
      reportKind: 'flat_csv',
      reasons,
      sectionNames,
    };
  }

  if (
    (flatHeaders.has('date') &&
      flatHeaders.has('ticker') &&
      flatHeaders.has('type') &&
      flatHeaders.has('quantity') &&
      flatHeaders.has('price_per_share') &&
      flatHeaders.has('total_amount')) ||
    fileNameHints.includes('revolut') ||
    fileNameHints.includes('revo')
  ) {
    reasons.push('Revolut Stock style flat export detected');
    return {
      sourceProfile: 'revolut_stock',
      platformName: 'Revolut',
      confidence: 0.96,
      reportKind: 'flat_csv',
      reasons,
      sectionNames,
    };
  }

  if (sectionNames.length > 0) {
    reasons.push('structured report detected but no supported broker signature matched');
    return {
      sourceProfile: 'unknown',
      platformName: null,
      confidence: 0.5,
      reportKind: 'structured_report',
      reasons,
      sectionNames,
    };
  }

  reasons.push('no known broker signature matched');
  return {
    sourceProfile: 'unknown',
    platformName: null,
    confidence: 0.1,
    reportKind: 'flat_csv',
    reasons,
    sectionNames,
  };
};

export const extractInteractiveBrokersOpenPositionSummary = (
  csvText: string,
): InteractiveBrokersOpenPositionSummaryExtraction => {
  const sections = extractStructuredCsvSections(csvText);
  const section =
    sections.find((entry) => entry.normalizedName === 'open_position_summary') ?? null;
  const unsupportedSections = sections
    .filter((entry) => entry.normalizedName !== 'open_position_summary')
    .map((entry) => entry.name);

  return {
    section,
    unsupportedSections,
  };
};
