/* ============================================================================
   app.js  —  Payroll Parallel-Run Comparison (SAP legacy → Workday future)

   Responsibilities:
     • hold the working data set (sample data by default, replaceable via CSV)
     • the comparison engine: pair components across systems, classify causes
     • render the selector, summary, reconciliation chart, cause chips,
       component table, and discrepancy breakdown
     • CSV import / export

   Runs as a classic script (no modules / no fetch) so index.html works from a
   file:// URL by double-clicking.
   ========================================================================== */
(function () {
  'use strict';

  // -------------------------------------------------------------------------
  // Working state.  `data` is a deep-ish copy of SAMPLE so importing CSV can
  // replace it and "Reset" can restore the sample.
  // -------------------------------------------------------------------------
  var data = null;            // { catalog, causeInfo, employees, periods, runs, runKey }
  var sel = { empId: null, periodId: null, causeFilter: null };

  var CATEGORY_ORDER = ['earning', 'pre_tax', 'tax', 'post_tax', 'employer'];
  var CATEGORY_LABEL = {
    earning: 'Earnings',
    pre_tax: 'Pre-Tax Deductions',
    tax: 'Taxes',
    post_tax: 'Post-Tax Deductions',
    employer: 'Employer Contributions'
  };
  // Sign of a component's effect on NET pay (employer items do not affect net).
  var NET_SIGN = { earning: 1, pre_tax: -1, tax: -1, post_tax: -1, employer: 0 };

  // =========================================================================
  // Formatting helpers
  // =========================================================================
  function money(n) {
    if (n == null || isNaN(n)) return '—';
    var sign = n < 0 ? '-' : '';
    return sign + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function signedMoney(n) {
    if (n == null || isNaN(n) || Math.abs(n) < 0.005) return '$0.00';
    return (n > 0 ? '+' : '−') + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function pct(part, whole) {
    if (!whole) return '—';
    return (part / whole * 100).toFixed(2) + '%';
  }
  function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function el(id) { return document.getElementById(id); }

  function catInfo(code) {
    return data.catalog[code] || { category: 'earning', sapCode: code, sapName: code, wdCode: code, wdName: code };
  }

  // =========================================================================
  // Data access
  // =========================================================================
  function periodsForEmployee(empId) {
    return data.periods.filter(function (p) {
      return data.runs[data.runKey(empId, p.id, 'SAP')] || data.runs[data.runKey(empId, p.id, 'Workday')];
    });
  }
  function runFor(empId, periodId, system) {
    return data.runs[data.runKey(empId, periodId, system)] || null;
  }
  function lineMap(list) {
    var m = {};
    (list || []).forEach(function (li) { m[li.code] = li; });
    return m;
  }

  // =========================================================================
  // Comparison engine
  // =========================================================================
  // Classify a single component pairing into a status + cause.
  function classify(code, sapLi, wdLi) {
    var category = catInfo(code).category;
    var hasSap = !!sapLi, hasWd = !!wdLi;

    if (hasSap && !hasWd) return { status: 'gap', cause: sapLi.retro ? 'RETRO' : 'MAPPING_GAP', side: 'sap_only' };
    if (!hasSap && hasWd) return { status: 'gap', cause: wdLi.retro ? 'RETRO' : 'MAPPING_GAP', side: 'wd_only' };

    var diff = round2(wdLi.amount - sapLi.amount);
    if (Math.abs(diff) < 0.005) return { status: 'match', cause: 'MATCH' };
    if (Math.abs(diff) <= 0.05) return { status: 'diff', cause: 'ROUNDING' };
    if (sapLi.workedDays != null && wdLi.workedDays != null && sapLi.workedDays !== wdLi.workedDays) {
      return { status: 'diff', cause: 'PRORATION' };
    }
    if (category === 'tax') return { status: 'diff', cause: 'TAX_CONFIG' };
    return { status: 'diff', cause: 'RATE_DIFF' };
  }

  // Build the full comparison object for the current selection.
  function buildComparison(empId, periodId) {
    var sap = lineMap(runFor(empId, periodId, 'SAP'));
    var wd = lineMap(runFor(empId, periodId, 'Workday'));

    var codes = {};
    Object.keys(sap).forEach(function (c) { codes[c] = true; });
    Object.keys(wd).forEach(function (c) { codes[c] = true; });

    var rows = Object.keys(codes).map(function (code) {
      var info = catInfo(code);
      var sapLi = sap[code] || null, wdLi = wd[code] || null;
      var cls = classify(code, sapLi, wdLi);
      var sapAmt = sapLi ? sapLi.amount : 0;
      var wdAmt = wdLi ? wdLi.amount : 0;
      var variance = round2(wdAmt - sapAmt);
      var netContribution = round2(variance * NET_SIGN[info.category]);
      return {
        code: code,
        category: info.category,
        sapDisplay: info.sapCode + ' · ' + info.sapName,
        wdDisplay: info.wdCode + ' · ' + info.wdName,
        sapAmt: sapLi ? sapAmt : null,
        wdAmt: wdLi ? wdAmt : null,
        variance: variance,
        netContribution: netContribution,
        status: cls.status,
        cause: cls.cause,
        side: cls.side || null,
        retro: (sapLi && sapLi.retro) || (wdLi && wdLi.retro) || false,
        proration: cls.cause === 'PRORATION' ? { sapDays: sapLi.workedDays, wdDays: wdLi.workedDays, periodDays: (sapLi.periodDays || wdLi.periodDays) } : null
      };
    });

    // Sort within category: discrepancies first (largest abs variance), then matches.
    rows.sort(function (a, b) {
      if (a.category !== b.category) return CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category);
      var am = a.status === 'match' ? 0 : 1, bm = b.status === 'match' ? 0 : 1;
      if (am !== bm) return bm - am;
      return Math.abs(b.variance) - Math.abs(a.variance);
    });

    // Totals
    function sumCat(rowsArr, sys) {
      var t = { earning: 0, pre_tax: 0, tax: 0, post_tax: 0, employer: 0 };
      rowsArr.forEach(function (r) {
        var amt = sys === 'sap' ? r.sapAmt : r.wdAmt;
        if (amt != null) t[r.category] += amt;
      });
      Object.keys(t).forEach(function (k) { t[k] = round2(t[k]); });
      return t;
    }
    function totals(catTotals) {
      var gross = catTotals.earning;
      var net = round2(gross - catTotals.pre_tax - catTotals.tax - catTotals.post_tax);
      return {
        gross: round2(gross),
        preTax: catTotals.pre_tax,
        tax: catTotals.tax,
        postTax: catTotals.post_tax,
        deductions: round2(catTotals.pre_tax + catTotals.tax + catTotals.post_tax),
        net: net,
        employer: catTotals.employer
      };
    }
    var sapTotals = totals(sumCat(rows, 'sap'));
    var wdTotals = totals(sumCat(rows, 'wd'));

    var discrepancies = rows.filter(function (r) { return r.status !== 'match'; });
    discrepancies.sort(function (a, b) { return Math.abs(b.variance) - Math.abs(a.variance); });

    // Cause tally (excluding MATCH)
    var causeTally = {};
    discrepancies.forEach(function (r) { causeTally[r.cause] = (causeTally[r.cause] || 0) + 1; });

    var netVariance = round2(wdTotals.net - sapTotals.net);
    var employerVariance = round2(wdTotals.employer - sapTotals.employer);

    return {
      rows: rows,
      discrepancies: discrepancies,
      causeTally: causeTally,
      sapTotals: sapTotals,
      wdTotals: wdTotals,
      netVariance: netVariance,
      employerVariance: employerVariance,
      componentCount: rows.length
    };
  }

  // =========================================================================
  // Rendering
  // =========================================================================
  function render() {
    var emp = data.employees.find(function (e) { return e.id === sel.empId; });
    var avail = periodsForEmployee(sel.empId);
    if (avail.length && !avail.some(function (p) { return p.id === sel.periodId; })) {
      sel.periodId = avail[0].id;
    }
    var period = data.periods.find(function (p) { return p.id === sel.periodId; });

    renderEmployeeCard(emp);
    if (!emp || !period) { el('results').innerHTML = ''; return; }

    var cmp = buildComparison(emp.id, period.id);
    renderTrend(emp, period);
    el('results').innerHTML = ''
      + renderRunHeader(emp, period, cmp)
      + renderSummary(cmp)
      + renderRecon(cmp)
      + renderCauseChips(cmp)
      + renderTable(cmp)
      + renderDiscrepancyPanel(cmp);
    wireResultEvents();
  }

  function renderEmployeeCard(emp) {
    var box = el('selectedEmp');
    if (!emp) { box.innerHTML = '<span class="muted">No employee selected</span>'; return; }
    box.innerHTML = ''
      + '<div class="emp-avatar">' + esc(initials(emp.name)) + '</div>'
      + '<div class="emp-meta">'
      + '  <div class="emp-name">' + esc(emp.name) + ' <span class="emp-id">' + esc(emp.id) + '</span></div>'
      + '  <div class="emp-sub">' + esc(emp.department) + ' · ' + esc(emp.location) + ' · ' + esc(emp.payGroup) + '</div>'
      + '</div>';
  }
  function initials(name) {
    return name.split(/\s+/).slice(0, 2).map(function (s) { return s[0]; }).join('').toUpperCase();
  }

  function renderTrend(emp, activePeriod) {
    var strip = el('trendStrip');
    var periods = periodsForEmployee(emp.id);
    strip.innerHTML = periods.map(function (p) {
      var cmp = buildComparison(emp.id, p.id);
      var v = cmp.netVariance;
      var cls = Math.abs(v) < 0.005 ? 'flat' : (v > 0 ? 'up' : 'down');
      var dCount = cmp.discrepancies.length;
      var active = p.id === activePeriod.id ? ' active' : '';
      return ''
        + '<button class="trend-cell' + active + '" data-period="' + p.id + '">'
        + '  <div class="trend-period">' + esc(p.label) + '</div>'
        + '  <div class="trend-var ' + cls + '">' + signedMoney(v) + '</div>'
        + '  <div class="trend-sub">' + (dCount ? dCount + ' discrepanc' + (dCount === 1 ? 'y' : 'ies') : 'reconciled') + '</div>'
        + '</button>';
    }).join('');
  }

  function renderRunHeader(emp, period, cmp) {
    var status = cmp.discrepancies.length === 0
      ? '<span class="pill pill-ok">✓ Fully reconciled</span>'
      : '<span class="pill pill-warn">' + cmp.discrepancies.length + ' discrepanc' + (cmp.discrepancies.length === 1 ? 'y' : 'ies') + '</span>';
    return ''
      + '<div class="run-header">'
      + '  <div>'
      + '    <div class="run-title">Pay run comparison — ' + esc(period.label) + '</div>'
      + '    <div class="run-sub">Pay period ' + esc(period.start) + ' → ' + esc(period.end) + ' · Pay date ' + esc(period.payDate)
      + '      · <span class="sys-tag sap">SAP</span> legacy vs <span class="sys-tag wd">Workday</span> future</div>'
      + '  </div>'
      + '  <div>' + status + '</div>'
      + '</div>';
  }

  function renderSummary(cmp) {
    var net = cmp.netVariance;
    var netCls = Math.abs(net) < 0.005 ? 'flat' : (net > 0 ? 'up' : 'down');
    var largest = cmp.discrepancies[0];
    var grossVar = round2(cmp.wdTotals.gross - cmp.sapTotals.gross);

    function card(label, sapVal, wdVal, variance, opts) {
      opts = opts || {};
      var vCls = Math.abs(variance) < 0.005 ? 'flat' : (variance > 0 ? 'up' : 'down');
      return ''
        + '<div class="sum-card">'
        + '  <div class="sum-label">' + label + '</div>'
        + '  <div class="sum-rows">'
        + '    <div><span class="sys-tag sap">SAP</span><span class="sum-amt">' + money(sapVal) + '</span></div>'
        + '    <div><span class="sys-tag wd">WD</span><span class="sum-amt">' + money(wdVal) + '</span></div>'
        + '  </div>'
        + '  <div class="sum-var ' + vCls + '">' + signedMoney(variance) + (opts.pct ? ' <span class="sum-pct">(' + opts.pct + ')</span>' : '') + '</div>'
        + '</div>';
    }

    return ''
      + '<section class="summary-grid">'
      + card('Gross Pay', cmp.sapTotals.gross, cmp.wdTotals.gross, grossVar, { pct: pct(grossVar, cmp.sapTotals.gross) })
      + card('Total Deductions & Tax', cmp.sapTotals.deductions, cmp.wdTotals.deductions, round2(cmp.wdTotals.deductions - cmp.sapTotals.deductions))
      + ''
      + '<div class="sum-card sum-net ' + netCls + '">'
      + '  <div class="sum-label">Net Pay</div>'
      + '  <div class="sum-rows">'
      + '    <div><span class="sys-tag sap">SAP</span><span class="sum-amt">' + money(cmp.sapTotals.net) + '</span></div>'
      + '    <div><span class="sys-tag wd">WD</span><span class="sum-amt">' + money(cmp.wdTotals.net) + '</span></div>'
      + '  </div>'
      + '  <div class="sum-var ' + netCls + ' big">' + signedMoney(net) + ' <span class="sum-pct">(' + pct(net, cmp.sapTotals.net) + ')</span></div>'
      + '</div>'
      + card('Employer Cost', cmp.sapTotals.employer, cmp.wdTotals.employer, cmp.employerVariance)
      + ''
      + '<div class="sum-card sum-stat">'
      + '  <div class="sum-label">Diagnosis</div>'
      + '  <div class="stat-line"><span>Components compared</span><b>' + cmp.componentCount + '</b></div>'
      + '  <div class="stat-line"><span>Discrepancies</span><b>' + cmp.discrepancies.length + '</b></div>'
      + '  <div class="stat-line"><span>Largest line variance</span><b>' + (largest ? signedMoney(largest.variance) : '—') + '</b></div>'
      + '</div>'
      + '</section>';
  }

  // Reconciliation chart: side-by-side bars per metric, scaled to the largest gross.
  function renderRecon(cmp) {
    var metrics = [
      { key: 'gross', label: 'Gross' },
      { key: 'deductions', label: 'Deductions & Tax' },
      { key: 'net', label: 'Net' },
      { key: 'employer', label: 'Employer Cost' }
    ];
    var max = Math.max(cmp.sapTotals.gross, cmp.wdTotals.gross, 1);
    var bars = metrics.map(function (m) {
      var s = cmp.sapTotals[m.key], w = cmp.wdTotals[m.key];
      var v = round2(w - s);
      var vCls = Math.abs(v) < 0.005 ? 'flat' : (v > 0 ? 'up' : 'down');
      return ''
        + '<div class="recon-row">'
        + '  <div class="recon-label">' + m.label + '</div>'
        + '  <div class="recon-bars">'
        + '    <div class="bar-track"><div class="bar sap" style="width:' + (s / max * 100) + '%"></div><span class="bar-val">' + money(s) + '</span></div>'
        + '    <div class="bar-track"><div class="bar wd" style="width:' + (w / max * 100) + '%"></div><span class="bar-val">' + money(w) + '</span></div>'
        + '  </div>'
        + '  <div class="recon-var ' + vCls + '">' + signedMoney(v) + '</div>'
        + '</div>';
    }).join('');
    return ''
      + '<section class="panel">'
      + '  <h2 class="panel-title">Reconciliation overview</h2>'
      + '  <div class="recon-legend"><span class="sys-tag sap">SAP</span> legacy &nbsp; <span class="sys-tag wd">Workday</span> future</div>'
      + '  <div class="recon">' + bars + '</div>'
      + '</section>';
  }

  function renderCauseChips(cmp) {
    var causes = Object.keys(cmp.causeTally);
    if (!causes.length) {
      return '<section class="panel"><div class="all-clear">✓ Every component reconciles between SAP and Workday for this pay run.</div></section>';
    }
    causes.sort(function (a, b) { return cmp.causeTally[b] - cmp.causeTally[a]; });
    var chips = causes.map(function (c) {
      var info = data.causeInfo[c];
      var active = sel.causeFilter === c ? ' active' : '';
      return '<button class="chip tone-' + info.tone + active + '" data-cause="' + c + '">'
        + '<span class="chip-count">' + cmp.causeTally[c] + '</span>' + esc(info.label) + '</button>';
    }).join('');
    var clear = sel.causeFilter ? '<button class="chip chip-clear" data-cause="">✕ clear filter</button>' : '';
    return ''
      + '<section class="panel">'
      + '  <h2 class="panel-title">Discrepancies by cause <span class="panel-hint">click to filter the table below</span></h2>'
      + '  <div class="chips">' + chips + clear + '</div>'
      + '</section>';
  }

  function statusBadge(row) {
    if (row.status === 'match') return '<span class="badge badge-ok">Match</span>';
    var info = data.causeInfo[row.cause];
    var extra = '';
    if (row.status === 'gap') {
      extra = row.side === 'sap_only' ? ' <span class="gap-note">missing in Workday</span>' : ' <span class="gap-note">missing in SAP</span>';
    }
    return '<span class="badge tone-' + info.tone + '" title="' + esc(info.explain) + '">' + esc(info.label) + '</span>' + extra;
  }

  function renderTable(cmp) {
    var rows = cmp.rows;
    if (sel.causeFilter) rows = rows.filter(function (r) { return r.cause === sel.causeFilter; });

    var html = ''
      + '<section class="panel">'
      + '  <h2 class="panel-title">Component-level comparison'
      + (sel.causeFilter ? ' <span class="panel-hint">filtered: ' + esc(data.causeInfo[sel.causeFilter].label) + '</span>' : '')
      + '  </h2>'
      + '  <table class="cmp-table">'
      + '    <thead><tr>'
      + '      <th class="c-comp">Pay component</th>'
      + '      <th class="c-num">SAP (legacy)</th>'
      + '      <th class="c-num">Workday (future)</th>'
      + '      <th class="c-num">Variance</th>'
      + '      <th class="c-num">Net impact</th>'
      + '      <th class="c-cause">Status / likely cause</th>'
      + '    </tr></thead><tbody>';

    CATEGORY_ORDER.forEach(function (cat) {
      var catRows = rows.filter(function (r) { return r.category === cat; });
      if (!catRows.length) return;
      // subtotal across full (unfiltered) rows for the category
      var fullCat = cmp.rows.filter(function (r) { return r.category === cat; });
      var sapSub = round2(fullCat.reduce(function (a, r) { return a + (r.sapAmt || 0); }, 0));
      var wdSub = round2(fullCat.reduce(function (a, r) { return a + (r.wdAmt || 0); }, 0));
      var subVar = round2(wdSub - sapSub);

      html += '<tr class="cat-head"><td colspan="6">' + CATEGORY_LABEL[cat] + '</td></tr>';
      catRows.forEach(function (r) {
        var rowCls = r.status === 'match' ? 'row-match' : (r.status === 'gap' ? 'row-gap' : 'row-diff');
        var vCls = Math.abs(r.variance) < 0.005 ? 'flat' : (r.variance > 0 ? 'up' : 'down');
        var nCls = Math.abs(r.netContribution) < 0.005 ? 'flat' : (r.netContribution > 0 ? 'up' : 'down');
        html += ''
          + '<tr class="' + rowCls + '">'
          + '  <td class="c-comp"><div class="comp-name">' + esc(catInfo(r.code).sapName) + '</div>'
          + '      <div class="comp-codes"><span class="sys-tag sap">SAP</span>' + esc(catInfo(r.code).sapCode)
          + '         <span class="sys-tag wd">WD</span>' + esc(catInfo(r.code).wdCode) + '</div></td>'
          + '  <td class="c-num">' + (r.sapAmt == null ? '<span class="absent">absent</span>' : money(r.sapAmt)) + '</td>'
          + '  <td class="c-num">' + (r.wdAmt == null ? '<span class="absent">absent</span>' : money(r.wdAmt)) + '</td>'
          + '  <td class="c-num ' + vCls + '">' + (r.status === 'match' ? '—' : signedMoney(r.variance)) + '</td>'
          + '  <td class="c-num ' + nCls + '">' + (r.category === 'employer' ? '<span class="muted">n/a</span>' : (r.status === 'match' ? '—' : signedMoney(r.netContribution))) + '</td>'
          + '  <td class="c-cause">' + statusBadge(r) + '</td>'
          + '</tr>';
      });
      html += ''
        + '<tr class="cat-sub">'
        + '  <td class="c-comp">Subtotal — ' + CATEGORY_LABEL[cat] + '</td>'
        + '  <td class="c-num">' + money(sapSub) + '</td>'
        + '  <td class="c-num">' + money(wdSub) + '</td>'
        + '  <td class="c-num ' + (Math.abs(subVar) < 0.005 ? 'flat' : (subVar > 0 ? 'up' : 'down')) + '">' + signedMoney(subVar) + '</td>'
        + '  <td></td><td></td>'
        + '</tr>';
    });

    // Grand totals
    html += ''
      + '<tr class="grand"><td class="c-comp">NET PAY</td>'
      + '  <td class="c-num">' + money(cmp.sapTotals.net) + '</td>'
      + '  <td class="c-num">' + money(cmp.wdTotals.net) + '</td>'
      + '  <td class="c-num ' + (Math.abs(cmp.netVariance) < 0.005 ? 'flat' : (cmp.netVariance > 0 ? 'up' : 'down')) + '">' + signedMoney(cmp.netVariance) + '</td>'
      + '  <td></td><td></td></tr>';

    html += '</tbody></table></section>';
    return html;
  }

  function renderDiscrepancyPanel(cmp) {
    if (!cmp.discrepancies.length) return '';
    var items = cmp.discrepancies.map(function (r, i) {
      var info = data.causeInfo[r.cause];
      var ci = catInfo(r.code);
      var detail = '';
      if (r.cause === 'PRORATION' && r.proration) {
        detail = 'SAP paid ' + r.proration.sapDays + ' / ' + r.proration.periodDays + ' days; Workday paid ' + r.proration.wdDays + ' / ' + r.proration.periodDays + ' days.';
      } else if (r.status === 'gap') {
        detail = 'Present only in ' + (r.side === 'sap_only' ? 'SAP (' + money(r.sapAmt) + ')' : 'Workday (' + money(r.wdAmt) + ')') + '.';
      } else {
        detail = 'SAP ' + money(r.sapAmt) + ' vs Workday ' + money(r.wdAmt) + ' = ' + signedMoney(r.variance) + '.';
      }
      var netTxt = r.category === 'employer'
        ? 'Affects employer cost, not net pay.'
        : 'Net pay impact: ' + signedMoney(r.netContribution) + '.';
      return ''
        + '<div class="disc-item tone-' + info.tone + '">'
        + '  <div class="disc-rank">' + (i + 1) + '</div>'
        + '  <div class="disc-body">'
        + '    <div class="disc-head"><span class="disc-comp">' + esc(ci.sapName) + '</span>'
        + '      <span class="badge tone-' + info.tone + '">' + esc(info.label) + '</span>'
        + '      <span class="disc-amt ' + (r.variance > 0 ? 'up' : 'down') + '">' + signedMoney(r.variance) + '</span></div>'
        + '    <div class="disc-detail">' + esc(detail) + ' ' + esc(netTxt) + '</div>'
        + '    <div class="disc-why"><b>Why:</b> ' + esc(info.explain) + '</div>'
        + '    <div class="disc-action"><b>Investigate:</b> ' + esc(info.action) + '</div>'
        + '  </div>'
        + '</div>';
    }).join('');
    return ''
      + '<section class="panel">'
      + '  <h2 class="panel-title">Discrepancy breakdown <span class="panel-hint">ranked by size of variance</span></h2>'
      + '  <div class="disc-list">' + items + '</div>'
      + '</section>';
  }

  // =========================================================================
  // Selector / search behaviour
  // =========================================================================
  function renderEmployeeResults(query) {
    var box = el('empResults');
    var q = (query || '').trim().toLowerCase();
    var list = data.employees.filter(function (e) {
      if (!q) return true;
      return (e.id + ' ' + e.name + ' ' + e.department + ' ' + e.location).toLowerCase().indexOf(q) !== -1;
    });
    if (!list.length) { box.innerHTML = '<div class="result-empty">No employees match “' + esc(query) + '”</div>'; box.classList.add('open'); return; }
    box.innerHTML = list.map(function (e) {
      var active = e.id === sel.empId ? ' active' : '';
      return '<button class="result-row' + active + '" data-emp="' + e.id + '">'
        + '<span class="result-avatar">' + esc(initials(e.name)) + '</span>'
        + '<span class="result-meta"><b>' + esc(e.name) + '</b> <span class="result-id">' + esc(e.id) + '</span>'
        + '<span class="result-sub">' + esc(e.department) + ' · ' + esc(e.location) + '</span></span></button>';
    }).join('');
    box.classList.add('open');
  }

  function wireResultEvents() {
    // Trend cells (period selection)
    Array.prototype.forEach.call(document.querySelectorAll('.trend-cell'), function (b) {
      b.addEventListener('click', function () { sel.periodId = b.getAttribute('data-period'); render(); });
    });
    // Cause chips (filter)
    Array.prototype.forEach.call(document.querySelectorAll('.chip[data-cause]'), function (b) {
      b.addEventListener('click', function () {
        var c = b.getAttribute('data-cause');
        sel.causeFilter = (c === '' || c === sel.causeFilter) ? null : c;
        render();
      });
    });
  }

  function wireSelector() {
    var input = el('empSearch');
    input.addEventListener('focus', function () { renderEmployeeResults(input.value); });
    input.addEventListener('input', function () { renderEmployeeResults(input.value); });
    document.addEventListener('click', function (e) {
      if (!el('empPicker').contains(e.target)) el('empResults').classList.remove('open');
    });
    el('empResults').addEventListener('click', function (e) {
      var row = e.target.closest('.result-row');
      if (!row) return;
      sel.empId = row.getAttribute('data-emp');
      sel.causeFilter = null;
      var avail = periodsForEmployee(sel.empId);
      sel.periodId = avail.length ? avail[0].id : null;
      input.value = '';
      el('empResults').classList.remove('open');
      render();
    });
  }

  // =========================================================================
  // CSV import / export
  // =========================================================================
  var CSV_COLS = ['system', 'employee_id', 'employee_name', 'department', 'location', 'pay_group',
    'period_id', 'period_label', 'period_start', 'period_end', 'pay_date', 'period_days',
    'component_code', 'component_name', 'category', 'amount', 'retro', 'worked_days'];

  function exportCsv() {
    var lines = [CSV_COLS.join(',')];
    data.employees.forEach(function (emp) {
      data.periods.forEach(function (p) {
        ['SAP', 'Workday'].forEach(function (sys) {
          var run = runFor(emp.id, p.id, sys);
          if (!run) return;
          run.forEach(function (li) {
            var info = catInfo(li.code);
            var row = [sys, emp.id, emp.name, emp.department, emp.location, emp.payGroup,
              p.id, p.label, p.start, p.end, p.payDate, p.days,
              li.code, info.sapName, info.category, li.amount,
              li.retro ? 'Y' : '', (li.workedDays == null ? '' : li.workedDays)];
            lines.push(row.map(csvCell).join(','));
          });
        });
      });
    });
    download('payroll-comparison-data.csv', lines.join('\n'));
  }

  function csvCell(v) {
    v = (v == null ? '' : String(v));
    return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }

  function parseCsv(text) {
    var rows = [], row = [], field = '', inQ = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (inQ) {
        if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
        else field += c;
      } else {
        if (c === '"') inQ = true;
        else if (c === ',') { row.push(field); field = ''; }
        else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(field); field = ''; rows.push(row); row = []; }
        else field += c;
      }
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    return rows.filter(function (r) { return r.length > 1 || (r.length === 1 && r[0].trim() !== ''); });
  }

  function importCsv(text) {
    var rows = parseCsv(text);
    if (!rows.length) throw new Error('Empty file');
    var header = rows[0].map(function (h) { return h.trim().toLowerCase(); });
    function idx(name) { return header.indexOf(name); }
    if (idx('system') === -1 || idx('employee_id') === -1 || idx('component_code') === -1 || idx('amount') === -1) {
      throw new Error('Missing required columns. Expected at least: system, employee_id, period_id, component_code, category, amount.');
    }

    var newData = {
      catalog: JSON.parse(JSON.stringify(window.SAMPLE.catalog)), // start from known catalog, extend as needed
      causeInfo: window.SAMPLE.causeInfo,
      employees: [], periods: [], runs: {}, runKey: window.SAMPLE.runKey
    };
    var empSeen = {}, periodSeen = {};

    function val(r, name) { var k = idx(name); return k === -1 ? '' : (r[k] || '').trim(); }

    for (var i = 1; i < rows.length; i++) {
      var r = rows[i];
      var sys = val(r, 'system');
      sys = /work/i.test(sys) ? 'Workday' : (/sap/i.test(sys) ? 'SAP' : sys);
      var empId = val(r, 'employee_id');
      var periodId = val(r, 'period_id');
      var code = val(r, 'component_code');
      if (!sys || !empId || !periodId || !code) continue;

      if (!empSeen[empId]) {
        empSeen[empId] = true;
        newData.employees.push({
          id: empId, name: val(r, 'employee_name') || empId,
          department: val(r, 'department'), location: val(r, 'location'), payGroup: val(r, 'pay_group')
        });
      }
      if (!periodSeen[periodId]) {
        periodSeen[periodId] = true;
        newData.periods.push({
          id: periodId, label: val(r, 'period_label') || periodId,
          start: val(r, 'period_start'), end: val(r, 'period_end'),
          payDate: val(r, 'pay_date'), days: Number(val(r, 'period_days')) || null
        });
      }
      // Extend catalog for unknown components
      if (!newData.catalog[code]) {
        var cat = val(r, 'category') || 'earning';
        var nm = val(r, 'component_name') || code;
        newData.catalog[code] = { category: cat, sapCode: code, sapName: nm, wdCode: code, wdName: nm };
      }
      var key = newData.runKey(empId, periodId, sys);
      if (!newData.runs[key]) newData.runs[key] = [];
      var wd = val(r, 'worked_days');
      newData.runs[key].push({
        code: code,
        amount: round2(Number(val(r, 'amount')) || 0),
        retro: /^(y|yes|true|1)$/i.test(val(r, 'retro')),
        workedDays: wd === '' ? null : Number(wd),
        periodDays: Number(val(r, 'period_days')) || null
      });
    }

    if (!newData.employees.length) throw new Error('No employee rows found.');
    // Sort periods by id for stable display
    newData.periods.sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
    return newData;
  }

  function download(filename, content) {
    var blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function setData(d, sourceLabel) {
    data = d;
    sel.empId = data.employees[0] ? data.employees[0].id : null;
    var avail = sel.empId ? periodsForEmployee(sel.empId) : [];
    sel.periodId = avail.length ? avail[0].id : null;
    sel.causeFilter = null;
    el('dataSource').textContent = sourceLabel;
    render();
  }

  function loadSample() {
    var fresh = {
      catalog: window.SAMPLE.catalog,
      causeInfo: window.SAMPLE.causeInfo,
      employees: window.SAMPLE.employees,
      periods: window.SAMPLE.periods,
      runs: window.SAMPLE.runs,
      runKey: window.SAMPLE.runKey
    };
    setData(fresh, 'Sample data (8 employees · 4 pay periods)');
  }

  // =========================================================================
  // Toolbar wiring
  // =========================================================================
  function wireToolbar() {
    el('btnExport').addEventListener('click', exportCsv);
    el('btnReset').addEventListener('click', loadSample);
    el('btnHelp').addEventListener('click', function () { el('helpModal').classList.add('open'); });
    el('helpClose').addEventListener('click', function () { el('helpModal').classList.remove('open'); });
    el('helpModal').addEventListener('click', function (e) { if (e.target === el('helpModal')) el('helpModal').classList.remove('open'); });

    var fileInput = el('fileInput');
    el('btnImport').addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', function () {
      var f = fileInput.files[0];
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var nd = importCsv(String(reader.result));
          setData(nd, 'Imported: ' + f.name + ' (' + nd.employees.length + ' employees · ' + nd.periods.length + ' periods)');
          flash('Loaded ' + nd.employees.length + ' employees from ' + f.name, 'ok');
        } catch (err) {
          flash('Import failed: ' + err.message, 'err');
        }
        fileInput.value = '';
      };
      reader.readAsText(f);
    });
  }

  function flash(msg, tone) {
    var t = el('toast');
    t.textContent = msg;
    t.className = 'toast show ' + (tone || '');
    setTimeout(function () { t.className = 'toast'; }, 4000);
  }

  // =========================================================================
  // Boot
  // =========================================================================
  document.addEventListener('DOMContentLoaded', function () {
    wireSelector();
    wireToolbar();
    loadSample();
  });
})();
