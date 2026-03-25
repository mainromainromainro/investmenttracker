export type CsvDelimiter = ',' | ';';

const isBlankRow = (row: string[]): boolean => row.every((value) => (value ?? '').trim() === '');

export const detectCsvDelimiter = (text: string): CsvDelimiter => {
  const firstLine = text.split(/\r?\n/)[0] ?? '';
  const commaCount = (firstLine.match(/,/g) ?? []).length;
  const semicolonCount = (firstLine.match(/;/g) ?? []).length;
  return semicolonCount > commaCount ? ';' : ',';
};

export const parseCsvRows = (text: string): string[][] => {
  const delimiter = detectCsvDelimiter(text);
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (char === '"') {
      if (inQuotes && text[i + 1] === '"') {
        currentField += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === delimiter && !inQuotes) {
      currentRow.push(currentField);
      currentField = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && text[i + 1] === '\n') {
        i += 1;
      }
      currentRow.push(currentField);
      currentField = '';
      if (!isBlankRow(currentRow)) {
        rows.push(currentRow);
      }
      currentRow = [];
      continue;
    }

    currentField += char;
  }

  currentRow.push(currentField);
  if (!isBlankRow(currentRow)) {
    rows.push(currentRow);
  }

  return rows;
};

export const normalizeCsvToken = (value: string | undefined): string =>
  (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');

