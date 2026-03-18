# Finary Alignment - Bourse & Crypto (CSV-first)

**Status:** Active product reference  
**Updated:** 2026-03-18  
**Goal:** reproduce the useful part of Finary for listed securities and crypto tracking, but with **CSV uploads as the primary ingestion channel** instead of bank/broker APIs.

## Product Scope

### In scope

- Consolidate portfolios across brokers, exchanges, and wallets from CSV files
- Track positions, cash, valuation, PRU, unrealized P/L, allocation, and performance history
- Cover stock/ETF and crypto use cases with one coherent data model
- Surface the main "insight" layer users expect from Finary on this scope:
  - allocation by account / asset / type / currency
  - sector and geography exposure
  - dividend tracking
  - fee tracking
  - data quality / missing data alerts

### Out of scope for this track

- Budget and cashflow
- Current accounts / savings accounts
- Real estate
- Loans / liabilities
- Insurance wrappers outside their listed holdings behavior
- Family mode
- Finary investment products themselves

## What "replicating Finary" means here

We are **not** trying to copy Finary's institution sync stack.  
We **are** trying to reproduce the user outcome:

1. import raw data from multiple investment sources,
2. normalize it into one portfolio ledger,
3. enrich it with prices / metadata,
4. display portfolio value, performance, allocation, dividends, and fee insights with high trust.

For this project, the CSV pipeline is not a side feature. It is the product backbone.

## Relevant Finary Benchmark

Verified on **2026-03-18** from official Finary sources:

- Finary Plus highlights for investors include:
  - unlimited connected accounts
  - dividend tracking
  - hidden fee scanner
  - sector and geography diversification scores
- Finary documents a dedicated performance model based on **latent gain/loss** and **PRU**
- Finary explains that crypto PRU should only include transactions with a known cost basis, and that crypto deposits with unknown cost should not distort PRU
- Finary documents automatic asset identification / matching using identifiers such as ISIN, name, and currency
- Finary exposes crypto-specific coverage across exchanges and wallets

For our CSV-first product, these become:

- unlimited account sync -> robust multi-source CSV imports
- institution matching -> import template library + asset master matching
- Finary performance view -> PRU + unrealized P/L engine
- diversification insights -> asset metadata layer
- dividend tracker -> dividend calendar and income summaries
- fee scanner -> explicit fees first, TER-based insight second

## Current Repo Assessment

The current codebase is a good portfolio tracker base, but not yet a Finary-like investment product.

### What already exists

- `src/lib/csvImport.ts`
  - flexible CSV header mapping
  - normalized transaction parsing
  - import preview with errors
- `src/types/index.ts`
  - asset, transaction, price, FX core entities
  - asset coverage already includes `ETF`, `STOCK`, `CRYPTO`
- `src/lib/computations.ts`
  - position quantity
  - latest price / FX
  - portfolio valuation
  - aggregate views by platform, type, and ticker
  - historical total-value timeline
- `src/features/dashboard/Dashboard.tsx`
  - valuation dashboard, allocation cards, top holdings, evolution chart
- `src/lib/liveMarketData.ts`
  - live quotes and FX refresh capability

### Structural gaps vs target product

- No real **account model**
  - current `platform` is too coarse for PEA vs CTO vs exchange vs wallet vs sub-account
- No **import job** model
  - no persistent provenance, dedupe, replay, or reconciliation workflow
- No **performance engine**
  - no PRU
  - no unrealized P/L
  - no period returns
  - no split between contribution and market effect
- No **income model**
  - no dividends
  - no staking rewards
  - no passive income summaries
- No **advanced transaction taxonomy**
  - missing `DIVIDEND`, `TRANSFER_IN`, `TRANSFER_OUT`, `SWAP`, `STAKING_REWARD`, `AIRDROP`
- No **asset metadata layer**
  - missing ISIN-centric matching, sector, geography, TER, exchange/network metadata
- No **data quality center**
  - missing alerts for unknown price, FX, or cost basis
