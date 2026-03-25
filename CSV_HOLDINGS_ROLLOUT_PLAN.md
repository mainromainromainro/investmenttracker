# CSV Import + Holdings Rollout Plan (Canonical)

## Objective

Make CSV ingestion and holdings tracking trustworthy before adding valuation and performance.

V1 output:

- holdings quantities per account + platform + ticker
- portfolio-level consolidation by ticker in the UI
- explicit audit trail for imported/ignored/rejected rows

## Locked Decisions

- Priority sources: Trading 212, Interactive Brokers, Revolut Stock
- V1 identity key: ticker
- Secondary metadata: ISIN, name, currency (store when present, do not block V1)
- IBKR V1: treat exports as sectioned reports and use "Open Position Summary" as the authoritative holdings source

## Source Notes

### Trading 212

- Transactional CSV: BUY/SELL/DEPOSIT/FEE rows.
- Ticker present for investment rows.
- ISIN present for investment rows.

### Revolut Stock

- Transactional CSV: BUY rows and DIVIDEND rows.
- Ticker always present.

### Interactive Brokers (IBKR)

The provided file is a performance report (multi-section), not a flat ledger.

Supported V1 section:

- "Open Position Summary" -> holdings snapshot by Symbol + Quantity.

Explicitly out of scope for V1:

- attempting to compute holdings from benchmark/performance sections
- treating the file as a single header + rows CSV

## Phases

### Phase 0: Stabilize and make failures visible

- Add fixture-based tests from real exports (Trading 212, Revolut, IBKR section sample).
- Add import preview summaries: detected source, selected section, accepted/ignored/rejected counts.
- Ensure unsupported IBKR sections are ignored explicitly.

### Phase 1: Holdings Engine V1 (quantity only)

- Canonical holdings computation:
  - quantity delta: BUY positive, SELL negative
  - DIVIDEND/DEPOSIT/WITHDRAW/FEE do not affect holdings quantity
- Dashboard must use the canonical holdings engine results for quantities.
- Ensure account/platform scoping is correct (no leakage into default scope).

### Phase 2: Onboarding V2 (review-driven import)

- Multi-step import UX:
  - upload, source detection, mapping review, preview, confirm
- Persist source profile/mapping memory and reapply on next import.

### Phase 3+: Valuation and performance (later)

- Valuation: prices and EUR conversion + coverage.
- Performance: PRU, unrealized/realized PnL, dividends, fees, transfers/swaps.

## Acceptance Criteria (V1)

- Trading 212 multi-ticker import never collapses to a single holding.
- Revolut dividends do not affect holdings quantities.
- IBKR sample: importing "Open Position Summary" yields ticker "DCAM" quantity 477.
- Duplicate imports are idempotent (auditable, not double-counted).

## Governance

See [CENTRAL_GOVERNANCE.md](/Users/romain/Investment%20Tracker/CENTRAL_GOVERNANCE.md) for execution checklist, gates, and reviewer rubric.

