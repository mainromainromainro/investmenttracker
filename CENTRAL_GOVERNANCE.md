# Central Governance: CSV Import + Holdings Rollout

This document is the central reviewer checklist and acceptance rubric for the rollout.

Locked decisions:

- Priority sources: Trading 212, Interactive Brokers, Revolut Stock
- V1 identity key: ticker
- Secondary metadata: ISIN, name, currency (store when present, do not block V1)
- V1 scope: reliable holdings quantities before valuation/performance
- IBKR V1: use "Open Position Summary" as authoritative holdings source (sectioned report, not a flat ledger)

## 1) Execution Checklist

### Repo hygiene

- Ensure a canonical rollout plan exists in-repo and is referenced by all workers.
- Each worker ships changes behind explicit, testable behavior (no silent semantics shifts without tests).
- Keep file ownership boundaries to reduce merge conflicts:
  - ingestion: parsers + source recognition + fixtures/tests
  - data model/import: types, db schema, adminRepository persistence, import audit trail
  - holdings: canonical holdings computation path
  - UI: import review flow and dashboard holdings integration

### Phase 0: Stabilization and observability

- Add fixtures derived from real exports:
  - Trading 212 example
  - Revolut Stock example
  - IBKR report sample (at least "Open Position Summary" subsection)
- Tests:
  - parser can ingest fixtures deterministically
  - import does not collapse multi-ticker files into a single holding
- Add "import debug summary" surfaced in UI or logs:
  - detected source profile and confidence
  - selected section (for IBKR)
  - rows accepted / ignored / rejected counts

### Phase 1: Holdings engine V1 (quantity only)

- Define canonical holdings computation:
  - per account + platform + ticker
  - net quantity = sum(BUY.qty) - sum(SELL.qty)
  - explicitly exclude cash-flow rows (DEPOSIT/WITHDRAW/FEE) from holdings quantities
  - dividends do not change quantity
- Integrate canonical holdings into dashboard:
  - dashboard must use the canonical holdings path for quantity display
  - if old computation path remains, it must be a compatibility layer, not a separate source of truth
- Ensure auditability:
  - after import, user can see which tickers/quantities were produced

### Phase 2: CSV onboarding V2 (review-driven import)

- UI flow:
  - upload
  - source detection (Trading 212 / Revolut / IBKR)
  - mapping review (where applicable)
  - preview of detected tickers/quantities
  - confirm import
- Persist source profile / mapping memory:
  - reuse on next import
  - signature change triggers review

### Later phases (not V1)

- Valuation: price lookup and value computation, plus missing-price coverage.
- Performance: PRU / PnL / dividends/fees accounting.

## 2) Acceptance Gates by Phase

### Gate: Phase 0 (can begin Phase 1)

- Fixture-based tests exist for Trading 212, Revolut Stock, IBKR sample.
- Parsing is deterministic for these fixtures.
- Import preview clearly reports accepted vs ignored vs rejected rows.
- Any unsupported IBKR sections are ignored explicitly (not silently misparsed).

### Gate: Phase 1 (V1 shippable)

- Trading 212 fixture:
  - multiple BUY rows produce holdings per ticker (no single-ticker collapse)
- Revolut Stock fixture:
  - BUY rows affect holdings quantity
  - DIVIDEND rows do not affect holdings quantity
- IBKR fixture:
  - "Open Position Summary" import yields holding ticker "DCAM" quantity 477 for the provided sample
- Account/platform scoping:
  - same ticker in two accounts stays separated in per-account holdings view
- Dedupe behavior:
  - importing the same file twice does not duplicate holdings/transactions
- Dashboard:
  - quantity displayed matches holdings engine result, not an older computation artifact

### Gate: Phase 2 (onboarding ready)

- Source profile selection is visible and user-correctable.
- Mapping can be reviewed/overridden and saved.
- A changed signature triggers review instead of blindly importing.

## 3) Reviewer Rubric (per worker)

General rubric applied to all PRs:

- Does the change preserve locked decisions and scope boundaries?
- Are there tests for new behavior and regressions?
- Is failure mode explicit and user-visible (no silent misclassification)?
- Is it compatible with offline-first constraints (IndexedDB/Dexie)?
- Does it reduce, not increase, the number of "sources of truth" in the app?

### Worker: source_ingestion_worker

- Must:
  - detect Trading 212 and Revolut from headers (stable signatures)
  - detect IBKR as sectioned report; extract "Open Position Summary"
  - output normalized rows for holdings V1
  - add fixtures and tests
- Must not:
  - implement valuation/performance semantics
  - merge assets by anything other than ticker for V1

Review focus:

- Section extraction correctness for IBKR (line-based, robust to commas in quoted text).
- No fragile heuristics based on row counts alone.
- Clear contract for downstream import: required fields per normalized row.

### Worker: data_model_import_worker

- Must:
  - persist audit trail (import job + import rows + statuses)
  - store secondary metadata (isin/name/currency) where available
  - maintain idempotent dedupe using file fingerprint + scope
- Must not:
  - change holdings semantics without corresponding holdings-engine tests

Review focus:

- IndexedDB schema migration safety and backwards compatibility.
- Idempotency: duplicates are auditable but not persisted as extra ledger events.
- Separation between "raw import row" and "canonical row".

### Worker: holdings_engine_worker

- Must:
  - define canonical holdings computation path used by UI
  - compute net quantities correctly and deterministically
  - keep account/platform scoping correct
- Must not:
  - rely on live market data
  - introduce a second competing holdings computation path

Review focus:

- Clear APIs and consistent scoping keys.
- Handles BUY/SELL only for quantity change.
- Handles snapshot-style holdings (IBKR Open Position Summary) without mixing semantics.

### Worker: import_dashboard_ui_worker

- Must:
  - expose the review-driven onboarding flow (even if minimal)
  - show preview tickers/quantities and ignored/rejected counts
  - integrate dashboard holdings display to canonical holdings engine
- Must not:
  - hide errors behind generic "0 rows" messages

Review focus:

- UX reveals what source/section was used (especially for IBKR).
- Mapping override is visible when detection confidence is low.
- Dashboard uses canonical holdings engine results consistently.

## 4) Contradictions to Flag Before Integration

### Competing computation engines

If the dashboard uses a different computation path than the holdings engine, V1 will remain untrustworthy.
Action: enforce one canonical holdings source for quantity display.

### Asset identity mismatch

Current persistence may key assets by uppercase symbol. V1 uses ticker, but we must avoid silently merging incompatible instruments.
Action: keep ticker-only for V1, but persist secondary metadata and surface ambiguity during import review.

### IBKR report misclassification

IBKR performance reports are sectioned. Treating them as a flat CSV will produce garbage.
Action: require section extraction and explicitly supported sections list.

### Snapshot vs transactions semantics

IBKR Open Position Summary is a holdings snapshot; Trading 212/Revolut are transactions.
Action: do not combine semantics implicitly. Either:
  - persist as a holdings snapshot source, or
  - convert to synthetic transactions with explicit source markers.

### Default platform/account leakage

If "default platform/account" is used to fill missing data, it can collapse holdings into one account.
Action: require explicit scoping and show scope in preview/import history.

