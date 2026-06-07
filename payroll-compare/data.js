/* ============================================================================
   data.js  —  Sample data + reference metadata for the Payroll Parallel-Run
   Comparison tool (SAP legacy  →  Workday future).

   This file is intentionally self-contained so the app runs by double-clicking
   index.html (no server, no build step). It exposes a single global, SAMPLE,
   shaped exactly like a real loaded data set would be:

      SAMPLE.catalog    component reference  (code -> category, SAP/WD codes+names)
      SAMPLE.causeInfo  discrepancy-cause reference (how to read / how to fix)
      SAMPLE.employees  [{id,name,department,location,payGroup}]
      SAMPLE.periods    [{id,label,start,end,payDate,days}]
      SAMPLE.runs       { "<emp>||<period>||<system>": [lineItem, ...] }

   A lineItem is the minimal unit stored per system:
      { code, amount, retro?, workedDays?, periodDays }
   Category + display names are looked up from the catalog at render time, so
   imported CSV data (which may carry components outside this catalog) works the
   same way — the importer just extends the catalog.
   ========================================================================== */

(function () {
  'use strict';

  // ---- Component reference catalog ----------------------------------------
  // category: earning | pre_tax | tax | post_tax | employer
  // Net pay  = earnings − pre_tax − tax − post_tax.  Employer items do not
  // affect net pay; they are tracked as employer cost.
  const catalog = {
    BASE:       { category: 'earning',  sapCode: '1000', sapName: 'Base Salary',          wdCode: 'SALARY',   wdName: 'Salary' },
    OT:         { category: 'earning',  sapCode: '1010', sapName: 'Overtime',             wdCode: 'OT',       wdName: 'Overtime' },
    BONUS:      { category: 'earning',  sapCode: '1020', sapName: 'Bonus',                wdCode: 'BONUS',    wdName: 'Bonus' },
    COMMISSION: { category: 'earning',  sapCode: '1030', sapName: 'Commission',           wdCode: 'COMM',     wdName: 'Commission' },
    RETRO:      { category: 'earning',  sapCode: '1900', sapName: 'Retroactive Pay',      wdCode: 'RETRO',    wdName: 'Retroactive Pay' },

    PRE_401K:   { category: 'pre_tax',  sapCode: '2000', sapName: '401(k) Pre-Tax EE',    wdCode: '401K_EE',  wdName: '401(k) Employee' },
    HSA:        { category: 'pre_tax',  sapCode: '2010', sapName: 'HSA Employee',         wdCode: 'HSA_EE',   wdName: 'HSA Employee' },
    MED_PRE:    { category: 'pre_tax',  sapCode: '2020', sapName: 'Medical Pre-Tax',      wdCode: 'MED_PRE',  wdName: 'Medical Pre-Tax' },

    FIT:        { category: 'tax',      sapCode: '3000', sapName: 'Federal Income Tax',   wdCode: 'FED_WH',   wdName: 'Federal Withholding' },
    SS_EE:      { category: 'tax',      sapCode: '3010', sapName: 'Social Security EE',   wdCode: 'OASDI_EE', wdName: 'OASDI Employee' },
    MED_EE:     { category: 'tax',      sapCode: '3020', sapName: 'Medicare EE',          wdCode: 'MEDCR_EE', wdName: 'Medicare Employee' },
    SIT:        { category: 'tax',      sapCode: '3030', sapName: 'State Income Tax',     wdCode: 'STATE_WH', wdName: 'State Withholding' },

    ROTH:       { category: 'post_tax', sapCode: '4000', sapName: 'Roth 401(k)',         wdCode: 'ROTH',     wdName: 'Roth 401(k)' },
    GARNISH:    { category: 'post_tax', sapCode: '4010', sapName: 'Garnishment',         wdCode: 'GARN',     wdName: 'Garnishment' },
    LIFE:       { category: 'post_tax', sapCode: '4020', sapName: 'Voluntary Life',      wdCode: 'VOL_LIFE', wdName: 'Voluntary Life' },

    ER_401K:    { category: 'employer', sapCode: '5000', sapName: '401(k) ER Match',     wdCode: '401K_ER',  wdName: '401(k) Employer Match' },
    ER_PENSION: { category: 'employer', sapCode: '5010', sapName: 'Employer Pension',    wdCode: 'ER_PENS',  wdName: 'Employer Pension' },
    ER_SS:      { category: 'employer', sapCode: '5020', sapName: 'Social Security ER',  wdCode: 'OASDI_ER', wdName: 'OASDI Employer' }
  };

  // ---- Discrepancy-cause reference ----------------------------------------
  const causeInfo = {
    MATCH: {
      label: 'Match', tone: 'ok',
      explain: 'Both systems agree on this component.',
      action: 'No action needed.'
    },
    ROUNDING: {
      label: 'Rounding difference', tone: 'low',
      explain: 'The two systems agree to within a few cents. Usually caused by different rounding rules (per-component vs. per-total) or precision settings.',
      action: 'Confirm the Workday rounding rule on the pay component matches SAP. Low priority unless it accumulates across many employees.'
    },
    RATE_DIFF: {
      label: 'Rate / amount difference', tone: 'high',
      explain: 'The same pay component carries a materially different value in each system. Typically a rate, salary, FTE, or calculation-formula that was updated in one system but not the other.',
      action: 'Compare the effective-dated rate / pay-component configuration in Workday against the corresponding SAP wage type and infotype. Check the effective date of the change.'
    },
    TAX_CONFIG: {
      label: 'Tax configuration difference', tone: 'high',
      explain: 'A tax withholding amount differs beyond rounding. Common when tax authority setup, filing status, allowances, taxable-wage base, or tax tables differ between systems.',
      action: 'Reconcile the employee tax elections and the tax authority / taxable-wage configuration in Workday against SAP. Verify the taxable gross feeding the calculation is identical first.'
    },
    MAPPING_GAP: {
      label: 'Wage-type mapping gap', tone: 'high',
      explain: 'This component exists in one system but has no counterpart in the other — almost always an unmapped SAP wage type or a Workday pay component that was never configured.',
      action: 'Check the wage type → pay component mapping. A missing post-tax deduction (e.g. garnishment) or employer contribution can be a compliance risk, not just a variance.'
    },
    PRORATION: {
      label: 'Proration difference', tone: 'high',
      explain: 'The amount differs because the two systems prorated for a different number of worked / paid days — common for mid-period hires, terminations, or unpaid leave.',
      action: 'Compare the worked-days / proration factor used by each system. Verify the hire/termination date and work schedule loaded into Workday.'
    },
    RETRO: {
      label: 'Retroactive adjustment', tone: 'med',
      explain: 'A retroactive pay line is present in one system only. Retro results are expected to differ during parallel runs because retro recalculation windows and trigger events rarely line up exactly.',
      action: 'Confirm the retro trigger (e.g. backdated salary change) and the recalculation period. Decide whether the retro should be in scope for this comparison or excluded.'
    }
  };

  // ---- Periods (monthly, 2026) --------------------------------------------
  const periods = [
    { id: '2026-01', label: 'January 2026',  start: '2026-01-01', end: '2026-01-31', payDate: '2026-01-30', days: 31 },
    { id: '2026-02', label: 'February 2026', start: '2026-02-01', end: '2026-02-28', payDate: '2026-02-27', days: 28 },
    { id: '2026-03', label: 'March 2026',    start: '2026-03-01', end: '2026-03-31', payDate: '2026-03-31', days: 31 },
    { id: '2026-04', label: 'April 2026',    start: '2026-04-01', end: '2026-04-30', payDate: '2026-04-30', days: 30 }
  ];

  // ---- Employee specifications --------------------------------------------
  // base  = the SAP "truth": code -> amount.  Workday starts as a copy of base.
  // ops   = mutations applied to the Workday side (and occasionally SAP) to
  //         model real parallel-run discrepancies. The comparison engine
  //         derives the *cause* purely from the resulting numbers + flags, so
  //         these ops are only a data generator, not a hint to the engine.
  //
  //   op kinds:
  //     set_wd     set the Workday amount for a code (adds it if absent)
  //     set_sap    set the SAP amount for a code
  //     remove_wd  drop a code from the Workday side (mapping gap)
  //     remove_sap drop a code from the SAP side
  //   optional: periods:[...] limits an op to specific period ids,
  //             retro:true / workedDays:n attach signals to the line.
  const employeeSpecs = [
    {
      id: 'E1001', name: 'Sarah Chen', department: 'Engineering', location: 'New York, NY', payGroup: 'US Salaried Monthly',
      base: { BASE: 9375.00, PRE_401K: 750.00, MED_PRE: 210.00, FIT: 1650.00, SS_EE: 581.25, MED_EE: 135.94, SIT: 562.50, ROTH: 300.00, ER_401K: 468.75, ER_SS: 581.25 },
      ops: [
        { op: 'set_wd', code: 'BASE',   amount: 9656.25 },  // 3% merit live in WD, not yet in SAP -> RATE_DIFF
        { op: 'set_wd', code: 'MED_EE', amount: 135.91 }     // few cents -> ROUNDING
      ]
    },
    {
      id: 'E1002', name: 'Marcus Johnson', department: 'Sales', location: 'Austin, TX', payGroup: 'US Salaried Monthly',
      base: { BASE: 7083.33, COMMISSION: 2500.00, PRE_401K: 425.00, MED_PRE: 195.00, FIT: 1480.00, SS_EE: 594.17, MED_EE: 138.96, SIT: 478.00, ER_401K: 354.17, ER_SS: 594.17 },
      ops: [
        { op: 'remove_wd', code: 'COMMISSION' },             // commission wage type unmapped -> MAPPING_GAP
        { op: 'set_wd',    code: 'FIT', amount: 1402.00 }     // federal w/h differs -> TAX_CONFIG
      ]
    },
    {
      id: 'E1003', name: 'Priya Patel', department: 'Engineering', location: 'San Jose, CA', payGroup: 'US Salaried Monthly',
      base: { BASE: 10416.67, PRE_401K: 1041.67, MED_PRE: 220.00, FIT: 1875.00, SS_EE: 645.83, MED_EE: 151.04, SIT: 729.17, ER_401K: 520.83, ER_SS: 645.83 },
      ops: [
        { op: 'set_wd', code: 'SS_EE', amount: 645.85 }       // 2 cents -> ROUNDING (otherwise a clean match)
      ]
    },
    {
      id: 'E1004', name: 'David Kim', department: 'Operations', location: 'Chicago, IL', payGroup: 'US Hourly Monthly',
      base: { BASE: 4333.33, OT: 650.00, PRE_401K: 250.00, MED_PRE: 165.00, FIT: 720.00, SS_EE: 309.07, MED_EE: 72.28, SIT: 245.00, ER_SS: 309.07 },
      ops: [
        { op: 'set_wd', code: 'OT', amount: 780.00 },        // OT multiplier applied to wrong base -> RATE_DIFF
        // Mid-period hire on 2026-01-12: SAP did not prorate (bug), Workday did.
        { op: 'set_sap', code: 'BASE', amount: 4333.33, workedDays: 31, periods: ['2026-01'] },
        { op: 'set_wd',  code: 'BASE', amount: 1957.00, workedDays: 14, periods: ['2026-01'] }  // -> PRORATION
      ]
    },
    {
      id: 'E1005', name: 'Emma Wilson', department: 'Marketing', location: 'New York, NY', payGroup: 'US Salaried Monthly',
      base: { BASE: 7916.67, PRE_401K: 475.00, MED_PRE: 200.00, FIT: 1320.00, SS_EE: 490.83, MED_EE: 114.79, SIT: 553.00, ER_PENSION: 395.83, ER_SS: 490.83 },
      ops: [
        { op: 'set_wd', code: 'ER_PENSION', amount: 435.42 }, // pension formula differs -> RATE_DIFF (employer cost)
        // Backdated merit processed as retro in Workday for March only.
        { op: 'set_wd', code: 'RETRO', amount: 1187.50, retro: true, periods: ['2026-03'] } // -> RETRO
      ]
    },
    {
      id: 'E1006', name: 'James Brown', department: 'Finance', location: 'Charlotte, NC', payGroup: 'US Salaried Monthly',
      base: { BASE: 8750.00, PRE_401K: 700.00, MED_PRE: 205.00, FIT: 1560.00, SS_EE: 542.50, MED_EE: 126.88, SIT: 612.50, ER_401K: 437.50, ER_SS: 542.50 },
      ops: []  // fully reconciled — control case
    },
    {
      id: 'E1007', name: 'Olivia Martinez', department: 'Human Resources', location: 'Seattle, WA', payGroup: 'US Salaried Monthly',
      base: { BASE: 6666.67, HSA: 300.00, PRE_401K: 400.00, MED_PRE: 175.00, FIT: 1050.00, SS_EE: 413.33, MED_EE: 96.67, SIT: 380.00, ER_401K: 333.33, ER_SS: 413.33 },
      ops: [
        { op: 'remove_wd', code: 'HSA' },                    // HSA pre-tax not mapped -> MAPPING_GAP
        { op: 'set_wd', code: 'SIT', amount: 415.00 }        // WA has no SIT in WD setup mismatch -> TAX_CONFIG
      ]
    },
    {
      id: 'E1008', name: "Liam O'Connor", department: 'Engineering', location: 'Boston, MA', payGroup: 'US Salaried Monthly',
      base: { BASE: 9166.67, PRE_401K: 916.67, MED_PRE: 215.00, FIT: 1700.00, SS_EE: 568.33, MED_EE: 132.92, SIT: 641.67, GARNISH: 450.00, ER_401K: 458.33, ER_SS: 568.33 },
      ops: [
        { op: 'set_wd',    code: 'BASE',    amount: 8937.50 }, // location stipend dropped -> RATE_DIFF
        { op: 'remove_wd', code: 'GARNISH' },                  // garnishment not configured -> MAPPING_GAP (compliance)
        { op: 'set_wd',    code: 'ER_401K', amount: 446.88 }   // match formula differs -> RATE_DIFF (employer cost)
      ]
    }
  ];

  // ---- Generation ---------------------------------------------------------
  function runKey(empId, periodId, system) { return empId + '||' + periodId + '||' + system; }

  function mapToLineItems(map) {
    return Object.keys(map).map(function (code) {
      const v = map[code];
      return {
        code: code,
        amount: round2(v.amount),
        retro: !!v.retro,
        workedDays: (v.workedDays == null ? null : v.workedDays),
        periodDays: (v.periodDays == null ? null : v.periodDays)
      };
    });
  }

  function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }

  function applyOp(op, sap, wd, period) {
    if (op.periods && op.periods.indexOf(period.id) === -1) return;
    const line = { amount: op.amount, retro: op.retro, workedDays: op.workedDays, periodDays: period.days };
    switch (op.op) {
      case 'set_wd':     wd[op.code]  = line; break;
      case 'set_sap':    sap[op.code] = line; break;
      case 'remove_wd':  delete wd[op.code];  break;
      case 'remove_sap': delete sap[op.code]; break;
      default: console.warn('Unknown op', op.op);
    }
  }

  function buildRuns() {
    const runs = {};
    employeeSpecs.forEach(function (emp) {
      periods.forEach(function (period) {
        const sap = {}, wd = {};
        Object.keys(emp.base).forEach(function (code) {
          sap[code] = { amount: emp.base[code], periodDays: period.days };
          wd[code]  = { amount: emp.base[code], periodDays: period.days };
        });
        (emp.ops || []).forEach(function (op) { applyOp(op, sap, wd, period); });
        runs[runKey(emp.id, period.id, 'SAP')]     = mapToLineItems(sap);
        runs[runKey(emp.id, period.id, 'Workday')] = mapToLineItems(wd);
      });
    });
    return runs;
  }

  const employees = employeeSpecs.map(function (e) {
    return { id: e.id, name: e.name, department: e.department, location: e.location, payGroup: e.payGroup };
  });

  // ---- Expose -------------------------------------------------------------
  window.SAMPLE = {
    catalog: catalog,
    causeInfo: causeInfo,
    employees: employees,
    periods: periods,
    runs: buildRuns(),
    runKey: runKey
  };
})();
