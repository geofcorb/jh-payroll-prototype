# jh-payroll-prototype

Prototype tools supporting an **SAP (legacy) → Workday (future) payroll migration**,
built around **parallel-run testing**: real SAP payroll runs compared against parallel
Workday runs executed in a test environment (Workday is **not yet live**).

Two **zero-install static web apps** — plain HTML / CSS / vanilla JS, no build step,
no server, no dependencies. Open either app's `index.html` directly in a browser, or
use the bundled preview servers (see **Running**).

## Apps

### `payroll-compare/` — implementation-team tool
Forensic discrepancy comparison for one employee + one pay period: every pay
component, SAP vs Workday, with an **auto-detected cause** for each discrepancy.
- Engine + rendering in `app.js`; cause rules live in `classify()`:
  `MATCH, ROUNDING, PRORATION, TAX_CONFIG, RATE_DIFF, MAPPING_GAP, RETRO`.
  Cause explanations are in `data.js` → `causeInfo`.
- Components are paired across systems by a shared `component_code`; a code present
  in only one system surfaces as a wage-type **mapping gap**.
- Ships with sample data in `data.js` (8 employees × 4 monthly 2026 periods, including
  a fully-reconciled control). **CSV import/export** works for real extracts — see
  `payroll-compare/sample-import-template.csv` and the in-app **Help**.
- The UI depends only on the in-memory shape `{ employees, periods, runs }`.

### `employee-paycheck/` — employee-facing preview
Simple, reassuring preview of an employee's **future Workday pay**, for awareness and
planning. Audience is the employee, not the project team. **Branded for Johns Hopkins
University** (Heritage Blue `#002d72` + Spirit Blue `#68ace5`); sample roster is JHU
non-exempt staff (plus one exempt control), retirement shown as **403(b)**, state tax
is **Maryland**.
- Built around the biggest change: **non-exempt employees move from semi-monthly
  (24 paychecks/yr) to weekly (52/yr)** — each weekly check is smaller, but monthly
  and annual take-home are ~unchanged. Every design choice defuses "my check shrank."
- Leads with **per-paycheck side by side**, then monthly/annual reassurance, a
  **transition pay calendar** (the weekly in-arrears lag + the **3–4 day switch gap
  that the organization covers** — framed as reassurance, not a warning), and a
  **simple-first, expandable** component breakdown in plain language.
- Data model: amounts are stored as **annual, per component, per system** in `data.js`;
  the per-check figure is derived by dividing by that system's paychecks-per-year.
  Plain-language explanations are generated from the numbers in `app.js`.
- **Review mode** (top-right toggle, `state.reviewMode`): an admin view of the same
  page that adds explicit payroll detail (exact cents, per-check columns, Workday−SAP
  variance, wage-type mapping gaps) and **per-employee discrepancy tracking** — flag
  lines, set status (unreviewed/reviewed/follow-up), notes, plus a roster progress
  strip and **CSV export**. State persists in `localStorage` (`jhu-paycheck-review-v1`);
  the employee-facing view is unchanged when it's off.

## Running
Open `payroll-compare/index.html` or `employee-paycheck/index.html` directly in any
browser — the apps are `file://`-safe.

For the **Claude preview servers** (`.claude/launch.json`): the preview sandbox can't
read `~/Documents` (macOS **TCC**), and `python3 -m http.server` separately trips the
sandbox's `getcwd` block. So the config (a) serves via a small inline `http.server`
that never calls `getcwd`, and (b) serves a **staged copy** under
`/tmp/jh-payroll-preview` (the sandbox *can* read `/tmp`). After editing app files,
re-sync with `bash .claude/stage-preview.sh`, then start the preview:
- payroll-compare → http://localhost:8123
- employee-paycheck → http://localhost:8124

> The staged copy is a snapshot — edits to the source aren't visible until you re-run
> `stage-preview.sh`. Opening the app's `index.html` directly always shows live files.

## Working in this repo
- Pure front-end, no toolchain. Keep it dependency-free and **`file://`-openable**:
  classic `<script>` / `<link>` tags only — no ES-module `import`, no `fetch` of local
  files (both break under `file://`).
- Variance convention (app 1): **`Workday − SAP`**. Net math always ties out — the sum
  of per-line net impacts equals the headline net variance.
- To plug in **real data**: app 1 via CSV import (or replace `data.js`); app 2 by
  editing `data.js` only (the `employees` array + the shared `transition` block).
- **Next step:** load real SAP + Workday extracts in place of the sample data.
