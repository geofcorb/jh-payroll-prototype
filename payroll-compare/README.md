# Payroll Parallel-Run Comparison — SAP → Workday

A zero-install web app for **parallel-run validation**: it compares one employee's
payroll for a given pay run between the legacy **SAP** system and the future
**Workday** system, component by component, flags every discrepancy, and
**auto-detects the likely cause** of each one.

Built for the reconciliation work that dominates an SAP→Workday payroll migration:
"net is off by $281 — *why*?"

---

## Running it

No build, no server, no install. **Double-click `index.html`** (or drag it into a
browser). Everything runs locally in the page; no data leaves your machine.

> Tested in current Chrome, Edge, Safari, and Firefox.

---

## What you can do

1. **Find an employee** — search by name, ID, department, or location.
2. **Pick a pay period** — the strip shows the net variance for every run so you
   can spot which period drifted, then click one to drill in.
3. **Read the comparison**, top to bottom:
   - **Summary cards** — Gross, Total Deductions & Tax, Net Pay, Employer Cost,
     plus a Diagnosis card (components compared, # discrepancies, largest variance).
   - **Reconciliation overview** — side-by-side bars (SAP vs Workday) for Gross,
     Deductions & Tax, Net, and Employer Cost.
   - **Discrepancies by cause** — clickable chips; click one to filter the table.
   - **Component-level comparison** — every pay component grouped into Earnings,
     Pre-Tax Deductions, Taxes, Post-Tax Deductions, and Employer Contributions,
     with SAP vs Workday amounts, the variance, its **net-pay impact**, and the
     detected status / cause. Subtotals per group and a NET PAY grand total.
   - **Discrepancy breakdown** — each discrepancy ranked by size, with a plain-English
     *Why* and a concrete *Investigate* next step.

**Variance is always `Workday − SAP`.** Green = Workday higher, red = lower.

---

## How causes are detected

The engine pairs components across systems by `component_code` and classifies each
pairing from the numbers and a couple of signal fields — it is **not** told the
answer by the sample data:

| Cause | Rule |
|---|---|
| **Match** | Amounts equal. |
| **Rounding difference** | Both present, agree within ±$0.05. |
| **Proration difference** | Both present, differ, and the two systems report different `worked_days`. |
| **Tax configuration difference** | Both present, differ beyond rounding, component is in the `tax` category. |
| **Rate / amount difference** | Both present, differ beyond rounding, not proration or tax. |
| **Wage-type mapping gap** | Component exists in one system only (no counterpart). |
| **Retroactive adjustment** | A line present in one system only and flagged `retro`. |

The net-pay impact respects the component category: earnings add to net; pre-tax,
tax, and post-tax deductions subtract; employer contributions don't affect net
(tracked as employer cost instead). The sum of all line net-impacts equals the
headline net variance — the reconciliation always ties out.

---

## Loading your own data

The app ships with sample data (8 employees × 4 monthly pay periods, seeded to
demonstrate every cause type, including one fully-reconciled control employee).

To use real extracts:

1. Click **Export / template** to download the current data as CSV and see the
   exact format.
2. Prepare a CSV with **one row per pay component, per system** and click
   **Import CSV**. `sample-import-template.csv` in this folder is a minimal example.

### CSV columns

```
system, employee_id, employee_name, department, location, pay_group,
period_id, period_label, period_start, period_end, pay_date, period_days,
component_code, component_name, category, amount, retro, worked_days
```

- `system` — `SAP` or `Workday`.
- `category` — `earning`, `pre_tax`, `tax`, `post_tax`, or `employer`.
- `component_code` — **use the same code in both systems** so the tool can pair
  components. An unpaired code is reported as a *wage-type mapping gap* — which is
  exactly how you surface unmapped wage types between SAP and Workday.
- `retro` — `Y` for retroactive lines (blank otherwise).
- `worked_days` — drives proration detection; leave blank for a full period.

The importer extends its component catalog automatically, so any wage types /
pay components beyond the built-in set work fine.

> **Mapping note:** in production, SAP wage types and Workday pay components have
> *different* codes. Map both to a shared canonical `component_code` in your
> extract step (a lookup table), and the gaps you see here become your mapping
> backlog.

---

## Files

| File | Purpose |
|---|---|
| `index.html` | Page shell + help modal. |
| `styles.css` | All styling. |
| `data.js` | Sample data, component catalog, and cause reference. Replaceable via CSV import. |
| `app.js` | Comparison engine, cause classification, rendering, CSV import/export. |
| `sample-import-template.csv` | Minimal valid import example. |

---

## Extending it

- **More cause rules** — add to `classify()` in `app.js` and a matching entry in
  `causeInfo` in `data.js`.
- **New pay components** — add to `catalog` in `data.js` (or just include them in
  an imported CSV).
- **Real system feeds** — replace CSV import with a fetch from your SAP/Workday
  extract pipeline; the in-memory shape (`employees`, `periods`, `runs`) is the
  only contract the UI depends on.
