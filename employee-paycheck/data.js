/* ============================================================================
   data.js — Sample data for the Employee Paycheck Preview
   (your pay today in SAP  →  your pay in the future Workday system)

   Audience: the EMPLOYEE, not the project team. Everything here is shaped so the
   app can tell a simple, reassuring story — especially for non-exempt employees
   whose pay frequency changes from semi-monthly (24/yr) to weekly (52/yr).

   Data is based on parallel-run testing: real SAP pay vs a parallel Workday test
   run. Amounts are stored as ANNUAL figures per component per system; the app
   derives the per-paycheck amount by dividing by that system's paychecks-per-year.
   Storing annual amounts keeps the "over a year it's the same" comparison exact
   even when the two systems pay on different schedules.

   Exposes: window.PAYDATA = { catalog, employees, transition }
   ========================================================================== */
(function () {
  'use strict';

  // ---- Friendly component catalog -----------------------------------------
  // group: in (money in) | out (money out) | employer (paid by employer, not you)
  // 'plain' is the one-line explanation an employee sees.
  var catalog = {
    BASE:     { group: 'in',  label: 'Base pay',                 plain: 'Your regular pay.' },
    OT:       { group: 'in',  label: 'Overtime',                 plain: 'Extra pay for hours over 40 in a week. This varies each paycheck.', varies: true },
    BONUS:    { group: 'in',  label: 'Bonus',                    plain: 'Additional pay on top of your base.' },

    PRE_401K: { group: 'out', label: 'Retirement savings (401k)', plain: 'Money you set aside for retirement, taken out before taxes.' },
    HSA:      { group: 'out', label: 'Health savings account',   plain: 'Money you set aside for medical costs, before taxes.' },
    MED_PRE:  { group: 'out', label: 'Health insurance',         plain: 'Your share of your medical plan premium.' },

    FIT:      { group: 'out', label: 'Federal income tax',       plain: 'Federal tax withheld from your pay.', isTax: true },
    SS_EE:    { group: 'out', label: 'Social Security',          plain: 'Required Social Security contribution (6.2%).', isTax: true },
    MED_EE:   { group: 'out', label: 'Medicare',                 plain: 'Required Medicare contribution (1.45%).', isTax: true },
    SIT:      { group: 'out', label: 'State income tax',         plain: 'State tax withheld from your pay.', isTax: true },

    ROTH:     { group: 'out', label: 'Roth retirement savings',  plain: 'Retirement savings taken out after taxes.' },
    LIFE:     { group: 'out', label: 'Life insurance',           plain: 'Your voluntary life insurance premium.' },
    GARNISH:  { group: 'out', label: 'Garnishment',             plain: 'A required court-ordered deduction.' },

    ER_401K:  { group: 'employer', label: 'Employer 401(k) match', plain: 'Money your employer adds to your retirement. This is NOT taken out of your pay.' }
  };

  // category needed for net math: earnings add to take-home, everything in 'out'
  // subtracts, employer items do not affect take-home.
  function netSign(code) {
    var g = catalog[code] ? catalog[code].group : 'in';
    if (g === 'in') return 1;
    if (g === 'out') return -1;
    return 0;
  }

  // ---- Schedules ----------------------------------------------------------
  var SEMI = { key: 'semi', name: 'Semi-monthly', perYear: 24, cadence: 'twice a month', when: 'around the 15th and the last working day of each month' };
  var WEEKLY = { key: 'weekly', name: 'Weekly', perYear: 52, cadence: 'every week', when: 'every Friday, for the week you just finished (paid in arrears)' };

  // ---- Employees ----------------------------------------------------------
  // Each system carries its schedule + annual amounts per component.
  // For non-exempt employees the schedule changes (semi -> weekly); for exempt
  // employees it stays the same. Most components are equal year-over-year so the
  // story is "same pay, new rhythm"; a few carry a genuine, clearly-explained
  // difference so the app can demonstrate explaining real changes too.
  var employees = [
    {
      id: 'E2001', first: 'David', name: 'David Kim', title: 'Operations Associate',
      classification: 'Non-exempt', location: 'Chicago, IL',
      sap:     { schedule: SEMI,   annual: { BASE: 52000, OT: 3120, PRE_401K: 2756, MED_PRE: 1560, FIT: 4400, SS_EE: 3417.44, MED_EE: 799.24, SIT: 1650, ER_401K: 1378 } },
      workday: { schedule: WEEKLY, annual: { BASE: 52000, OT: 3120, PRE_401K: 2756, MED_PRE: 1560, FIT: 4400, SS_EE: 3417.44, MED_EE: 799.24, SIT: 1650, ER_401K: 1378 } }
    },
    {
      id: 'E2002', first: 'Maria', name: 'Maria Gonzalez', title: 'Warehouse Lead',
      classification: 'Non-exempt', location: 'Memphis, TN',
      // Tennessee has no state income tax. One real difference: Workday withholds
      // ~$120/yr more in federal tax under its current setup.
      sap:     { schedule: SEMI,   annual: { BASE: 47000, OT: 4500, PRE_401K: 1545, MED_PRE: 1320, FIT: 3600, SS_EE: 3193.10, MED_EE: 746.75 } },
      workday: { schedule: WEEKLY, annual: { BASE: 47000, OT: 4500, PRE_401K: 1545, MED_PRE: 1320, FIT: 3720, SS_EE: 3193.10, MED_EE: 746.75 } }
    },
    {
      id: 'E2003', first: 'Tyrone', name: 'Tyrone Williams', title: 'Customer Support Specialist',
      classification: 'Non-exempt', location: 'Phoenix, AZ',
      sap:     { schedule: SEMI,   annual: { BASE: 45000, OT: 1800, MED_PRE: 1080, FIT: 3300, SS_EE: 2901.60, MED_EE: 678.60, SIT: 1100 } },
      workday: { schedule: WEEKLY, annual: { BASE: 45000, OT: 1800, MED_PRE: 1080, FIT: 3300, SS_EE: 2901.60, MED_EE: 678.60, SIT: 1100 } }
    },
    {
      id: 'E2004', first: 'Sarah', name: 'Sarah Chen', title: 'Software Engineer',
      classification: 'Exempt', location: 'New York, NY',
      // Schedule does NOT change (semi -> semi). One real difference: health
      // insurance premium rose for the new plan year (~$240/yr).
      sap:     { schedule: SEMI, annual: { BASE: 130000, PRE_401K: 9100, MED_PRE: 2400, FIT: 19500, SS_EE: 8060, MED_EE: 1885, SIT: 7800, ER_401K: 5200 } },
      workday: { schedule: SEMI, annual: { BASE: 130000, PRE_401K: 9100, MED_PRE: 2640, FIT: 19500, SS_EE: 8060, MED_EE: 1885, SIT: 7800, ER_401K: 5200 } }
    },
    {
      id: 'E2005', first: 'James', name: 'James Brown', title: 'Finance Manager',
      classification: 'Exempt', location: 'Charlotte, NC',
      // Nothing changes — schedule the same, every amount matches.
      sap:     { schedule: SEMI, annual: { BASE: 105000, PRE_401K: 8400, MED_PRE: 2460, FIT: 15600, SS_EE: 6510, MED_EE: 1522.50, SIT: 7350, ER_401K: 5250 } },
      workday: { schedule: SEMI, annual: { BASE: 105000, PRE_401K: 8400, MED_PRE: 2460, FIT: 15600, SS_EE: 6510, MED_EE: 1522.50, SIT: 7350, ER_401K: 5250 } }
    }
  ];

  // ---- Transition timeline (illustrative) ---------------------------------
  // Only relevant for employees whose schedule changes (semi -> weekly).
  var transition = {
    switchPhrase: 'the week of July 6, 2026',
    fromCadence: 'twice a month',
    toCadence: 'every Friday',
    lagDays: '3–4 days',
    events: [
      { date: 'Jun 15', covers: 'Jun 1–15',        type: 'semi',   label: 'Semi-monthly paycheck' },
      { date: 'Jun 30', covers: 'Jun 16–30',       type: 'semi',   label: 'Last semi-monthly paycheck' },
      { date: 'Gap',    covers: '3–4 days',        type: 'gap',    label: 'Short gap — covered by the company' },
      { date: 'Jul 10', covers: 'week of Jun 29',  type: 'weekly', label: 'First weekly paycheck' },
      { date: 'Jul 17', covers: 'week of Jul 6',   type: 'weekly', label: 'Weekly paycheck' }
    ],
    coveredNote: 'There is a short 3–4 day gap between your last semi-monthly paycheck and your first weekly paycheck. The company is covering that gap, so you will not be short a paycheck during the switch.'
  };

  window.PAYDATA = { catalog: catalog, netSign: netSign, employees: employees, transition: transition };
})();
