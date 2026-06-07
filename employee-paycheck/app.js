/* ============================================================================
   app.js — Employee Paycheck Preview

   Turns parallel-run pay data into a simple, reassuring story for an employee:
   "here's your paycheck today, here's your paycheck in the new system, here's
   why the number looks different, and here's what stays the same."

   Classic script (no modules / no fetch) so it runs from a file:// URL.
   ========================================================================== */
(function () {
  'use strict';

  var D = window.PAYDATA;
  var state = { empId: D.employees[0].id, showDetail: false };

  // -------------------------------------------------------------------------
  // Money helpers — employees see clean, familiar formatting.
  // -------------------------------------------------------------------------
  function money(n) {
    return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function money0(n) {
    return '$' + Math.round(Number(n)).toLocaleString('en-US');
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function el(id) { return document.getElementById(id); }

  // -------------------------------------------------------------------------
  // Computation
  // -------------------------------------------------------------------------
  function systemSummary(sys) {
    var grossAnnual = 0, netAnnual = 0;
    Object.keys(sys.annual).forEach(function (code) {
      var amt = sys.annual[code];
      var sign = D.netSign(code);
      if (D.catalog[code] && D.catalog[code].group === 'in') grossAnnual += amt;
      netAnnual += amt * sign;
    });
    return {
      schedule: sys.schedule,
      grossAnnual: grossAnnual,
      netAnnual: netAnnual,
      netPerCheck: netAnnual / sys.schedule.perYear,
      grossPerCheck: grossAnnual / sys.schedule.perYear,
      netMonthly: netAnnual / 12
    };
  }

  function compare(emp) {
    var sap = systemSummary(emp.sap);
    var wd = systemSummary(emp.workday);
    var scheduleChanged = emp.sap.schedule.key !== emp.workday.schedule.key;
    var hasOT = !!(emp.sap.annual.OT || emp.workday.annual.OT);

    // Component-by-component on an ANNUAL basis (the only fair basis when the
    // number of paychecks differs).
    var codes = {};
    Object.keys(emp.sap.annual).forEach(function (c) { codes[c] = true; });
    Object.keys(emp.workday.annual).forEach(function (c) { codes[c] = true; });

    var lines = Object.keys(codes).map(function (code) {
      var info = D.catalog[code] || { group: 'in', label: code, plain: '' };
      var sa = emp.sap.annual[code] || 0;
      var wa = emp.workday.annual[code] || 0;
      var diff = wa - sa;
      return {
        code: code, group: info.group, label: info.label, plain: info.plain,
        isTax: !!info.isTax, varies: !!info.varies,
        sapAnnual: sa, wdAnnual: wa, diff: diff,
        changed: Math.abs(diff) >= 0.5,
        note: changeNote(code, info, diff, scheduleChanged)
      };
    });

    var netDiffAnnual = wd.netAnnual - sap.netAnnual;
    var materialChanges = lines.filter(function (l) { return l.changed && l.group !== 'employer'; });

    return {
      sap: sap, wd: wd, scheduleChanged: scheduleChanged, hasOT: hasOT,
      lines: lines, netDiffAnnual: netDiffAnnual,
      netDiffMonthly: netDiffAnnual / 12,
      materialChanges: materialChanges,
      isMaterial: Math.abs(netDiffAnnual) >= 24
    };
  }

  // Plain-language note for a single component.
  function changeNote(code, info, diff, scheduleChanged) {
    var a = Math.abs(diff);
    if (a < 0.5) {
      if ((info.group === 'in' || info.group === 'out') && scheduleChanged)
        return 'Same over the year — now spread across more paychecks, so each one is smaller.';
      return 'No change.';
    }
    var amt = money0(a);
    if (info.group === 'in') {
      return diff > 0 ? 'About ' + amt + ' more per year.' : 'About ' + amt + ' less per year.';
    }
    if (info.group === 'out') {
      var base = diff > 0 ? 'About ' + amt + ' more comes out per year.' : 'About ' + amt + ' less comes out per year.';
      if (info.isTax) base += ' This is how much is withheld, not how much you owe — you can update your tax elections anytime.';
      else if (code === 'MED_PRE') base += ' Your plan premium changed for the new plan year.';
      return base;
    }
    return '';
  }

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------
  function render() {
    var emp = D.employees.find(function (e) { return e.id === state.empId; });
    var c = compare(emp);
    renderSwitcher(emp);
    el('app').innerHTML = ''
      + renderIntro(emp, c)
      + renderHero(emp, c)
      + renderReassure(emp, c)
      + (c.scheduleChanged ? renderFrequency(emp, c) : '')
      + (c.scheduleChanged ? renderTransition() : '')
      + renderChanges(emp, c)
      + renderBreakdown(emp, c)
      + renderDisclaimer();
    wireDynamic();
  }

  function renderSwitcher(emp) {
    var opts = D.employees.map(function (e) {
      return '<option value="' + e.id + '"' + (e.id === emp.id ? ' selected' : '') + '>' + esc(e.name) + ' — ' + esc(e.classification) + '</option>';
    }).join('');
    el('whoSelect').innerHTML = opts;
  }

  function renderIntro(emp, c) {
    var headline, sub;
    if (c.scheduleChanged) {
      if (c.isMaterial) {
        headline = 'Your take-home pay will ' + (c.netDiffAnnual > 0 ? 'go up a little' : 'change a little') + ', and you\'ll be paid weekly.';
        sub = 'Today you\'re paid <b>twice a month</b>. In Workday you\'ll be paid <b>every week</b>. Here\'s what to expect.';
      } else {
        headline = 'Your take-home pay stays about the same — you\'ll just be paid every week.';
        sub = 'Today you\'re paid <b>twice a month</b> (24 paychecks a year). In Workday you\'ll be paid <b>every week</b> (52 paychecks a year). Each paycheck is smaller, but you get more than twice as many.';
      }
    } else {
      if (c.isMaterial || c.materialChanges.length) {
        headline = 'Your pay schedule isn\'t changing — and just one or two things are a little different.';
        sub = 'You\'ll still be paid <b>twice a month</b>. Here\'s a look at your pay in the new system.';
      } else {
        headline = 'Good news — nothing about your pay is changing.';
        sub = 'You\'ll still be paid <b>twice a month</b>, with the same take-home pay. Here it is in the new system, side by side.';
      }
    }
    return ''
      + '<section class="intro">'
      + '  <div class="hi">Hi ' + esc(emp.first) + ' 👋</div>'
      + '  <h2 class="headline">' + headline + '</h2>'
      + '  <p class="sub">' + sub + '</p>'
      + '</section>';
  }

  function renderHero(emp, c) {
    var otNote = c.hasOT ? '<div class="stub-note">Typical paycheck — overtime varies, so yours will move up or down with the hours you work.</div>' : '';
    function stub(title, sched, summ, tone) {
      return ''
        + '<div class="stub ' + tone + '">'
        + '  <div class="stub-top">' + title + '</div>'
        + '  <div class="stub-amt">' + money(summ.netPerCheck) + '</div>'
        + '  <div class="stub-label">take-home, each paycheck</div>'
        + '  <div class="stub-sched"><span class="cadence">' + sched.cadence + '</span><span class="peryear">' + sched.perYear + ' paychecks a year</span></div>'
        + '</div>';
    }
    var middle = c.scheduleChanged
      ? '<div class="hero-mid"><div class="hero-arrow">→</div><div class="hero-mid-note">smaller each time,<br>more than twice as often</div></div>'
      : '<div class="hero-mid"><div class="hero-arrow">→</div><div class="hero-mid-note">same schedule</div></div>';
    return ''
      + '<section class="hero">'
      + '  <div class="hero-grid">'
      + stub('Your paycheck today', emp.sap.schedule, c.sap, 'today')
      + middle
      + stub('Your paycheck in Workday', emp.workday.schedule, c.wd, 'future')
      + '  </div>'
      + otNote
      + '</section>';
  }

  function renderReassure(emp, c) {
    function row(label, sapVal, wdVal, sameText) {
      var diff = wdVal - sapVal;
      var same = Math.abs(diff) < 1;
      var tag = same
        ? '<span class="same-tag ok">About the same</span>'
        : '<span class="same-tag ' + (diff > 0 ? 'up' : 'down') + '">' + (diff > 0 ? '+' : '−') + money(Math.abs(diff)) + ' a ' + (label.indexOf('month') !== -1 ? 'month' : 'year') + '</span>';
      return ''
        + '<div class="reassure-row">'
        + '  <div class="reassure-label">' + label + '</div>'
        + '  <div class="reassure-vals">'
        + '    <div class="rv"><span class="rv-cap">today</span>' + money(sapVal) + '</div>'
        + '    <div class="rv-arrow">→</div>'
        + '    <div class="rv"><span class="rv-cap">Workday</span>' + money(wdVal) + '</div>'
        + '  </div>'
        + '  ' + tag
        + '</div>';
    }
    return ''
      + '<section class="card reassure">'
      + '  <h3 class="card-title">What really matters: your pay over time</h3>'
      + '  <p class="card-lead">A single weekly check is smaller, but the totals that you budget with barely move.</p>'
      + row('Over a month', c.sap.netMonthly, c.wd.netMonthly)
      + row('Over a year', c.sap.netAnnual, c.wd.netAnnual)
      + '</section>';
  }

  function renderFrequency(emp, c) {
    // Visual: count of checks in a month (2 big vs ~4-5 small), equal totals.
    var todayChecks = '<span class="chk big"></span><span class="chk big"></span>';
    var futureChecks = '<span class="chk sm"></span><span class="chk sm"></span><span class="chk sm"></span><span class="chk sm"></span><span class="chk sm"></span>';
    return ''
      + '<section class="card freq">'
      + '  <h3 class="card-title">Why is the new paycheck smaller?</h3>'
      + '  <p class="card-lead">Your yearly pay is the same — it\'s just divided into <b>more paychecks</b>. '
      + '  Twice-a-month means 24 checks a year. Weekly means 52. More checks, so each one is smaller.</p>'
      + '  <div class="chk-compare">'
      + '    <div class="chk-col"><div class="chk-cap">A month today</div><div class="chk-row">' + todayChecks + '</div><div class="chk-sub">2 bigger checks</div></div>'
      + '    <div class="chk-col"><div class="chk-cap">A month in Workday</div><div class="chk-row">' + futureChecks + '</div><div class="chk-sub">4–5 smaller checks</div></div>'
      + '  </div>'
      + '  <div class="freq-foot">Add them up and the month comes out the same.</div>'
      + '</section>';
  }

  function renderTransition() {
    var t = D.transition;
    var cells = t.events.map(function (ev) {
      if (ev.type === 'gap') {
        return '<div class="tl-cell gap"><div class="tl-dot">✓</div><div class="tl-date">' + esc(ev.date) + '</div><div class="tl-label">' + esc(ev.label) + '</div></div>';
      }
      return '<div class="tl-cell ' + ev.type + '"><div class="tl-dot"></div><div class="tl-date">' + esc(ev.date) + '</div>'
        + '<div class="tl-label">' + esc(ev.label) + '</div><div class="tl-covers">' + esc(ev.covers) + '</div></div>';
    }).join('<div class="tl-line"></div>');
    return ''
      + '<section class="card transition">'
      + '  <h3 class="card-title">When you\'ll get paid</h3>'
      + '  <p class="card-lead">In Workday you\'re paid <b>every Friday for the week you just worked</b> — about a ' + esc(t.lagDays) + ' delay between working and being paid. The switch happens ' + esc(t.switchPhrase) + '.</p>'
      + '  <div class="timeline">' + cells + '</div>'
      + '  <div class="covered">'
      + '    <div class="covered-icon">🛟</div>'
      + '    <div><b>You won\'t be short.</b> ' + esc(t.coveredNote) + '</div>'
      + '  </div>'
      + '</section>';
  }

  function renderChanges(emp, c) {
    if (!c.materialChanges.length) {
      var msg = c.scheduleChanged
        ? 'Every part of your pay is the same over the year — the only change is how often you\'re paid.'
        : 'Every part of your pay matches the new system. Nothing is changing.';
      return '<section class="card allsame"><div class="allsame-check">✓</div><div><b>No surprises.</b> ' + msg + '</div></section>';
    }
    var items = c.materialChanges.map(function (l) {
      return '<li><b>' + esc(l.label) + ':</b> ' + esc(l.note) + '</li>';
    }).join('');
    return ''
      + '<section class="card changes">'
      + '  <h3 class="card-title">What\'s a little different (and why)</h3>'
      + '  <ul class="changes-list">' + items + '</ul>'
      + '</section>';
  }

  function renderBreakdown(emp, c) {
    var open = state.showDetail;
    var body = '';
    if (open) {
      body = ''
        + '<p class="bd-basis">Because you get a different number of paychecks, these are compared <b>over a full year</b> — the fairest way to see what changed.</p>'
        + bdGroup('Money in', 'in', c)
        + bdGroup('Money out (taxes & deductions)', 'out', c)
        + bdEmployer(c)
        + bdTotal(c);
    }
    return ''
      + '<section class="card breakdown">'
      + '  <button class="bd-toggle" id="bdToggle">' + (open ? '▾ Hide the breakdown' : '▸ See the breakdown') + '</button>'
      + '  <div class="bd-body" style="' + (open ? '' : 'display:none') + '">' + body + '</div>'
      + '</section>';
  }

  function bdGroup(title, group, c) {
    var rows = c.lines.filter(function (l) { return l.group === group; });
    if (!rows.length) return '';
    rows.sort(function (a, b) { return b.wdAnnual - a.wdAnnual; });
    var html = '<div class="bd-group"><div class="bd-group-title">' + title + '</div><table class="bd-table"><thead><tr>'
      + '<th>What it is</th><th class="n">Today / yr</th><th class="n">Workday / yr</th><th>What changed</th></tr></thead><tbody>';
    rows.forEach(function (l) {
      var noteCls = l.changed ? 'changed' : 'same';
      html += '<tr>'
        + '<td><div class="bd-name">' + esc(l.label) + (l.varies ? ' <span class="bd-vary">varies</span>' : '') + '</div><div class="bd-plain">' + esc(l.plain) + '</div></td>'
        + '<td class="n">' + money0(l.sapAnnual) + '</td>'
        + '<td class="n">' + money0(l.wdAnnual) + '</td>'
        + '<td class="bd-note ' + noteCls + '">' + esc(l.note) + '</td>'
        + '</tr>';
    });
    return html + '</tbody></table></div>';
  }

  function bdEmployer(c) {
    var rows = c.lines.filter(function (l) { return l.group === 'employer'; });
    if (!rows.length) return '';
    var items = rows.map(function (l) {
      return '<div class="emp-row"><span>' + esc(l.label) + '</span><b>' + money0(l.wdAnnual) + ' / yr</b></div>'
        + '<div class="emp-plain">' + esc(l.plain) + '</div>';
    }).join('');
    return '<div class="bd-group employer"><div class="bd-group-title">From your employer (a bonus on top — not taken from your pay)</div>' + items + '</div>';
  }

  function bdTotal(c) {
    var diff = c.wd.netAnnual - c.sap.netAnnual;
    var same = Math.abs(diff) < 24;
    return ''
      + '<div class="bd-total">'
      + '  <div class="bd-total-row"><span>Your take-home over a year</span>'
      + '    <span class="bd-total-vals">' + money0(c.sap.netAnnual) + ' <span class="arr">→</span> ' + money0(c.wd.netAnnual) + '</span></div>'
      + '  <div class="bd-total-tag ' + (same ? 'ok' : (diff > 0 ? 'up' : 'down')) + '">'
      + (same ? 'About the same over the year' : (diff > 0 ? 'About ' + money0(Math.abs(diff)) + ' more per year' : 'About ' + money0(Math.abs(diff)) + ' less per year'))
      + '  </div>'
      + '</div>';
  }

  function renderDisclaimer() {
    return ''
      + '<footer class="disclaimer">'
      + '  These figures come from <b>test runs</b> of the new Workday system using your real pay information, to help you plan ahead. '
      + '  They are an estimate — your final pay may differ slightly, and overtime and benefit choices can change the numbers. '
      + '  Questions about your pay? Contact the Payroll team.'
      + '</footer>';
  }

  function wireDynamic() {
    var tgl = el('bdToggle');
    if (tgl) tgl.addEventListener('click', function () { state.showDetail = !state.showDetail; render(); });
  }

  // -------------------------------------------------------------------------
  // Boot
  // -------------------------------------------------------------------------
  document.addEventListener('DOMContentLoaded', function () {
    el('whoSelect').addEventListener('change', function (e) {
      state.empId = e.target.value;
      state.showDetail = false;
      window.scrollTo(0, 0);
      render();
    });
    render();
  });
})();
