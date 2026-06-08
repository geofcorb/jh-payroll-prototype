# JH Payroll Prototype

Two lightweight, **zero-install web apps** that support an **SAP → Workday payroll
migration**, using **parallel-run** data — real SAP payroll runs compared against
Workday runs from a test environment (Workday is not yet live).

Both are plain HTML / CSS / JavaScript: no build step, no server, no dependencies.
They currently run on **illustrative sample data**; real SAP and Workday extracts can
be loaded later.

## The two apps

### 🔍 `payroll-compare/` — for the implementation team
A forensic, **component-by-component** comparison of one employee's pay for one pay
period, SAP vs Workday. It flags every discrepancy and **auto-detects the likely
cause** — rate difference, tax-configuration difference, wage-type mapping gap,
proration, retroactive adjustment, or rounding. Supports CSV import/export so real
extracts can be dropped in.

### 💵 `employee-paycheck/` — for the employee
A simple, reassuring preview of how an employee's paycheck will look in Workday,
**branded for Johns Hopkins University**. It's built for the change that affects
non-exempt staff most: moving from **semi-monthly (24 paychecks a year) to weekly
(52 a year)** — where each check is smaller but monthly and yearly take-home stay
about the same. It also explains the timing of the switch and any real differences in
plain language. A built-in **administrative review mode** lets the team add explicit
payroll detail and track per-employee discrepancies (flags, status, notes, CSV
export) while validating each person's parallel-run result.

## Viewing the apps

These are static pages, so you can:

- **Clone or download** this repo and open `payroll-compare/index.html` or
  `employee-paycheck/index.html` in any browser; **or**
- **Quick preview, no download** (via htmlpreview.github.io):
  - [payroll-compare](https://htmlpreview.github.io/?https://github.com/geofcorb/jh-payroll-prototype/blob/main/payroll-compare/index.html)
  - [employee-paycheck](https://htmlpreview.github.io/?https://github.com/geofcorb/jh-payroll-prototype/blob/main/employee-paycheck/index.html)
- **Or enable GitHub Pages** (repo *Settings → Pages → Deploy from branch `main`*) for
  clean shareable links like
  `https://geofcorb.github.io/jh-payroll-prototype/payroll-compare/`.

## Status

Prototype on illustrative sample data — **all names and figures are fictitious**.
Built as a migration planning and validation aid, not a system of record.

> Working on the code? See [`CLAUDE.md`](CLAUDE.md) for the architecture, data models,
> and conventions.