- No **crypto-specific accounting rules**
  - transfers and swaps are not modeled
  - deposits with unknown cost basis are not distinguished from purchases

## Product Principles

1. **CSV-first, not form-first**
   The main source of truth should be imported portfolio activity, not manual CRUD screens.

2. **Canonical ledger before dashboard polish**
   If the ingestion and accounting model is weak, all higher-level insights become unreliable.

3. **Every import must be auditable**
   We need file provenance, import timestamp, parsed rows, warnings, and dedupe behavior.

4. **Unknown data must stay explicit**
   Never fake a PRU, dividend, or exposure when the required data is missing.

5. **Stocks and crypto share one portfolio surface, not one simplistic transaction model**
   The UI can be unified, but the accounting rules must handle crypto transfers and swaps.

## Target Domain Model

### New core entities

- `Institution`
  - broker / exchange / wallet provider name
- `Account`
  - container inside an institution
  - examples: `PEA`, `CTO`, `Binance Spot`, `Coinbase`, `Ledger BTC`
- `ImportJob`
  - uploaded file, source type, checksum, imported at, status
- `ImportRow`
  - raw row, canonical row, validation issues, dedupe key
- `AssetMaster`
  - canonical security/coin reference
  - symbol, ISIN, name, currency, network, sector, geography, TER
- `LedgerTransaction`
  - canonical normalized transaction model
- `DividendEvent`
  - announced / paid dividends, amount, currency, ex-date, pay-date
- `PositionCostBasisSnapshot`
  - optional cached snapshots for fast dashboard computation

### Required transaction kinds

- `BUY`
- `SELL`
- `DEPOSIT_CASH`
- `WITHDRAW_CASH`
- `DIVIDEND`
- `FEE`
- `TRANSFER_IN`
- `TRANSFER_OUT`
- `SWAP_IN`
- `SWAP_OUT`
- `STAKING_REWARD`
- `AIRDROP`

### Accounting rules to align early

- PRU is computed only from transactions with a **known acquisition cost**
- Fees are included in acquisition cost when relevant
- Crypto deposits with unknown source price must not change PRU
- Crypto withdrawals reduce quantity but should not change average cost
- Swaps must be converted into a known acquisition event for the received asset
- Dividends should be tracked separately from price performance

## Feature Map For This Project

### P0 - Must exist to feel like "Finary for bourse + crypto"

- Multi-account model:
  - broker, exchange, wallet, and account type
- Import engine v2:
  - per-source templates
  - mapping memory
  - dry-run preview
  - idempotent dedupe
  - import history
- Position engine:
  - quantity
  - latest value
  - PRU
  - unrealized P/L
  - account allocation
- Asset identification:
  - symbol + ISIN + name + currency matching
  - manual review path for ambiguous assets
- Dashboard refresh:
  - total portfolio value
  - cost basis
  - unrealized gain/loss
  - best / worst performers
  - breakdown by account, asset type, and currency
- Data quality surface:
  - missing price
  - missing FX
  - missing PRU
  - unmatched asset rows

### P1 - Expected insight layer

- Dividend calendar and trailing / forward dividend income
- Sector and geographic exposure
- Period performance views (`1W`, `1M`, `YTD`, `1Y`, `ALL`)
- Explicit fee analytics from imported fees
- Crypto-aware import templates:
  - exchange trades
  - deposits / withdrawals
  - transfers between owned accounts
  - staking rewards

### P2 - Differentiating insight layer

- TER / hidden-fee insight for ETFs and funds
- ETF alternative suggestions by category
- Benchmark comparison
- Automated reporting / export
- Smart anomaly detection on imports and holdings

## Recommended Delivery Phases

### Phase 1 - Ledger foundation

**Objective:** make imported data reliable enough to support real investment analytics.

Deliver:

- `Institution`, `Account`, `ImportJob`, `ImportRow`
- richer `LedgerTransaction` kinds
- source templates for the first brokers/exchanges we care about
- file checksum + dedupe strategy
- import history screen

