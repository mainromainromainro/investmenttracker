import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CsvColumnMapping,
  CsvHeader,
  CsvParseError,
  CSV_IMPORT_FIELDS,
  NORMALIZED_TRANSACTION_HEADERS,
  NormalizedTransactionRow,
  parseNormalizedTransactionsCsv,
  suggestCsvColumnMapping,
} from '../../lib/csvImport';
import { adminRepository } from '../../repositories/adminRepository';
import { fxRepository } from '../../repositories/fxRepository';
import { usePlatformStore } from '../../stores/platformStore';
import { useAssetStore } from '../../stores/assetStore';
import { useTransactionStore } from '../../stores/transactionStore';
import { usePriceStore } from '../../stores/priceStore';
import { useFxStore } from '../../stores/fxStore';

const BASE_CURRENCY = 'EUR';
const COMMON_CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'CAD', 'SEK'];
const REQUIRED_FIELDS: CsvHeader[] = ['date', 'kind'];
const MAPPING_STORAGE_KEY = 'investment-tracker.csv.mapping-templates.v1';
const BROKER_FROM_CSV = '__from_csv__';
const BROKER_CUSTOM = '__custom__';

interface CsvMappingTemplateMemory {
  mapping: CsvColumnMapping;
  broker?: string;
}

const FIELD_LABELS: Record<CsvHeader, string> = {
  date: 'Date',
  platform: 'Platform / Broker',
  kind: 'Transaction Type',
  asset_symbol: 'Ticker / Symbol',
  asset_name: 'Asset Name',
  asset_type: 'Asset Type',
  qty: 'Quantity',
  price: 'Price',
  currency: 'Price Currency',
  cash_currency: 'Cash Currency',
  fee: 'Fees',
  note: 'Note',
};

const fetchFxRate = async (currency: string): Promise<number | null> => {
  if (currency === BASE_CURRENCY) return 1;
  try {
    const response = await fetch(
      `https://api.frankfurter.app/latest?from=${currency}&to=${BASE_CURRENCY}`,
    );
    if (!response.ok) {
      return null;
    }
    const data = await response.json();
    const rate = data?.rates?.[BASE_CURRENCY];
    return typeof rate === 'number' ? rate : null;
  } catch {
    return null;
  }
};

const normalizeStoredTemplate = (value: unknown): CsvMappingTemplateMemory => {
  if (!value || typeof value !== 'object') {
    return { mapping: {} };
  }

  const candidate = value as { mapping?: unknown; broker?: unknown };
  if (candidate.mapping && typeof candidate.mapping === 'object') {
    return {
      mapping: candidate.mapping as CsvColumnMapping,
      broker: typeof candidate.broker === 'string' ? candidate.broker : undefined,
    };
  }

  // Backward compatibility: previous format stored only the mapping object.
  return {
    mapping: value as CsvColumnMapping,
  };
};

const loadMappingTemplates = (): Record<string, CsvMappingTemplateMemory> => {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(MAPPING_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return {};

    const normalized: Record<string, CsvMappingTemplateMemory> = {};
    for (const [signature, value] of Object.entries(parsed)) {
      normalized[signature] = normalizeStoredTemplate(value);
    }
    return normalized;
  } catch {
    return {};
  }
};

const saveMappingTemplates = (templates: Record<string, CsvMappingTemplateMemory>) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(MAPPING_STORAGE_KEY, JSON.stringify(templates));
};

const sanitizeMapping = (
  mapping: CsvColumnMapping,
  headers: string[],
): CsvColumnMapping => {
  const allowed = new Set(headers);
  const sanitized: CsvColumnMapping = {};
  for (const field of CSV_IMPORT_FIELDS) {
    const mappedHeader = mapping[field];
    if (mappedHeader && allowed.has(mappedHeader)) {
      sanitized[field] = mappedHeader;
    }
  }
  return sanitized;
};

const getFieldConfidence = (
  field: CsvHeader,
  mapping: CsvColumnMapping,
  suggestedMapping: CsvColumnMapping,
  confidence: Partial<Record<CsvHeader, number>>,
): number => {
  const current = mapping[field];
  if (!current) return 0;
  if (current === suggestedMapping[field]) {
    return confidence[field] ?? 0.5;
  }
  return 0.55;
};

