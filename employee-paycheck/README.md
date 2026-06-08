# Employee Paycheck Preview — SAP → Workday (Johns Hopkins University)

A simple, reassuring, **employee-facing** view of how a person's pay will look in
the future Workday system, based on parallel-run testing. Branded for **Johns
Hopkins University** (Heritage Blue + Spirit Blue). It is the companion to the
implementation-team tool in `../payroll-compare/` — same underlying data idea,
completely different audience and purpose.

> **Team tool (`payroll-compare/`):** forensic — find and explain every discrepancy.
> **This tool (`employee-paycheck/`):** human — help an employee see their future
> pay, understand any differences in plain language, and plan ahead.

The headline challenge it solves: **non-exempt employees move from semi-monthly
(24 paychecks/yr) to weekly (52 paychecks/yr).** Each weekly check is *smaller*,
which can alarm someone reading quickly — even though their monthly and annual
take-home barely change. Every design choice here is aimed at defusing that.

---

## Running it

No build, no server, no install. **Double-click `index.html`**. Use the
**"Viewing as"** menu (top-right) to switch between sample employees. Everything
runs locally; no data leaves the page. It's designed to read well on a phone.

The **"Review mode"** button (top-right) is for administrators — see
[Review mode](#review-mode-for-administrators) below.

---

## What an employee sees

1. **A plain headline** tuned to their situation — "your take-home stays about the
   same, you'll just be paid weekly," or for exempt staff "nothing about your pay
   is changing."
2. **Two paychecks side by side** — today (semi-monthly) vs Workday (weekly), with
   the smaller weekly number shown honestly and immediately explained
   ("smaller each time, more than twice as often").
3. **What really matters** — take-home **over a month** and **over a year**, where
   the numbers barely move. Small real differences are shown as exact, calm deltas
   (e.g. "−$10.00 a month"), never hidden.
4. **Why the new paycheck is smaller** — a simple visual: 2 bigger checks a month
   vs 4–5 smaller ones, same total.
5. **When you'll get paid** — the weekly "in arrears" timing, a transition pay
   calendar, and a prominent, positive note that **the university covers the 3–4
   day gap** during the switch, so no one is short.
6. **What's a little different (and why)** — plain-language explanations of any
   genuine changes (e.g. "federal income tax: about $120 more is withheld per year —
   this is withholding, not what you owe; you can update your elections").
7. **See the breakdown** (expandable) — every component compared **over a year**
   (the only fair basis when paycheck counts differ), grouped into *Money in* and
   *Money out*, plus an *employer contributions* note. Each line in plain English.
8. **A clear disclaimer** that these are estimates from test runs, for planning.

The story adapts automatically. The sample roster is fictitious JHU staff — mostly
non-exempt (the group the semi-monthly → weekly change affects), plus one exempt
control:

| Sample employee | Role | Situation it demonstrates |
|---|---|---|
| **Aaliyah Robinson** (Non-exempt) | Administrative Coordinator | Frequency change only — take-home identical. The core reassurance case. |
| **Marcus Bennett** (Non-exempt) | Research Technologist | Frequency change **plus** a real ~$130/yr higher federal withholding, with overtime. |
| **Priya Nair** (Non-exempt) | Laboratory Technician | Frequency change **plus** one real difference (health premium up ~$240/yr for the new plan year); uses an HSA. |
| **Daniel Foster** (Non-exempt) | Facilities Maintenance Mechanic | Heavy overtime — the strongest "weekly actually helps" case; totals unchanged. |
| **Denise Powell** (Non-exempt) | Student Accounts Specialist | Frequency change **plus** a small Maryland withholding update (~$90/yr). |
| **Grace Liu** (Exempt) | Grants & Contracts Analyst | **No** frequency change and every amount matches — the "nothing changes" control. |

> Retirement is shown as a **403(b)** with an employer contribution (the university
> plan), and state tax is **Maryland** state & local. All names and figures are
> fictitious.

---

## Review mode (for administrators)

A toggle in the top-right switches the page from the employee view to an
**administrative review view** of the *same* employee page, for the team validating
each person's parallel-run result before it goes out. It adds, without changing what
the employee sees when it's off:

- **A review banner** making clear this is the internal view (employees never see it).
- **Review progress** across the whole roster — a chip per employee, colour-coded by
  status (unreviewed / reviewed / needs follow-up) with a flag count; click to jump.
- **Per-employee discrepancy tracking** — an auto-detected list of every SAP↔Workday
  difference (and wage-type **mapping gaps**), each with a checkbox to **flag it as a
  discrepancy**, a **review status** (Unreviewed / Reviewed / Needs follow-up), and a
  free-text **notes** field.
- **Explicit payroll detail** — the full breakdown, always open, with exact figures
  to the cent, **per-check** amounts for each system, the annual **variance
  (Workday − SAP)** per line, and mapping-gap highlighting.
- **CSV export** of all review notes (status, flagged components, net variance, notes
  per employee), consistent with the team tool's export.

Review state (flags, status, notes) is saved on the device via `localStorage`, so it
survives a reload. It stays local to the browser — nothing is sent anywhere — and the
CSV export is the durable, shareable record.

---

## How the numbers work

Pay is stored as **annual amounts per component, per system** (`data.js`). The app
derives each system's per-paycheck amount by dividing by that system's
paychecks-per-year (24 semi-monthly, 52 weekly). Storing annual amounts keeps the
"over a year it's the same" comparison exact even when the two systems pay on
different schedules.

- **Take-home** = earnings − (pre-tax + tax + post-tax deductions). Employer
  contributions don't reduce pay and are shown separately as a positive.
- A component is flagged as a real change only when its **annual** amounts differ;
  a difference that's purely "same per year, more paychecks" is labelled as such,
  not as a cut.

---

## Plugging in real data

`data.js` is the only file to change. Replace the sample `employees` array with
your parallel-run output (one `sap` and one `workday` block per employee, each with
its `schedule` and annual `{ componentCode: amount }` map), and adjust the shared
`transition` timeline to your real switch dates. Component codes and friendly
labels live in `catalog`. The plain-language explanations are generated
automatically from the numbers — no per-employee copywriting needed.

> When you have the real transition dates and the confirmed bridge-pay mechanism
> for the 3–4 day gap, update the `transition` block in `data.js`; the wording in
> the "When you'll get paid" section flows from it.

---

## Files

| File | Purpose |
|---|---|
| `index.html` | Page shell + employee switcher. |
| `styles.css` | All styling (calm, friendly, mobile-first). |
| `data.js` | Sample employees, component catalog, transition timeline. |
| `app.js` | Per-check / monthly / annual math, plain-language explanations, rendering. |
