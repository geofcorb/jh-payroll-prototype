/* ============================================================================
   app.js — Employee Paycheck Preview (Johns Hopkins University)

   Turns parallel-run pay data into a simple, reassuring story for an employee:
   "here's your paycheck today, here's your paycheck in the new system, here's
   why the number looks different, and here's what stays the same."

   Also provides an administrative REVIEW MODE (toggle, top-right): the same page
   an employee sees, plus explicit payroll detail (exact figures, per-check
   columns, SAP↔Workday variance, wage-type mapping gaps) and per-employee
   discrepancy tracking — flag lines, set a review status, and leave notes.
   Review state is saved on the device (localStorage) and can be exported to CSV.

   Classic script (no modules / no fetch) so it runs from a file:// URL.
   ========================================================================== */
(function () {
  'use strict';

  var D = window.PAYDATA;
  var state = { empId: D.employees[0].id, showDetail: false, reviewMode: false };

  // -------------------------------------------------------------------------
  // Money helpers — employees see clean, familiar formatting.
  // -------------------------------------------------------------------------
  function money(n) {
    return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function money0(n) {
    return '$' + Math.round(Number(n)).toLocaleString('en-US');
  }
  function signedMoney(n) {
    var s = n > 0 ? '+' : (n < 0 ? '−' : '');
    return s + '$' + Math.abs(Number(n)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function el(id) { return document.getElementById(id); }

  // -------------------------------------------------------------------------
  // Review state — persisted on the device. Never leaves the page.
  // -------------------------------------------------------------------------
  var REVIEW_KEY = 'jhu-paycheck-review-v1';
  var reviews = loadReviews();

  function loadReviews() {
    try {
      var raw = window.localStorage.getItem(REVIEW_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  }
  function saveReviews() {
    try { window.localStorage.setItem(REVIEW_KEY, JSON.stringify(reviews)); } catch (e) { /* private mode / file:// — keep in memory */ }
  }
  function getReview(id) {
    var r = reviews[id];
    if (!r) r = reviews[id] = { status: 'unreviewed', flags: {}, notes: '' };
    if (!r.flags) r.flags = {};
    if (!r.notes) r.notes = '';
    if (!r.status) r.status = 'unreviewed';
    return r;
  }
  function hasFlags(r) { return Object.keys(r.flags).some(function (k) { return r.flags[k]; }); }
  function flaggedCodes(r) { return Object.keys(r.flags).filter(function (k) { return r.flags[k]; }); }
  function statusLabel(s) { return s === 'reviewed' ? 'Reviewed' : (s === 'followup' ? 'Needs follow-up' : 'Unreviewed'); }

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
      var hasSap = Object.prototype.hasOwnProperty.call(emp.sap.annual, code);
      var hasWd = Object.prototype.hasOwnProperty.call(emp.workday.annual, code);
      return {
        code: code, group: info.group, label: info.label, plain: info.plain,
        isTax: !!info.isTax, varies: !!info.varies,
        sapAnnual: sa, wdAnnual: wa, diff: diff,
        changed: Math.abs(diff) >= 0.5,
        oneSided: hasSap !== hasWd,         // wage-type mapping gap
        onlyIn: hasSap && !hasWd ? 'SAP' : (!hasSap && hasWd ? 'Workday' : null),
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
    syncReviewChrome();
    el('app').innerHTML = ''
      + (state.reviewMode ? renderReviewRoster(emp) : '')
      + (state.reviewMode ? renderReviewCard(emp, c) : '')
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

  // Keep the toggle button, banner, and body class in sync with state.
  function syncReviewChrome() {
    document.body.classList.toggle('review-on', state.reviewMode);
    var btn = el('reviewToggle');
    if (btn) {
      btn.classList.toggle('on', state.reviewMode);
      btn.setAttribute('aria-pressed', state.reviewMode ? 'true' : 'false');
      btn.textContent = state.reviewMode ? 'Exit review mode' : 'Review mode';
    }
    var banner = el('reviewBanner');
    if (banner) banner.hidden = !state.reviewMode;
  }

  function renderSwitcher(emp) {
    var opts = D.employees.map(function (e) {
      var mark = '';
      if (state.reviewMode) {
        var r = getReview(e.id);
        mark = r.status === 'reviewed' ? ' ✓' : (r.status === 'followup' ? ' ⚑' : '');
      }
      return '<option value="' + e.id + '"' + (e.id === emp.id ? ' selected' : '') + '>' + esc(e.name) + ' — ' + esc(e.classification) + mark + '</option>';
    }).join('');
    el('whoSelect').innerHTML = opts;
  }

  // ---- Review: roster of all employees with status ------------------------
  function renderReviewRoster(emp) {
    var reviewed = 0, followup = 0, flagged = 0;
    D.employees.forEach(function (e) {
      var r = getReview(e.id);
      if (r.status === 'reviewed') reviewed++;
      if (r.status === 'followup') followup++;
      if (hasFlags(r)) flagged++;
    });
    var chips = D.employees.map(function (e) {
      var r = getReview(e.id);
      var n = flaggedCodes(r).length;
      var badge = n ? '<span class="rc-badge">' + n + '</span>' : '';
      return '<button type="button" class="roster-chip ' + r.status + (e.id === emp.id ? ' active' : '') + '" data-id="' + e.id + '">'
        + '<span class="rc-dot" aria-hidden="true"></span>'
        + '<span class="rc-name">' + esc(e.name) + '</span>' + badge
        + '</button>';
    }).join('');
    return ''
      + '<section class="card review-roster">'
      + '  <div class="rr-head">'
      + '    <div class="rr-title">Review progress</div>'
      + '    <div class="rr-stats">'
      + '      <span class="rr-stat"><b>' + reviewed + '</b> of ' + D.employees.length + ' reviewed</span>'
      + '      <span class="rr-stat">' + followup + ' need follow-up</span>'
      + '      <span class="rr-stat">' + flagged + ' with flags</span>'
      + '    </div>'
      + '  </div>'
      + '  <div class="roster-chips">' + chips + '</div>'
      + '</section>';
  }

  // ---- Review: per-employee discrepancy tracking -------------------------
  function renderReviewCard(emp, c) {
    var r = getReview(emp.id);
    var diffs = c.lines.filter(function (l) { return (l.changed || l.oneSided) && l.group !== 'employer'; });

    var pills = ['unreviewed', 'reviewed', 'followup'].map(function (s) {
      return '<button type="button" class="rv-pill ' + s + (r.status === s ? ' active' : '') + '" data-status="' + s + '">' + esc(statusLabel(s)) + '</button>';
    }).join('');

    var detected;
    if (!diffs.length) {
      detected = '<div class="rd-none">No SAP&#8596;Workday differences detected for this employee. Pay components match over the year'
        + (c.scheduleChanged ? ' — the only change is the pay frequency.' : '.') + '</div>';
    } else {
      detected = '<div class="rd-list">' + diffs.map(function (l) {
        var on = !!r.flags[l.code];
        var sapPer = l.sapAnnual / c.sap.schedule.perYear;
        var wdPer = l.wdAnnual / c.wd.schedule.perYear;
        var deltaCls = l.diff > 0 ? 'up' : (l.diff < 0 ? 'down' : 'zero');
        var deltaTxt = l.oneSided
          ? '<span class="rd-gap">Mapping gap — appears in ' + esc(l.onlyIn) + ' only</span>'
          : '<span class="rd-delta ' + deltaCls + '">' + signedMoney(l.diff) + ' / yr</span>';
        return '<label class="rd-item' + (on ? ' on' : '') + '">'
          + '<input type="checkbox" class="flagchk" data-code="' + l.code + '"' + (on ? ' checked' : '') + ' />'
          + '<span class="rd-main"><span class="rd-label">' + esc(l.label) + '</span> ' + deltaTxt + '</span>'
          + '<span class="rd-per">SAP ' + money(sapPer) + ' &rarr; WD ' + money(wdPer) + ' / check</span>'
          + '</label>';
      }).join('') + '</div>';
    }

    var flags = flaggedCodes(r);
    var flagSummary = flags.length
      ? '<div class="rc-flagged"><b>Flagged as discrepancy:</b> ' + flags.map(function (code) { return esc((D.catalog[code] && D.catalog[code].label) || code); }).join(', ') + '</div>'
      : '<div class="rc-flagged none">No discrepancies flagged yet.</div>';

    var netCls = Math.abs(c.netDiffAnnual) < 0.5 ? 'zero' : (c.netDiffAnnual > 0 ? 'up' : 'down');

    return ''
      + '<section class="card review-card">'
      + '  <div class="rc-head">'
      + '    <div>'
      + '      <div class="rc-name-line">' + esc(emp.name) + ' <span class="rc-id">' + esc(emp.id) + '</span></div>'
      + '      <div class="rc-meta">' + esc(emp.title) + ' · ' + esc(emp.classification) + ' · ' + esc(emp.location) + '</div>'
      + '    </div>'
      + '    <div class="rc-net ' + netCls + '">Net variance <b>' + signedMoney(c.netDiffAnnual) + '</b> / yr</div>'
      + '  </div>'
      + '  <div class="rc-status"><span class="rc-status-lab">Review status</span><div class="rv-pills">' + pills + '</div></div>'
      + '  <div class="rc-section-lab">Detected differences (' + diffs.length + ') — check to flag as a discrepancy</div>'
      + detected
      + '  ' + flagSummary
      + '  <label class="rc-notes-lab" for="reviewNotes">Reviewer notes</label>'
      + '  <textarea id="reviewNotes" class="rc-notes" rows="3" placeholder="Notes / discrepancies for this employee…">' + esc(r.notes) + '</textarea>'
      + '  <div class="rc-saved" id="rcSaved">Saved on this device</div>'
      + '</section>';
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

  // ---- Breakdown: employee (collapsible) vs review (always-open detail) ---
  function renderBreakdown(emp, c) {
    if (state.reviewMode) return renderBreakdownReview(emp, c);
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
    return '<div class="bd-group employer"><div class="bd-group-title">From the university (a bonus on top — not taken from your pay)</div>' + items + '</div>';
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

  // ---- Breakdown: REVIEW (explicit detail + flagging) --------------------
  function renderBreakdownReview(emp, c) {
    return ''
      + '<section class="card breakdown review-bd">'
      + '  <h3 class="card-title">Full breakdown — SAP vs Workday <span class="bd-review-tag">review detail</span></h3>'
      + '  <p class="bd-basis">Exact annual figures with per-check amounts and variance (Workday − SAP). '
      + 'Compared over a full year so the schedule change doesn\'t distort the picture. Check <b>Flag</b> on any line to record a discrepancy.</p>'
      + bdGroupReview('Money in', 'in', c, emp)
      + bdGroupReview('Money out (taxes & deductions)', 'out', c, emp)
      + bdGroupReview('Employer contributions', 'employer', c, emp)
      + bdTotalReview(c)
      + '</section>';
  }

  function bdGroupReview(title, group, c, emp) {
    var rows = c.lines.filter(function (l) { return l.group === group; });
    if (!rows.length) return '';
    rows.sort(function (a, b) { return b.wdAnnual - a.wdAnnual; });
    var r = getReview(emp.id);
    var sapPY = c.sap.schedule.perYear, wdPY = c.wd.schedule.perYear;
    var html = '<div class="bd-group"><div class="bd-group-title">' + title + '</div>'
      + '<table class="bd-table bd-table-review"><thead><tr>'
      + '<th>Component</th><th class="n">SAP / yr</th><th class="n">WD / yr</th><th class="n">Δ / yr</th>'
      + '<th class="n">SAP / chk</th><th class="n">WD / chk</th>'
      + (group === 'employer' ? '' : '<th class="c">Flag</th>')
      + '</tr></thead><tbody>';
    rows.forEach(function (l) {
      var on = !!r.flags[l.code];
      var dCls = Math.abs(l.diff) < 0.5 ? 'zero' : (l.diff > 0 ? 'up' : 'down');
      var gapTag = l.oneSided ? ' <span class="bd-gap-tag">' + esc(l.onlyIn) + ' only</span>' : '';
      html += '<tr class="' + (on ? 'flagged ' : '') + (l.oneSided ? 'gap-row' : '') + '">'
        + '<td><div class="bd-name"><span class="bd-code">' + esc(l.code) + '</span> ' + esc(l.label) + (l.varies ? ' <span class="bd-vary">varies</span>' : '') + gapTag + '</div></td>'
        + '<td class="n">' + money(l.sapAnnual) + '</td>'
        + '<td class="n">' + money(l.wdAnnual) + '</td>'
        + '<td class="n bd-delta ' + dCls + '">' + (Math.abs(l.diff) < 0.005 ? '—' : signedMoney(l.diff)) + '</td>'
        + '<td class="n">' + money(l.sapAnnual / sapPY) + '</td>'
        + '<td class="n">' + money(l.wdAnnual / wdPY) + '</td>'
        + (group === 'employer' ? '' : '<td class="c"><input type="checkbox" class="flagchk" data-code="' + l.code + '"' + (on ? ' checked' : '') + ' aria-label="Flag ' + esc(l.label) + '" /></td>')
        + '</tr>';
    });
    return html + '</tbody></table></div>';
  }

  function bdTotalReview(c) {
    return ''
      + '<div class="bd-total review">'
      + '  <table class="bd-table bd-table-review bd-total-table"><tbody>'
      + '    <tr><td><b>Gross / yr</b></td><td class="n">' + money(c.sap.grossAnnual) + '</td><td class="n">' + money(c.wd.grossAnnual) + '</td>'
      + '      <td class="n bd-delta ' + deltaClass(c.wd.grossAnnual - c.sap.grossAnnual) + '">' + signedMoney(c.wd.grossAnnual - c.sap.grossAnnual) + '</td>'
      + '      <td class="n">' + money(c.sap.grossPerCheck) + '</td><td class="n">' + money(c.wd.grossPerCheck) + '</td></tr>'
      + '    <tr><td><b>Net take-home / yr</b></td><td class="n">' + money(c.sap.netAnnual) + '</td><td class="n">' + money(c.wd.netAnnual) + '</td>'
      + '      <td class="n bd-delta ' + deltaClass(c.netDiffAnnual) + '">' + signedMoney(c.netDiffAnnual) + '</td>'
      + '      <td class="n">' + money(c.sap.netPerCheck) + '</td><td class="n">' + money(c.wd.netPerCheck) + '</td></tr>'
      + '  </tbody></table>'
      + '</div>';
  }

  function deltaClass(d) { return Math.abs(d) < 0.5 ? 'zero' : (d > 0 ? 'up' : 'down'); }

  function renderDisclaimer() {
    return ''
      + '<footer class="disclaimer">'
      + '  These figures come from <b>test runs</b> of the new Workday system using your real pay information, to help you plan ahead. '
      + '  They are an estimate — your final pay may differ slightly, and overtime and benefit choices can change the numbers. '
      + '  Questions about your pay? Contact the Johns Hopkins Payroll Shared Services team.'
      + '</footer>';
  }

  // -------------------------------------------------------------------------
  // Dynamic wiring (re-run after every render)
  // -------------------------------------------------------------------------
  function wireDynamic() {
    var tgl = el('bdToggle');
    if (tgl) tgl.addEventListener('click', function () { state.showDetail = !state.showDetail; render(); });

    if (!state.reviewMode) return;

    // Roster chips → switch employee
    Array.prototype.forEach.call(document.querySelectorAll('.roster-chip'), function (chip) {
      chip.addEventListener('click', function () { switchEmployee(chip.getAttribute('data-id')); });
    });

    // Status pills
    Array.prototype.forEach.call(document.querySelectorAll('.rv-pill'), function (pill) {
      pill.addEventListener('click', function () {
        getReview(state.empId).status = pill.getAttribute('data-status');
        saveReviews();
        render();
      });
    });

    // Flag checkboxes (in the detected list AND the detail table)
    Array.prototype.forEach.call(document.querySelectorAll('.flagchk'), function (box) {
      box.addEventListener('change', function () {
        getReview(state.empId).flags[box.getAttribute('data-code')] = box.checked;
        saveReviews();
        render();
      });
    });

    // Notes — persist without re-rendering (so the field keeps focus)
    var notes = el('reviewNotes');
    if (notes) {
      notes.addEventListener('input', function () {
        getReview(state.empId).notes = notes.value;
        saveReviews();
        var saved = el('rcSaved');
        if (saved) { saved.textContent = 'Saved ✓'; saved.classList.add('flash'); }
      });
    }
  }

  function switchEmployee(id) {
    state.empId = id;
    state.showDetail = false;
    window.scrollTo(0, 0);
    render();
  }

  // -------------------------------------------------------------------------
  // CSV export of all review notes
  // -------------------------------------------------------------------------
  function csvCell(s) {
    s = String(s == null ? '' : s);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function exportReviewCsv() {
    var headers = ['Employee ID', 'Name', 'Title', 'Classification', 'Location', 'Review status', 'Schedule change', 'Net variance (annual, WD-SAP)', 'Flagged components', 'Notes'];
    var lines = [headers.map(csvCell).join(',')];
    D.employees.forEach(function (emp) {
      var c = compare(emp);
      var r = getReview(emp.id);
      var flagged = flaggedCodes(r).map(function (code) { return (D.catalog[code] && D.catalog[code].label) || code; }).join('; ');
      lines.push([
        emp.id, emp.name, emp.title, emp.classification, emp.location,
        statusLabel(r.status),
        c.scheduleChanged ? (emp.sap.schedule.name + ' -> ' + emp.workday.schedule.name) : 'No change',
        (c.netDiffAnnual >= 0 ? '+' : '') + c.netDiffAnnual.toFixed(2),
        flagged, r.notes
      ].map(csvCell).join(','));
    });
    download('jhu-paycheck-review.csv', lines.join('\r\n'));
  }
  function download(name, text) {
    try {
      var blob = new Blob([text], { type: 'text/csv;charset=utf-8;' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 0);
    } catch (e) {
      window.prompt('Copy the CSV below:', text);
    }
  }

  // -------------------------------------------------------------------------
  // Boot
  // -------------------------------------------------------------------------
  document.addEventListener('DOMContentLoaded', function () {
    el('whoSelect').addEventListener('change', function (e) { switchEmployee(e.target.value); });

    var rt = el('reviewToggle');
    if (rt) rt.addEventListener('click', function () { state.reviewMode = !state.reviewMode; window.scrollTo(0, 0); render(); });

    var rx = el('reviewExport');
    if (rx) rx.addEventListener('click', exportReviewCsv);

    render();
  });
})();