const confidenceText = (value: number): { label: string; className: string } => {
  if (value >= 0.85) {
    return { label: 'High', className: 'bg-emerald-500/15 text-emerald-200 border-emerald-300/30' };
  }
  if (value >= 0.6) {
    return { label: 'Medium', className: 'bg-amber-500/15 text-amber-100 border-amber-300/30' };
  }
  if (value > 0) {
    return { label: 'Low', className: 'bg-rose-500/15 text-rose-200 border-rose-300/30' };
  }
  return { label: 'Unmapped', className: 'bg-slate-500/15 text-slate-200 border-slate-300/30' };
};

const getBrokerFromSelection = (
  selection: string,
  customBrokerName: string,
): string | undefined => {
  if (selection === BROKER_CUSTOM) {
    const trimmed = customBrokerName.trim();
    return trimmed || undefined;
  }
  if (!selection || selection === BROKER_FROM_CSV) {
    return undefined;
  }
  return selection;
};

const useRefreshStores = () => {
  return useMemo(
    () => async () => {
      await Promise.all([
        usePlatformStore.getState().fetchPlatforms(),
        useAssetStore.getState().fetchAssets(),
        useTransactionStore.getState().fetchTransactions(),
        usePriceStore.getState().fetchPrices(),
        useFxStore.getState().fetchFxSnapshots(),
      ]);
    },
    [],
  );
};

