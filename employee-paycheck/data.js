/* ============================================================================
   data.js — Sample data for the Employee Paycheck Preview (Johns Hopkins University)
   (your pay today in SAP  →  your pay in the future Workday system)

   Audience: the EMPLOYEE, not the project team. Everything here is shaped so the
   app can tell a simple, reassuring story — especially for non-exempt employees
   whose pay frequency changes from semi-monthly (24/yr) to weekly (52/yr).

   Data is based on parallel-run testing: real SAP pay vs a parallel Workday test
   run. Amounts are stored as ANNUAL figures per component per system; the app
   derives the per-paycheck amount by dividing by that system's paychecks-per-year.
   Storing annual amounts keeps the "over a year it's the same" comparison exact
   even when the two systems pay on different schedules.

   Sample roster is Johns Hopkins University staff. Most are non-exempt (the group
   the semi-monthly -> weekly change affects); one exempt role is kept as a
   "nothing changes" control. All names and figures are fictitious.

   Exposes: window.PAYDATA = { catalog, employees, transition }
   ========================================================================== */
(function () {
  'use strict';

  // ---- Friendly component catalog -----------------------------------------
  // group: in (money in) | out (money out) | employer (paid by employer, not you)
  // 'plain' is the one-line explanation an employee sees.
  // University retirement is a 403(b) plan (not a 401k), reflected in the labels.
  var catalog = {
    BASE:     { group: 'in',  label: 'Base pay',                 plain: 'Your regular pay.' },
    OT:       { group: 'in',  label: 'Overtime',                 plain: 'Extra pay for hours over 40 in a week. This varies each paycheck.', varies: true },
    BONUS:    { group: 'in',  label: 'Bonus',                    plain: 'Additional pay on top of your base.' },

    PRE_401K: { group: 'out', label: 'Retirement savings (403(b))', plain: 'Money you set aside for retirement, taken out before taxes.' },
    HSA:      { group: 'out', label: 'Health savings account',   plain: 'Money you set aside for medical costs, before taxes.' },
    MED_PRE:  { group: 'out', label: 'Health insurance',         plain: 'Your share of your medical plan premium.' },

    FIT:      { group: 'out', label: 'Federal income tax',       plain: 'Federal tax withheld from your pay.', isTax: true },
    SS_EE:    { group: 'out', label: 'Social Security',          plain: 'Required Social Security contribution (6.2%).', isTax: true },
    MED_EE:   { group: 'out', label: 'Medicare',                 plain: 'Required Medicare contribution (1.45%).', isTax: true },
    SIT:      { group: 'out', label: 'State income tax',         plain: 'Maryland state & local tax withheld from your pay.', isTax: true },

    ROTH:     { group: 'out', label: 'Roth retirement savings',  plain: 'Retirement savings taken out after taxes.' },
    LIFE:     { group: 'out', label: 'Life insurance',           plain: 'Your voluntary life insurance premium.' },
    GARNISH:  { group: 'out', label: 'Garnishment',             plain: 'A required court-ordered deduction.' },

    ER_401K:  { group: 'employer', label: 'Employer 403(b) contribution', plain: 'Money the university adds to your retirement. This is NOT taken out of your pay.' }
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
      id: 'E2001', first: 'Aaliyah', name: 'Aaliyah Robinson', title: 'Administrative Coordinator',
      classification: 'Non-exempt', location: 'Homewood Campus, Baltimore, MD',
      // The clean control: everything matches over the year — only the rhythm changes.
      sap:     { schedule: SEMI,   annual: { BASE: 48000, PRE_401K: 1920, MED_PRE: 1440, FIT: 4200, SS_EE: 2976.00, MED_EE: 696.00, SIT: 3000, ER_401K: 2880 } },
      workday: { schedule: WEEKLY, annual: { BASE: 48000, PRE_401K: 1920, MED_PRE: 1440, FIT: 4200, SS_EE: 2976.00, MED_EE: 696.00, SIT: 3000, ER_401K: 2880 } }
    },
    {
      id: 'E2002', first: 'Marcus', name: 'Marcus Bennett', title: 'Research Technologist',
      classification: 'Non-exempt', location: 'East Baltimore Campus, Baltimore, MD',
      // Regular overtime. One real difference: Workday withholds ~$130/yr more in
      // federal tax under its current setup.
      sap:     { schedule: SEMI,   annual: { BASE: 52000, OT: 4160, PRE_401K: 2080, MED_PRE: 1560, FIT: 4600, SS_EE: 3481.92, MED_EE: 814.32, SIT: 3300, ER_401K: 3120 } },
      workday: { schedule: WEEKLY, annual: { BASE: 52000, OT: 4160, PRE_401K: 2080, MED_PRE: 1560, FIT: 4730, SS_EE: 3481.92, MED_EE: 814.32, SIT: 3300, ER_401K: 3120 } }
    },
    {
      id: 'E2003', first: 'Priya', name: 'Priya Nair', title: 'Laboratory Technician',
      classification: 'Non-exempt', location: 'Homewood Campus, Baltimore, MD',
      // One real difference: health insurance premium rose for the new plan year
      // (~$240/yr). Uses an HSA instead of a 403(b) contribution.
      sap:     { schedule: SEMI,   annual: { BASE: 45000, OT: 1500, HSA: 1500, MED_PRE: 1320, FIT: 3600, SS_EE: 2883.00, MED_EE: 674.25, SIT: 2900, ER_401K: 2700 } },
      workday: { schedule: WEEKLY, annual: { BASE: 45000, OT: 1500, HSA: 1500, MED_PRE: 1560, FIT: 3600, SS_EE: 2883.00, MED_EE: 674.25, SIT: 2900, ER_401K: 2700 } }
    },
    {
      id: 'E2004', first: 'Daniel', name: 'Daniel Foster', title: 'Facilities Maintenance Mechanic',
      classification: 'Non-exempt', location: 'Homewood Campus, Baltimore, MD',
      // Heavy overtime — the strongest "weekly actually helps" case (OT lands sooner,
      // varies a lot). Everything matches over the year.
      sap:     { schedule: SEMI,   annual: { BASE: 50000, OT: 9000, PRE_401K: 2000, MED_PRE: 1680, FIT: 5200, SS_EE: 3658.00, MED_EE: 855.50, SIT: 3400, ER_401K: 3000 } },
      workday: { schedule: WEEKLY, annual: { BASE: 50000, OT: 9000, PRE_401K: 2000, MED_PRE: 1680, FIT: 5200, SS_EE: 3658.00, MED_EE: 855.50, SIT: 3400, ER_401K: 3000 } }
    },
    {
      id: 'E2005', first: 'Denise', name: 'Denise Powell', title: 'Student Accounts Specialist',
      classification: 'Non-exempt', location: 'Homewood Campus, Baltimore, MD',
      // One small real difference: a Maryland withholding update raises state tax
      // ~$90/yr.
      sap:     { schedule: SEMI,   annual: { BASE: 41000, PRE_401K: 1230, MED_PRE: 1200, FIT: 3000, SS_EE: 2542.00, MED_EE: 594.50, SIT: 2600, ER_401K: 2460 } },
      workday: { schedule: WEEKLY, annual: { BASE: 41000, PRE_401K: 1230, MED_PRE: 1200, FIT: 3000, SS_EE: 2542.00, MED_EE: 594.50, SIT: 2690, ER_401K: 2460 } }
    },
    {
      id: 'E2006', first: 'Grace', name: 'Grace Liu', title: 'Grants & Contracts Analyst',
      classification: 'Exempt', location: 'Homewood Campus, Baltimore, MD',
      // Exempt control: schedule does NOT change (semi -> semi) and every amount
      // matches — the "nothing changes" path.
      sap:     { schedule: SEMI, annual: { BASE: 72000, PRE_401K: 5040, MED_PRE: 1980, FIT: 9600, SS_EE: 4464.00, MED_EE: 1044.00, SIT: 4900, ER_401K: 5040 } },
      workday: { schedule: SEMI, annual: { BASE: 72000, PRE_401K: 5040, MED_PRE: 1980, FIT: 9600, SS_EE: 4464.00, MED_EE: 1044.00, SIT: 4900, ER_401K: 5040 } }
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
      { date: 'Gap',    covers: '3–4 days',        type: 'gap',    label: 'Short gap — covered by the university' },
      { date: 'Jul 10', covers: 'week of Jun 29',  type: 'weekly', label: 'First weekly paycheck' },
      { date: 'Jul 17', covers: 'week of Jul 6',   type: 'weekly', label: 'Weekly paycheck' }
    ],
    coveredNote: 'There is a short 3–4 day gap between your last semi-monthly paycheck and your first weekly paycheck. Johns Hopkins is covering that gap, so you will not be short a paycheck during the switch.'
  };

  window.PAYDATA = { catalog: catalog, netSign: netSign, employees: employees, transition: transition };
})();
