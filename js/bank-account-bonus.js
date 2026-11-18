/*
  Bank Account Bonus page script
  ------------------------------
  Reads the data files and draws the page into the fixed containers in
  bank-account-bonus.html. Nothing here holds account content: to change what the
  page says, edit the data files (see data/README.md).

    data/banks.json      bank accounts and their current sign-up bonuses
    data/referrals.json  Arthur's referral links, matched to accounts by id

  It follows the Credit Card Bonus page closely and reuses its styles (.ccb-*, .cc-*).

  Sections below:
    1. State and settings
    2. Helpers: formatting and DOM building
    3. Calculations: tiers, what a visitor can earn, ranking
    4. Drawing: intro, checker, chart, account list
    5. Controls: toggles and checker
    6. Start-up
*/

(function () {
  'use strict';

  /* ─── 1. State and settings ─── */

  var SVG_NS = 'http://www.w3.org/2000/svg';

  // Loaded data, filled once at start-up.
  var data = {
    accounts: [],          // banks.json "accounts"
    referralByAccount: {}  // account id -> referral link
  };

  // Checker questions per tab. Business accounts never ask for direct deposit.
  var QUESTIONS = {
    personal: ['dd', 'cash', 'had'],
    business: ['cash', 'had']
  };

  // What the visitor has chosen. Kept in memory only, never saved.
  // An answer is null until its question is answered.
  var state = {
    segment: 'personal',
    type: 'all',      // 'all' | 'checking' | 'savings'
    step: 0,          // checker: 0 not started, 1..n the question shown, n + 1 finished
    dd: null,         // dollars a month arriving by direct deposit
    cash: null,       // dollars they could leave in a new account for a few months
    had: {},          // bank names they have used recently
    onlyFits: true    // after the checker: hide accounts that don't fit
  };

  /* ─── 2. Helpers: formatting and DOM building ─── */

  function fmtInt(n) {
    return Math.round(n).toLocaleString('en-US');
  }

  function fmtUsd(n) {
    return '$' + fmtInt(n);
  }

  // "2026-12-03" -> Date at midnight UTC, so dates never shift with the time zone.
  function parseDay(s) {
    return new Date(s + 'T00:00:00Z');
  }

  function fmtDay(s, withYear) {
    var opts = { month: 'short', day: 'numeric', timeZone: 'UTC' };
    if (withYear) opts.year = 'numeric';
    return parseDay(s).toLocaleDateString('en-US', opts);
  }

  // Whole days from today (local calendar date) until a YYYY-MM-DD date.
  function daysUntil(s) {
    var now = new Date();
    var today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((parseDay(s).getTime() - today) / 86400000);
  }

  function plural(n, one, many) {
    return n === 1 ? one : many;
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function svgEl(tag, attrs) {
    var node = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs || {}).forEach(function (key) {
      node.setAttribute(key, attrs[key]);
    });
    return node;
  }

  // Replace a node's contents with a mix of strings and nodes.
  function fill(node, parts) {
    node.textContent = '';
    parts.forEach(function (part) {
      node.appendChild(typeof part === 'string' ? document.createTextNode(part) : part);
    });
  }

  function bold(text) {
    return el('b', null, text);
  }

  function loadJson(url) {
    return fetch(url, { cache: 'no-cache' }).then(function (res) {
      if (!res.ok) throw new Error(url + ' returned ' + res.status);
      return res.json();
    });
  }

  // Small floating tooltip inside `box` (position: relative), near (x, y).
  function showTip(box, lines, x, y) {
    var tip = box.querySelector('.ccb-tip');
    if (!tip) {
      tip = el('div', 'ccb-tip');
      box.appendChild(tip);
    }
    fill(tip, lines.map(function (line, i) {
      return i === 0 ? bold(line) : el('span', null, line);
    }));
    tip.hidden = false;
    var left = x + 14;
    if (left + tip.offsetWidth > box.clientWidth) left = Math.max(0, x - tip.offsetWidth - 14);
    var top = y - tip.offsetHeight - 10;
    if (top < 0) top = y + 16;
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
  }

  function hideTip(box) {
    var tip = box.querySelector('.ccb-tip');
    if (tip) tip.hidden = true;
  }

  // A small rounded label, reusing the site's .cc-badge colors.
  function chip(text, tone) {
    return el('span', 'cc-badge ' + tone, text);
  }

  /* ─── 3. Calculations ─── */

  function isDirectDeposit(a) {
    return a.requirement === 'direct_deposit';
  }

  // Tiers smallest first; the last one is the top bonus.
  function tiersOf(a) {
    return (a.tiers || []).slice().sort(function (x, y) { return x.need - y.need; });
  }

  function topTier(a) {
    var tiers = tiersOf(a);
    return tiers[tiers.length - 1];
  }

  // "35,000 points" for points bonuses, "$900" for cash.
  function bonusText(a, tier) {
    if (a.points > 0 && a.cpp > 0) return fmtInt(Math.round((tier.bonus * 100) / a.cpp)) + ' points';
    return fmtUsd(tier.bonus);
  }

  // "$10,000 in direct deposits" or "$25,000 deposit".
  function needText(a, tier) {
    return fmtUsd(tier.need) + (isDirectDeposit(a) ? ' in direct deposits' : ' deposit');
  }

  /*
    A deposit bonus is like interest on money you park: the bonus as a yearly rate
    on the deposit, for the days the money has to stay in the account.
  */
  function yearlyRate(a, tier) {
    if (isDirectDeposit(a) || !a.hold_days || !tier.need) return 0;
    return (100 * tier.bonus / tier.need) * (365 / a.hold_days);
  }

  /*
    How much the visitor can bring to this account, from their answers:
    direct deposit is the monthly amount over the bonus window; a deposit bonus
    uses the cash they could leave in the account. null before that question.
  */
  function available(a) {
    if (isDirectDeposit(a)) return state.dd === null ? null : (state.dd * a.days) / 30;
    return state.cash;
  }

  /*
    Apply the visitor's answers to one account. Returns:
      blocked   true when they have used this bank recently
      answered  true once the question this account depends on is answered
      tier      the biggest tier they can reach, or null
      fits      false when an answer rules the account out
  */
  function checkFit(a) {
    var blocked = Boolean(state.had[a.bank]);
    var amount = available(a);
    var tier = null;
    if (amount !== null) {
      tiersOf(a).forEach(function (t) { if (t.need <= amount) tier = t; });
    }
    return {
      blocked: blocked,
      answered: amount !== null,
      tier: tier,
      fits: !blocked && (amount === null || tier !== null)
    };
  }

  function quizDone() {
    return state.step === QUESTIONS[state.segment].length + 1;
  }

  // True once the visitor has answered at least one checker question.
  function answeredAny() {
    return state.dd !== null || state.cash !== null || Object.keys(state.had).length > 0;
  }

  // Accounts in the current tab (all types), used for the bank list in the checker.
  function segmentAccounts() {
    return data.accounts.filter(function (a) { return a.segment === state.segment; });
  }

  function typesInSegment() {
    var seen = {};
    segmentAccounts().forEach(function (a) { seen[a.type] = true; });
    return Object.keys(seen);
  }

  /*
    Accounts shown in the list and chart: current tab and type, ranked by the top
    bonus. After the checker, the bonus the visitor can actually reach comes first.
  */
  function visibleRows() {
    var rows = segmentAccounts().filter(function (a) {
      return state.type === 'all' || a.type === state.type;
    }).map(function (a) {
      var fit = checkFit(a);
      return { a: a, fit: fit, top: topTier(a), earned: fit.fits && fit.tier ? fit.tier.bonus : 0 };
    });
    rows.sort(function (x, y) {
      if (quizDone()) return y.earned - x.earned || y.top.bonus - x.top.bonus;
      return y.top.bonus - x.top.bonus;
    });
    rows.forEach(function (r, i) { r.rank = i + 1; });
    return rows;
  }

  // account id -> referral url, from every group in referrals.json.
  function referralMap(referrals) {
    var map = {};
    (referrals.groups || []).forEach(function (group) {
      (group.items || []).forEach(function (item) {
        (item.account_ids || []).forEach(function (id) {
          if (item.url) map[id] = item.url;
        });
      });
    });
    return map;
  }

  /* ─── 4. Drawing ─── */

  // Intro sentence: account counts and the biggest bonus of each kind.
  function drawIntro() {
    function best(list) {
      return list.slice().sort(function (x, y) { return topTier(y).bonus - topTier(x).bonus; })[0];
    }
    var personal = data.accounts.filter(function (a) { return a.segment === 'personal'; });
    var business = data.accounts.filter(function (a) { return a.segment === 'business'; });
    var parts = [
      'Right now ', bold(String(personal.length)), ' personal and ', bold(String(business.length)),
      ' business bank accounts pay a sign-up bonus.'
    ];
    var dd = best(personal.filter(isDirectDeposit));
    var cash = best(personal.filter(function (a) { return !isDirectDeposit(a); }));
    var biz = best(business);
    if (dd) parts.push(' With direct deposit, the biggest is ', bold(bonusText(dd, topTier(dd))), ' from ' + dd.account + '.');
    if (cash) parts.push(' For savings you leave in place, it\'s ', bold(bonusText(cash, topTier(cash))), ' from ' + cash.account + '.');
    if (biz) parts.push(' Businesses can earn up to ', bold(bonusText(biz, topTier(biz))), ' from ' + biz.account + '.');
    fill(document.getElementById('bab-lede'), parts);
  }

  // Checking / Savings filter: shown only when the tab has more than one type.
  function drawTypeToggle() {
    var types = typesInSegment();
    var box = document.getElementById('bab-types');
    box.hidden = types.length < 2;
    if (types.length < 2) state.type = 'all';
    box.querySelectorAll('button').forEach(function (btn) {
      btn.setAttribute('aria-pressed', String(btn.getAttribute('data-type') === state.type));
    });
  }

  // Last question: one tap-to-select button per bank in the current tab.
  function drawHadOptions() {
    var box = document.getElementById('bab-had-options');
    box.textContent = '';
    var banks = [];
    segmentAccounts().forEach(function (a) {
      if (banks.indexOf(a.bank) < 0) banks.push(a.bank);
    });
    banks.sort().forEach(function (bank) {
      var btn = el('button', null, bank);
      btn.type = 'button';
      btn.setAttribute('aria-pressed', String(Boolean(state.had[bank])));
      btn.addEventListener('click', function () {
        if (state.had[bank]) delete state.had[bank];
        else state.had[bank] = true;
        btn.setAttribute('aria-pressed', String(Boolean(state.had[bank])));
        drawQuizNav();
        drawResults();
      });
      box.appendChild(btn);
    });
  }

  // The label of the chosen answer, read from the question's own button.
  function answerLabel(field) {
    var btn = document.querySelector('#bab-checker .ccb-options[data-field="' + field + '"] [data-value="' + state[field] + '"]');
    return btn ? btn.textContent : '';
  }

  // Small recap of the answers shown after the last question.
  function drawAnswers() {
    var had = Object.keys(state.had).filter(function (bank) {
      return segmentAccounts().some(function (a) { return a.bank === bank; });
    }).length;
    var parts = [];
    if (state.segment === 'personal') {
      parts.push(state.dd ? answerLabel('dd') + ' a month by direct deposit' : 'No direct deposit');
    }
    parts.push(state.cash ? answerLabel('cash') + ' to deposit' : 'No cash to deposit');
    parts.push(had ? 'Used ' + had + ' ' + plural(had, 'bank', 'banks') + ' listed here' : 'New to these banks');
    fill(document.getElementById('bab-answers'), parts.map(function (text) {
      return el('span', 'cc-badge plain', text);
    }));
  }

  // One-line result after the checker: how many accounts fit, and the best one.
  function drawFitSummary() {
    if (!quizDone()) return;
    var rows = visibleRows();
    var fits = rows.filter(function (r) { return r.earned > 0; });
    var out = document.getElementById('bab-fit-summary');
    var kind = state.segment + (state.type === 'all' ? '' : ' ' + state.type);
    if (!fits.length) {
      out.textContent = 'None of these ' + kind + ' accounts fit your answers right now.';
    } else {
      var top = fits[0];
      fill(out, [
        bold(fits.length + ' of ' + rows.length), ' ' + kind + ' accounts fit your answers. The biggest bonus you could earn is ',
        bold(bonusText(top.a, top.fit.tier)), ' from ' + top.a.account + '.'
      ]);
    }
    drawAnswers();
  }

  function drawHeading(rows) {
    var label = state.segment === 'personal' ? 'Personal' : 'Business';
    var type = state.type === 'all' ? '' : ' ' + state.type;
    document.getElementById('bab-segment-title').textContent = label + type + ' accounts paying a bonus';
    var note = document.getElementById('bab-list-note');
    note.textContent = rows.length
      ? rows.length + ' ' + plural(rows.length, 'account', 'accounts') + (quizDone()
        ? ', ranked by the bonus you could earn.'
        : ', ranked by top bonus. Answer the questions above to see what you could earn.')
      : 'No accounts pay a bonus right now.';
  }

  /*
    Bonus-by-tier chart: one bar per account running to its top bonus, colored by
    what it needs (direct deposit or a deposit), with a notch at each smaller tier.
    After the checker, the part of the bar you can't reach fades.
  */
  function drawChart(rows) {
    var box = document.getElementById('bab-chart');
    box.textContent = '';
    if (!rows.length) return;

    var width = Math.max(260, box.clientWidth);
    var narrow = width < 460;
    var barH = 18, gap = 12, labelRow = narrow ? 18 : 0, axisH = 22;
    var rowH = barH + gap + labelRow;
    var height = rows.length * rowH - gap + axisH;
    var svg = svgEl('svg', {
      width: '100%', height: height, viewBox: '0 0 ' + width + ' ' + height, role: 'img',
      'aria-label': 'Top bonus by account: ' + rows.map(function (r) {
        return r.a.short + ' ' + fmtUsd(r.top.bonus);
      }).join(', ')
    });
    box.appendChild(svg);

    // Measure label widths so the bars start right after the longest name.
    var labelW = 0, valueW = 0;
    rows.forEach(function (r) {
      var a = svgEl('text', { 'class': 'ccb-chart-label' });
      a.textContent = r.a.short;
      var b = svgEl('text', { 'class': 'ccb-chart-value' });
      b.textContent = fmtUsd(r.top.bonus);
      svg.appendChild(a);
      svg.appendChild(b);
      labelW = Math.max(labelW, a.getComputedTextLength());
      valueW = Math.max(valueW, b.getComputedTextLength());
      svg.removeChild(a);
      svg.removeChild(b);
    });
    var left = narrow ? 0 : Math.ceil(labelW) + 12;
    var right = Math.ceil(valueW) + 10;
    var maxVal = Math.max.apply(null, rows.map(function (r) { return r.top.bonus; })) || 1;
    var step = maxVal > 1000 ? 500 : maxVal > 400 ? 200 : 100;
    var axisMax = Math.ceil(maxVal / step) * step;
    function x(v) { return left + (v / axisMax) * (width - left - right); }
    var plotBottom = height - axisH;

    for (var v = 0; v <= axisMax; v += step) {
      svg.appendChild(svgEl('line', { 'class': 'ccb-chart-grid', x1: x(v), x2: x(v), y1: 0, y2: plotBottom }));
      var tick = svgEl('text', { 'class': 'ccb-chart-tick', x: x(v), y: plotBottom + 16, 'text-anchor': v === 0 && narrow ? 'start' : 'middle' });
      tick.textContent = '$' + fmtInt(v);
      svg.appendChild(tick);
    }

    rows.forEach(function (r, i) {
      var g = svgEl('g', { transform: 'translate(0,' + i * rowH + ')' });
      var tone = isDirectDeposit(r.a) ? 'bab-bar-dd' : 'bab-bar-deposit';
      var label = svgEl('text', {
        'class': 'ccb-chart-label',
        x: narrow ? 0 : left - 10,
        y: narrow ? 12 : barH / 2,
        dy: narrow ? 0 : '0.35em',
        'text-anchor': narrow ? 'start' : 'end'
      });
      label.textContent = r.a.short;
      g.appendChild(label);

      // Full bar, faded past what the visitor can reach once they have answered.
      var reach = r.fit.answered || r.fit.blocked ? r.earned : r.top.bonus;
      g.appendChild(svgEl('rect', {
        'class': 'ccb-bar ' + tone + (reach < r.top.bonus ? ' bab-bar-faded' : ''),
        x: left, y: labelRow, rx: 3, height: barH, width: Math.max(1, x(r.top.bonus) - left)
      }));
      if (reach > 0 && reach < r.top.bonus) {
        g.appendChild(svgEl('rect', {
          'class': 'ccb-bar ' + tone, x: left, y: labelRow, rx: 3, height: barH, width: Math.max(1, x(reach) - left)
        }));
      }
      // Notches at the smaller tiers.
      tiersOf(r.a).slice(0, -1).forEach(function (t) {
        g.appendChild(svgEl('line', { 'class': 'bab-notch', x1: x(t.bonus), x2: x(t.bonus), y1: labelRow, y2: labelRow + barH }));
      });
      var value = svgEl('text', { 'class': 'ccb-chart-value', x: x(r.top.bonus) + 6, y: labelRow + barH / 2, dy: '0.35em' });
      value.textContent = fmtUsd(r.top.bonus);
      g.appendChild(value);

      var hit = svgEl('rect', { 'class': 'ccb-hit', x: 0, y: -gap / 2, width: width, height: rowH });
      function onMove(event) {
        var point = event.touches ? event.touches[0] : event;
        var rect = box.getBoundingClientRect();
        var lines = [r.a.account];
        tiersOf(r.a).forEach(function (t) { lines.push(needText(r.a, t) + ': ' + bonusText(r.a, t)); });
        if (r.fit.blocked) lines.push('You have used this bank recently');
        else if (r.fit.answered) lines.push(r.earned ? 'You could earn ' + bonusText(r.a, r.fit.tier) : 'Out of reach with your answers');
        showTip(box, lines, point.clientX - rect.left, point.clientY - rect.top);
      }
      hit.addEventListener('mousemove', onMove);
      hit.addEventListener('touchstart', onMove, { passive: true });
      hit.addEventListener('mouseleave', function () { hideTip(box); });
      g.appendChild(hit);
      svg.appendChild(g);
    });
  }

  // Card-shaped tile with the bank's logo and name; the name alone if the logo fails.
  function bankTile(bank, logo) {
    var tile = el('span', 'ccb-art-fallback bab-tile');
    if (logo) {
      var img = el('img', 'bab-logo');
      img.src = logo;
      img.alt = '';
      img.width = 44;
      img.height = 44;
      img.addEventListener('error', function () { img.remove(); });
      tile.appendChild(img);
    }
    tile.appendChild(el('span', 'bab-tile-name', bank));
    return tile;
  }

  // "Good to know" row: a short label over its text.
  function fact(label, text) {
    var li = el('li');
    li.appendChild(el('span', null, label));
    li.appendChild(el('b', null, text));
    return li;
  }

  // Fill one account from the template.
  function buildAccount(template, r) {
    var a = r.a, fit = r.fit, top = r.top;
    var node = template.content.firstElementChild.cloneNode(true);
    var referral = data.referralByAccount[a.id];
    var openUrl = referral || a.url;
    function slot(name) { return node.querySelector('[data-slot="' + name + '"]'); }

    node.id = 'account-' + a.id;
    if (answeredAny() && !fit.fits) node.classList.add('ccb-dim');

    // Bank logo tile in place of card art (just the name if the logo is missing).
    slot('mark').appendChild(bankTile(a.bank, a.logo));
    slot('rank').textContent = '#' + r.rank;
    slot('issuer').textContent = a.bank + ' · ' + (a.type === 'savings' ? 'Savings' : 'Checking') +
      ' · ' + (a.segment === 'business' ? 'Business' : 'Personal');
    var name = slot('name');
    name.textContent = a.account;
    name.href = openUrl;

    // Status chips: what it needs, referral-only, end date, then the checker's result.
    var chips = slot('chips');
    chips.appendChild(chip(isDirectDeposit(a) ? 'Needs direct deposit' : 'No direct deposit needed', 'plain'));
    if (a.referral_only) chips.appendChild(chip('Bonus through my referral link', 'high'));
    if (a.ends) {
      var left = daysUntil(a.ends);
      var soon = left >= 0 && left <= 14;
      chips.appendChild(chip('Ends ' + fmtDay(a.ends, true) + (soon ? ' (' + left + ' ' + plural(left, 'day', 'days') + ' left)' : ''), soon ? 'near' : 'plain'));
    }
    if (fit.blocked) chips.appendChild(chip('Likely no bonus: ' + a.rule_short, 'bad'));
    else if (fit.answered && !fit.tier) chips.appendChild(chip('Needs ' + needText(a, tiersOf(a)[0]), 'near'));
    else if (fit.answered && fit.tier) chips.appendChild(chip('You could earn ' + bonusText(a, fit.tier), 'high'));

    // Offer numbers.
    var tiers = tiersOf(a);
    slot('bonus').textContent = (tiers.length > 1 ? 'Up to ' : '') + bonusText(a, top);
    slot('bonus-note').textContent = a.points > 0
      ? a.program + ' points, worth about ' + fmtUsd(top.bonus)
      : tiers.length > 1 ? tiers.length + ' tiers, from ' + bonusText(a, tiers[0]) : 'One bonus amount';
    slot('need').textContent = needText(a, top);
    var rate = yearlyRate(a, top);
    slot('need-note').textContent = isDirectDeposit(a)
      ? 'Within ' + a.days + ' days'
      : 'Kept about ' + a.hold_days + ' days. Like earning ' + rate.toFixed(1) + '% a year on it';
    if (a.monthly_fee > 0) {
      slot('fee').textContent = fmtUsd(a.monthly_fee);
      slot('fee-note').textContent = a.fee_waiver;
    } else {
      slot('fee').textContent = '$0';
      slot('fee-note').textContent = 'No monthly fee';
    }

    // Bonus tiers, with the one the visitor can reach marked.
    tiers.forEach(function (t) {
      var li = el('li', fit.tier === t && fit.fits ? 'bab-tier-yours' : null);
      li.appendChild(el('span', null, needText(a, t)));
      li.appendChild(el('b', null, bonusText(a, t)));
      slot('tiers').appendChild(li);
    });

    (a.steps || []).forEach(function (s) { slot('steps').appendChild(el('li', null, s)); });

    var facts = slot('facts');
    facts.appendChild(fact('Who can get it', a.eligibility));
    facts.appendChild(fact('When it pays', a.payout));
    (a.notes || []).forEach(function (n) { facts.appendChild(el('li', 'bab-note', n)); });

    // Footer: Open account (referral link when there is one).
    var open = slot('open');
    open.href = openUrl;
    open.setAttribute('aria-label', 'Open ' + a.account);
    var official = slot('official');
    if (referral) {
      open.textContent = 'Open with my referral link →';
      open.rel = 'noopener sponsored';
      name.rel = 'noopener sponsored';
      official.href = a.url;
      if (a.referral_only) official.textContent = 'Account details';
    } else {
      official.remove();
    }
    return node;
  }

  // Account list for the current tab and type, after the checker's filter.
  function drawList(rows) {
    var list = document.getElementById('bab-list');
    var template = document.getElementById('bab-account-template');
    list.textContent = '';
    var filtering = quizDone() && state.onlyFits;
    var hidden = 0;
    rows.forEach(function (r) {
      if (filtering && !r.earned) {
        hidden += 1;
        return;
      }
      list.appendChild(buildAccount(template, r));
    });
    if (hidden > 0) {
      var note = el('li', 'ccb-empty', hidden + ' ' + plural(hidden, 'account is', 'accounts are') + ' hidden because ' +
        plural(hidden, "it doesn't", "they don't") + ' fit your answers. ');
      var showAll = el('button', 'ccb-text-button', 'Show ' + plural(hidden, 'it', 'them'));
      showAll.type = 'button';
      showAll.addEventListener('click', function () { setOnlyFits(false); });
      note.appendChild(showAll);
      list.appendChild(note);
    }
  }

  // Everything that changes when the tab, type or checker answers change.
  function drawResults() {
    var rows = visibleRows();
    drawFitSummary();
    drawHeading(rows);
    drawChart(rows);
    drawList(rows);
  }

  /* ─── 5. Controls ─── */

  function setSegment(segment, updateHash) {
    var finished = state.step > 0 && quizDone();
    segment = segment === 'business' ? 'business' : 'personal';
    var changed = state.segment !== segment;
    state.segment = segment;
    document.querySelectorAll('.ccb-toggle [data-segment]').forEach(function (btn) {
      btn.setAttribute('aria-pressed', String(btn.getAttribute('data-segment') === state.segment));
    });
    if (updateHash && window.history.replaceState) {
      window.history.replaceState(null, '', '#' + state.segment);
    }
    // The tabs ask different questions: a finished checker stays finished unless
    // this tab asks something new (direct deposit); otherwise it starts again.
    var unanswered = state.segment === 'personal' && state.dd === null;
    if (finished && !unanswered) state.step = QUESTIONS[state.segment].length + 1;
    else if ((finished || changed) && state.step > 0) state.step = 1;
    drawTypeToggle();
    drawHadOptions();
    drawQuestionText();
    if (state.step > 0 && !quizDone()) showStep(state.step);
    drawQuizNav();
    drawResults();
  }

  function setType(type) {
    state.type = type;
    drawTypeToggle();
    drawResults();
  }

  // The cash question is worded for people or for businesses.
  function drawQuestionText() {
    var q = document.querySelector('#bab-checker [data-question="cash"] .ccb-question');
    q.textContent = q.getAttribute('data-' + state.segment);
    document.getElementById('bab-start-note').textContent = QUESTIONS[state.segment].length +
      ' quick questions. Your answers stay on this page.';
  }

  function showPanel(name) {
    document.querySelectorAll('#bab-checker [data-panel]').forEach(function (panel) {
      panel.hidden = panel.getAttribute('data-panel') !== name;
    });
  }

  // Show question n of this tab, with the progress bar and the current answer marked.
  function showStep(n) {
    var questions = QUESTIONS[state.segment];
    state.step = n;
    showPanel('quiz');
    document.querySelectorAll('#bab-checker .ccb-step').forEach(function (step) {
      step.hidden = step.getAttribute('data-question') !== questions[n - 1];
    });
    document.querySelectorAll('#bab-checker .ccb-options[data-field]').forEach(function (group) {
      var field = group.getAttribute('data-field');
      group.querySelectorAll('button').forEach(function (btn) {
        btn.setAttribute('aria-pressed', String(Number(btn.getAttribute('data-value')) === state[field]));
      });
    });
    document.getElementById('bab-step-num').textContent = n;
    document.getElementById('bab-step-total').textContent = questions.length;
    document.getElementById('bab-step-bar').style.width = (100 * n / questions.length) + '%';
    drawQuizNav();
    var heading = document.querySelector('#bab-checker .ccb-step:not([hidden]) .ccb-question');
    if (heading) {
      heading.setAttribute('tabindex', '-1');
      heading.focus({ preventScroll: true });
    }
  }

  // Back on every question but the first; on the last, "None of these" until a bank is picked.
  function drawQuizNav() {
    var back = document.querySelector('#bab-checker [data-action="back"]');
    var next = document.querySelector('#bab-checker [data-action="next"]');
    back.hidden = state.step <= 1;
    next.hidden = state.step !== QUESTIONS[state.segment].length;
    var picked = segmentAccounts().some(function (a) { return state.had[a.bank]; });
    next.textContent = picked ? 'See my accounts' : 'None of these';
  }

  function finishQuiz() {
    state.step = QUESTIONS[state.segment].length + 1;
    showPanel('done');
    drawResults();
  }

  function resetQuiz() {
    state.step = 0;
    state.dd = state.cash = null;
    state.had = {};
    drawHadOptions();
    showPanel('start');
    setOnlyFits(true);
  }

  function setOnlyFits(on) {
    state.onlyFits = on;
    document.getElementById('bab-only-fits').checked = on;
    drawResults();
  }

  function bindControls() {
    document.querySelectorAll('.ccb-toggle [data-segment]').forEach(function (btn) {
      btn.addEventListener('click', function () { setSegment(btn.getAttribute('data-segment'), true); });
    });
    document.querySelectorAll('#bab-types [data-type]').forEach(function (btn) {
      btn.addEventListener('click', function () { setType(btn.getAttribute('data-type')); });
    });

    // Single-answer questions: tapping an answer saves it and moves to the next question.
    document.querySelectorAll('#bab-checker .ccb-options[data-field] button').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state[btn.parentNode.getAttribute('data-field')] = Number(btn.getAttribute('data-value'));
        btn.parentNode.querySelectorAll('button').forEach(function (b) {
          b.setAttribute('aria-pressed', String(b === btn));
        });
        drawResults();
        setTimeout(function () { showStep(state.step + 1); }, 220);
      });
    });

    var actions = {
      start: function () { showStep(1); },
      back: function () { showStep(Math.max(1, state.step - 1)); },
      next: finishQuiz,
      edit: function () { showStep(1); },
      reset: resetQuiz
    };
    document.querySelectorAll('#bab-checker [data-action]').forEach(function (btn) {
      btn.addEventListener('click', actions[btn.getAttribute('data-action')]);
    });

    document.getElementById('bab-only-fits').addEventListener('change', function (event) {
      setOnlyFits(event.target.checked);
    });

    // The chart is sized to its container, so redraw it when the width changes.
    var lastWidth = window.innerWidth;
    var timer = null;
    window.addEventListener('resize', function () {
      if (window.innerWidth === lastWidth) return;
      lastWidth = window.innerWidth;
      clearTimeout(timer);
      timer = setTimeout(drawResults, 150);
    });
  }

  /* ─── 6. Start-up ─── */

  Promise.all([
    loadJson('data/banks.json'),
    loadJson('data/referrals.json').catch(function () { return { groups: [] }; }) // the page still works without referrals
  ]).then(function (files) {
    data.accounts = files[0].accounts || [];
    data.referralByAccount = referralMap(files[1]);
    drawIntro();
    bindControls();
    state.segment = '';  // so the first setSegment counts as a change
    setSegment((window.location.hash || '').replace('#', ''), false);
  }).catch(function (err) {
    document.getElementById('bab-lede').textContent = 'The account data could not be loaded. Please refresh the page.';
    document.getElementById('bab-list').textContent = '';
    if (window.console) console.error(err);
  });
})();