const CsvImportSection: React.FC = () => {
  const platforms = usePlatformStore((s) => s.platforms);
  const fetchPlatforms = usePlatformStore((s) => s.fetchPlatforms);

  const [csvStatus, setCsvStatus] = useState<'idle' | 'parsing' | 'mapping' | 'ready' | 'importing' | 'error'>(
    'idle',
  );
  const [csvRows, setCsvRows] = useState<NormalizedTransactionRow[]>([]);
  const [csvErrors, setCsvErrors] = useState<CsvParseError[]>([]);
  const [csvMessage, setCsvMessage] = useState<string | null>(null);
  const [defaultCurrency, setDefaultCurrency] = useState<string>(BASE_CURRENCY);
  const [fxMessage, setFxMessage] = useState<string | null>(null);
  const [csvText, setCsvText] = useState<string | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [mappingSignature, setMappingSignature] = useState<string | null>(null);
  const [suggestedMapping, setSuggestedMapping] = useState<CsvColumnMapping>({});
  const [columnMapping, setColumnMapping] = useState<CsvColumnMapping>({});
  const [mappingConfidence, setMappingConfidence] = useState<Partial<Record<CsvHeader, number>>>({});
  const [rememberMapping, setRememberMapping] = useState(true);
  const [brokerSelection, setBrokerSelection] = useState<string>(BROKER_FROM_CSV);
  const [customBrokerName, setCustomBrokerName] = useState<string>('');
  const csvInputRef = useRef<HTMLInputElement | null>(null);
  const refreshStores = useRefreshStores();

  const csvHeaderExample = NORMALIZED_TRANSACTION_HEADERS.join(',');

  const resetCsvState = (clearMessage: boolean) => {
    setCsvRows([]);
    setCsvErrors([]);
    setCsvText(null);
    setCsvHeaders([]);
    setMappingSignature(null);
    setSuggestedMapping({});
    setColumnMapping({});
    setMappingConfidence({});
    setBrokerSelection(BROKER_FROM_CSV);
    setCustomBrokerName('');
    if (clearMessage) {
      setCsvMessage(null);
      setFxMessage(null);
    }
    setCsvStatus('idle');
    if (csvInputRef.current) {
      csvInputRef.current.value = '';
    }
  };

  useEffect(() => {
    void fetchPlatforms();
  }, [fetchPlatforms]);

  useEffect(() => {
    if (!csvText) return;
    const selectedBroker = getBrokerFromSelection(brokerSelection, customBrokerName);

    const result = parseNormalizedTransactionsCsv(csvText, {
      defaultCurrency,
      defaultPlatform: selectedBroker,
      columnMapping,
    });

    setCsvRows(result.records);
    setCsvErrors(result.errors);

    if (result.records.length === 0 && result.errors.length === 0) {
      setCsvStatus('error');
      setCsvMessage('Aucune ligne valide détectée dans ce fichier.');
      return;
    }

    if (result.errors.length > 0) {
      const hasMissingHeaders = result.errors.some(
        (error) => error.row === 0 && error.message.includes('Colonnes manquantes'),
      );
      if (hasMissingHeaders) {
        setCsvStatus('mapping');
        setCsvMessage(
          'Certaines colonnes ne sont pas reconnues automatiquement. Ajustez le mapping ci-dessous.',
        );
      } else {
        setCsvStatus('error');
        setCsvMessage(
          `${result.records.length} ligne(s) valides et ${result.errors.length} erreur(s). Corrigez ou ajustez le mapping.`,
        );
      }
      return;
    }

    const requiresReview = REQUIRED_FIELDS.some(
      (field) => getFieldConfidence(field, columnMapping, suggestedMapping, mappingConfidence) < 0.6,
    );

    setCsvStatus(requiresReview ? 'mapping' : 'ready');
    setCsvMessage(`${result.records.length} transactions prêtes à être importées.`);
  }, [
    csvText,
    columnMapping,
    defaultCurrency,
    suggestedMapping,
    mappingConfidence,
    brokerSelection,
    customBrokerName,
  ]);

  const handleCsvFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    setCsvErrors([]);
    setCsvRows([]);
    setCsvMessage(null);
    setFxMessage(null);
    const file = event.target.files?.[0];
    if (!file) {
      setCsvStatus('idle');
      return;
    }

    setCsvStatus('parsing');
    try {
      const text = await file.text();
      const suggestion = suggestCsvColumnMapping(text);
      const storedTemplates = loadMappingTemplates();
      const storedTemplate = suggestion.signature
        ? storedTemplates[suggestion.signature]
        : undefined;
      const storedMapping = sanitizeMapping(storedTemplate?.mapping ?? {}, suggestion.headers);
      const suggested = sanitizeMapping(suggestion.mapping, suggestion.headers);
      const mergedMapping = {
        ...suggested,
        ...storedMapping,
      };

      setCsvText(text);
      setCsvHeaders(suggestion.headers);
      setMappingSignature(suggestion.signature);
      setSuggestedMapping(suggested);
      setColumnMapping(mergedMapping);
      setMappingConfidence(suggestion.confidence);
      if (storedTemplate?.broker) {
        if (platforms.some((platform) => platform.name === storedTemplate.broker)) {
          setBrokerSelection(storedTemplate.broker);
          setCustomBrokerName('');
        } else {
          setBrokerSelection(BROKER_CUSTOM);
          setCustomBrokerName(storedTemplate.broker);
        }
      } else {
        setBrokerSelection(BROKER_FROM_CSV);
        setCustomBrokerName('');
      }

      if (Object.keys(storedMapping).length > 0) {
        setCsvMessage('Template de mapping reconnu automatiquement pour ce format de CSV.');
      }
    } catch (error) {
      setCsvStatus('error');
      setCsvErrors([
        {
          row: 0,
          message:
            error instanceof Error
              ? error.message
              : 'Erreur inattendue lors du parsing du CSV.',
        },
      ]);
    }
  };

  const handleMappingChange = (field: CsvHeader, header: string) => {
    setColumnMapping((previous) => {
      const next = { ...previous };
      if (!header) {
        delete next[field];
      } else {
        next[field] = header;
      }
      return next;
    });
  };

  const handleRestoreAutoMapping = () => {
    setColumnMapping((previous) => ({
      ...previous,
      ...suggestedMapping,
    }));
  };

  const ensureFxRates = async (rows: NormalizedTransactionRow[]) => {
    const uniqueCurrencies = Array.from(new Set(rows.map((row) => row.currency))).filter(
      (currency) => currency && currency !== BASE_CURRENCY,
    );
    if (uniqueCurrencies.length === 0) return;

    const messages: string[] = [];
    for (const currency of uniqueCurrencies) {
      const rate = await fetchFxRate(currency);
      if (!rate) {
        messages.push(`FX introuvable pour ${currency}/${BASE_CURRENCY}. Ajoutez-le manuellement.`);
        continue;
      }
      await fxRepository.create({
        id: `fx_${currency}_${Date.now()}`,
        pair: `${currency}/${BASE_CURRENCY}`,
        date: Date.now(),
        rate,
      });
      messages.push(`FX ${currency}/${BASE_CURRENCY} mis à jour (${rate.toFixed(4)}).`);
    }
    setFxMessage(messages.join(' '));
  };

  const handleImportCsv = async () => {
    if (!csvRows.length || csvStatus === 'importing') {
      return;
    }

    setCsvStatus('importing');
    try {
      if (rememberMapping && mappingSignature) {
        const templates = loadMappingTemplates();
        templates[mappingSignature] = {
          mapping: sanitizeMapping(columnMapping, csvHeaders),
          broker: getBrokerFromSelection(brokerSelection, customBrokerName),
        };
        saveMappingTemplates(templates);
      }

      const result = await adminRepository.importNormalizedTransactions(csvRows);
      await ensureFxRates(csvRows);
      await refreshStores();
      setCsvMessage(
        `Import terminé : ${result.transactionsCreated} transactions, ${result.assetsCreated} nouveaux actifs, ${result.platformsCreated} nouvelles plateformes.`,
      );
      resetCsvState(false);
    } catch (error) {
      setCsvStatus('error');
      setCsvErrors([
        {
          row: 0,
          message:
            error instanceof Error ? error.message : 'Erreur inattendue lors de l’import.',
        },
      ]);
    }
  };

  const importDisabled =
    csvStatus === 'importing' ||
    csvStatus === 'parsing' ||
    csvRows.length === 0 ||
    csvErrors.length > 0;

  return (
    <div className="glass-card rounded-xl p-6 space-y-4">
      <div className="space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-stone-100">Import CSV normalisé</h3>
            <p className="text-sm text-stone-300">
              Fournissez un CSV: les noms de colonnes sont reconnus automatiquement (ordre libre) :
            </p>
            <span className="block font-mono text-xs text-stone-300 mt-2 break-all">
              {csvHeaderExample}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:min-w-[240px]">
            <div className="flex flex-col">
              <label className="text-xs text-stone-300 font-medium mb-1">Broker par défaut</label>
              <select
                value={brokerSelection}
                onChange={(e) => setBrokerSelection(e.target.value)}
                className="px-2 py-1 border border-stone-300/30 bg-emerald-950/50 rounded text-sm text-stone-100"
              >
                <option value={BROKER_FROM_CSV}>Depuis la colonne CSV (si présente)</option>
                {platforms
                  .map((platform) => platform.name)
                  .sort((a, b) => a.localeCompare(b))
                  .map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                <option value={BROKER_CUSTOM}>Nouveau broker…</option>
              </select>
            </div>

            {brokerSelection === BROKER_CUSTOM && (
              <div className="flex flex-col">
                <label className="text-xs text-stone-300 font-medium mb-1">Nom du broker</label>
                <input
                  type="text"
                  value={customBrokerName}
                  onChange={(e) => setCustomBrokerName(e.target.value)}
                  placeholder="Ex: Trade Republic"
                  className="px-2 py-1 border border-stone-300/30 bg-emerald-950/50 rounded text-sm text-stone-100"
                />
              </div>
            )}

            <div className="flex flex-col">
              <label className="text-xs text-stone-300 font-medium mb-1">Devise par défaut</label>
              <select
                value={defaultCurrency}
                onChange={(e) => setDefaultCurrency(e.target.value)}
                className="px-2 py-1 border border-stone-300/30 bg-emerald-950/50 rounded text-sm text-stone-100"
              >
                {COMMON_CURRENCIES.map((currency) => (
                  <option key={currency} value={currency}>
                    {currency}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
        <p className="text-sm text-stone-300">
          Les types de transaction autorisés sont BUY, SELL, DEPOSIT, WITHDRAW, FEE. Pour BUY / SELL,
          les colonnes <em>asset_*</em>, qty et price sont obligatoires. La colonne <em>platform</em> est
          optionnelle si vous choisissez un broker par défaut ci-dessus. La devise par défaut est utilisée
          si aucune colonne liée n’est fournie et qu’aucune devise n’est déduite du ticker.
        </p>
      </div>

      <input
        ref={csvInputRef}
        type="file"
        accept=".csv,text/csv"
        onChange={handleCsvFile}
        className="block w-full text-sm text-stone-200"
      />

      {csvHeaders.length > 0 && (
        <div className="rounded-lg border border-stone-200/20 bg-emerald-950/45 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-stone-100">Assistant de mapping des colonnes</p>
              <p className="text-xs text-stone-300">
                {csvHeaders.length} colonnes détectées. Ajustez uniquement si besoin.
              </p>
            </div>
            <button
              type="button"
              onClick={handleRestoreAutoMapping}
              className="rounded-md border border-stone-200/30 px-3 py-1 text-xs text-stone-200 hover:bg-stone-100/10"
            >
              Restaurer auto-mapping
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {CSV_IMPORT_FIELDS.map((field) => {
              const confidence = getFieldConfidence(field, columnMapping, suggestedMapping, mappingConfidence);
              const confidenceUi = confidenceText(confidence);
              const required = REQUIRED_FIELDS.includes(field);
              return (
                <div key={field} className="rounded-md border border-stone-200/15 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-stone-100">{FIELD_LABELS[field]}</span>
                      {required && (
                        <span className="rounded border border-amber-300/30 bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-100">
                          Required
                        </span>
                      )}
                    </div>
                    <span className={`rounded border px-1.5 py-0.5 text-[10px] ${confidenceUi.className}`}>
                      {confidenceUi.label}
                    </span>
                  </div>
                  <select
                    value={columnMapping[field] ?? ''}
                    onChange={(event) => handleMappingChange(field, event.target.value)}
                    className="w-full rounded border border-stone-300/30 bg-emerald-950/70 px-2 py-1.5 text-xs text-stone-100"
                  >
                    <option value="">Auto detect / not forced</option>
                    {csvHeaders.map((header) => (
                      <option key={header} value={header}>
                        {header}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>

          <label className="flex items-center gap-2 text-xs text-stone-300">
            <input
              type="checkbox"
              checked={rememberMapping}
              onChange={(e) => setRememberMapping(e.target.checked)}
            />
            Mémoriser ce mapping pour les prochains CSV avec la même structure
          </label>
        </div>
      )}

      {csvMessage && (
        <div className="rounded-md border border-emerald-200/30 bg-emerald-500/10 px-4 py-3 text-sm text-stone-100">
          {csvMessage}
        </div>
      )}

      {fxMessage && (
        <div className="rounded-md border border-amber-200/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {fxMessage}
        </div>
      )}

      {csvErrors.length > 0 && (
        <div className="rounded-md border border-rose-200/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100 space-y-2">
          <p>Erreurs détectées :</p>
          <ul className="list-disc pl-5 space-y-1">
            {csvErrors.slice(0, 5).map((error) => (
              <li key={`${error.row}-${error.message}`}>
                {error.row > 0 ? `Ligne ${error.row}: ` : ''}
                {error.message}
              </li>
            ))}
            {csvErrors.length > 5 && (
              <li>… {csvErrors.length - 5} erreurs supplémentaires</li>
            )}
          </ul>
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleImportCsv}
          disabled={importDisabled}
          className="px-4 py-2 rounded-md font-medium bg-stone-100 text-emerald-950 hover:bg-stone-200 transition disabled:opacity-50"
        >
          {csvStatus === 'importing'
            ? 'Import en cours…'
            : `Importer${csvRows.length ? ` (${csvRows.length})` : ''}`}
        </button>
        <button
          type="button"
          onClick={() => resetCsvState(true)}
          className="px-4 py-2 border border-stone-200/30 rounded-md text-stone-200 hover:bg-stone-100/10"
        >
          Réinitialiser
        </button>
      </div>
    </div>
  );
};

export default CsvImportSection;