Exit criteria:

- importing the same file twice does not duplicate transactions
- each imported row can be traced back to its source file
- one user can consolidate multiple brokers/exchanges in one portfolio

### Phase 2 - Finary-like performance core

**Objective:** move from valuation tracking to investment tracking.

Deliver:

- PRU engine
- unrealized P/L
- winners / losers
- cost basis aware position cards
- period performance logic with explicit caveats on missing history

Exit criteria:

- every position shows either a valid PRU or an explicit "unknown cost basis" state
- dashboard value and P/L can be explained from imported transactions

### Phase 3 - Insight layer

**Objective:** match the investment insights users expect from Finary.

Deliver:

- dividend tracker
- sector exposure
- geographic exposure
- fee analytics
- richer allocation screens

Exit criteria:

- user can explain where returns come from: market move, dividends, fees, allocations

### Phase 4 - Crypto depth

**Objective:** avoid a stock-centric model that breaks on crypto behavior.

Deliver:

- transfer detection between owned accounts
- swap handling
- staking rewards
- wallet/exchange CSV templates
- network-aware asset metadata where useful

Exit criteria:

- common exchange exports no longer distort PRU or holdings
- internal transfers are not misread as performance

## What We Should Not Build Yet

- Budget or bank transaction categorization
- Real estate or debt modeling
- Social/community features
- Tax reporting for realized gains
- Automatic sync connectors

These are valid later directions, but they dilute the current objective.

## Immediate Backlog Implications In This Repo

### Highest-impact files to evolve first

- `src/types/index.ts`
  - add account, import, asset metadata, dividend, and richer transaction types
- `src/db/index.ts`
  - add new Dexie tables and indexes for import provenance and account-level queries
- `src/lib/csvImport.ts`
  - move from "flat normalized row parser" to "source-aware canonical ledger importer"
- `src/lib/computations.ts`
  - add PRU, unrealized P/L, dividend, and performance-period calculations
- `src/features/import/CsvImportSection.tsx`
  - add source selection, preview quality gates, and import history
- `src/features/dashboard/Dashboard.tsx`
  - replace pure valuation KPIs with investment KPIs

### First milestone I recommend building next

1. Introduce `Account` and `ImportJob`
2. Extend transaction kinds for dividends and crypto movements
3. Add file dedupe + import provenance
4. Implement PRU + unrealized P/L engine
5. Redesign the dashboard around value + cost + P/L + quality alerts

If these five items are not in place, the rest of the "Finary-like" roadmap will be cosmetic.

## Sources

Official sources consulted on **2026-03-18**:

- [Finary Plus](https://finary.com/fr/finary-plus)
- [Comprendre ma performance (plus-value)](https://help.finary.com/fr/articles/7664120-comprendre-ma-performance-plus-value)
- [Suivre ses dividendes](https://help.finary.com/fr/articles/7973821-suivre-ses-dividendes)
- [Je ne peux plus connecter de comptes](https://help.finary.com/fr/articles/7868754-je-ne-peux-plus-connecter-de-comptes)
- [Comment baisser mes frais ?](https://help.finary.com/fr/articles/7050948-comment-baisser-mes-frais)
- [Comprendre les frais cachés](https://help.finary.com/fr/articles/6521721-comprendre-les-frais-caches)
- [Comprendre l'identification des actifs et les erreurs possibles](https://help.finary.com/fr/articles/10502729-comprendre-l-identification-des-actifs-et-les-erreurs-possibles)
- [Comment est calcule le prix de revient unitaire de mes cryptos sur Finary Crypto ?](https://help.finary.com/fr/articles/12034796-comment-est-calcule-le-prix-de-revient-unitaire-de-mes-cryptos-sur-finary-crypto)
- [Suivi de mon patrimoine](https://help.finary.com/fr/collections/11519753-suivi-de-mon-patrimoine)
