/*
  Credit Card Bonus page script
  -----------------------------
  Reads the three data files and draws the page into the fixed containers in
  credit-card-bonus.html. Nothing here holds card content: to change what the page
  says, edit the data files (see data/README.md).

    data/cards.json      cards and their current offers (replaced weekly)
    data/transfers.json  bank transfer bonuses (replaced weekly)
    data/referrals.json  Arthur's referral links, matched to cards by id

  Sections below:
    1. State and settings
    2. Helpers: formatting and DOM building
    3. Calculations: ranking, eligibility, transfer bonuses
    4. Drawing: intro, checker, chart, card list, sparkline, transfers, sweet spots
    5. Controls: card type toggle and checker inputs
    6. Start-up
*/

(function () {
  'use strict';

  /* ─── 1. State and settings ─── */

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var MIN_LIST_LENGTH = 5; // top up the record-high list to this many cards

  // Loaded data, filled once at start-up.
  var data = {
    cards: [],        // cards.json "cards"
    ranked: [],       // cards after ranking, with computed values
    transfers: [],    // transfer bonuses that have not ended
    referralByCard: {} // card id -> referral link
  };

  var QUESTIONS = 4; // questions in the bonus checker

  // What the visitor has chosen. Kept in memory only, never saved.
  // An answer is null until its question is answered.
  var state = {
    segment: 'personal',
    step: 0,          // checker: 0 not started, 1-4 the question shown, 5 finished
    n524: null,       // personal cards opened in 24 months (2, 4, 5, or 6 meaning 6 or more)
    maxFee: null,     // highest annual fee they would pay, -1 for any
    monthly: null,    // dollars a month they can put on a new card
    had: {},          // card ids they have held
    onlyFits: true    // after the checker: hide cards that don't fit
  };

  // Bonus rule named when a visitor already had that issuer's card.
  var OWN_CARD_RULE = {
    'American Express': 'Amex lifetime rule',
    'Chase': 'Chase 24-month bonus rule',
    'Citi': 'Citi 48-month rule',
    'Bank of America': 'BofA 24-month bonus rule'
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

  function fmtMonth(date) {
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  }

  // Whole days from today (local calendar date) until a YYYY-MM-DD date.
  function daysUntil(s) {
    var now = new Date();
    var today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((parseDay(s).getTime() - today) / 86400000);
  }

  // Airline cards earn miles; everything else earns points.
  function unit(card) {
    return /miles/i.test(card.program) ? 'miles' : 'points';
  }

  function plural(n, one, many) {
    return n === 1 ? one : many;
  }

  // Create an HTML element with an optional class and text.
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  // Create an SVG element with attributes.
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

  /*
    Small floating tooltip shared by the chart and the sparklines.
    The tip is placed inside `box` (which is position: relative) near (x, y).
  */
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

  /* ─── 3. Calculations ─── */

  // Yearly dollar value of a card's statement credits, if every one is used.
  function yearlyCredits(card) {
    return (card.credits || []).reduce(function (sum, c) {
      return sum + (Number(c.annual) || 0);
    }, 0);
  }

  /*
    One row per earning rate: categories that share a rate are joined, and "Nx"
    rates are listed highest first. Other rates (such as "2%" or "+75%") follow in
    their original order.
  */
  function groupEarn(earn) {
    var groups = [];
    var byRate = {};
    (earn || []).forEach(function (e) {
      if (!byRate[e.rate]) {
        byRate[e.rate] = { rate: e.rate, what: [], order: groups.length };
        groups.push(byRate[e.rate]);
      }
      byRate[e.rate].what.push(e.what);
    });
    function multiplier(rate) {
      var m = /^(\d+(?:\.\d+)?)x$/i.exec(rate);
      return m ? Number(m[1]) : -1;
    }
    return groups.sort(function (a, b) {
      var ma = multiplier(a.rate), mb = multiplier(b.rate);
      if (ma >= 0 && mb >= 0) return mb - ma;
      if (ma >= 0 || mb >= 0) return ma >= 0 ? -1 : 1;
      return a.order - b.order;
    });
  }

  /*
    Rank each segment: every record-high card (bonus >= best ever) sorted by
    estimated value, then by lower fee; then, if fewer than 5, top up with the
    near-record cards whose bonus is the largest share of their best.
  */
  function rankCards(cards) {
    var out = [];
    ['personal', 'business'].forEach(function (segment) {
      var rows = cards.filter(function (c) { return c.segment === segment; }).map(function (c) {
        var estValue = Math.round((c.bonus_points * c.cpp) / 100);
        return {
          card: c,
          segment: segment,
          tier: c.bonus_points >= c.best_ever ? 'record' : 'near',
          pctOfBest: Math.round((100 * c.bonus_points) / c.best_ever),
          estValue: estValue,
          returnPer100: Math.round((100 * estValue) / c.spend),
          credits: yearlyCredits(c)
        };
      });
      var record = rows.filter(function (r) { return r.tier === 'record'; }).sort(function (a, b) {
        return b.estValue - a.estValue || a.card.annual_fee - b.card.annual_fee;
      });
      var near = rows.filter(function (r) { return r.tier === 'near'; }).sort(function (a, b) {
        return b.pctOfBest - a.pctOfBest || b.estValue - a.estValue;
      });
      record.concat(near.slice(0, Math.max(0, MIN_LIST_LENGTH - record.length))).forEach(function (r, i) {
        r.rank = i + 1;
        out.push(r);
      });
    });
    return out;
  }

  function hadFamily(family) {
    return data.cards.some(function (c) { return state.had[c.id] && c.rule_family === family; });
  }

  // True once the visitor has answered at least one checker question.
  function answeredAny() {
    return state.n524 !== null || state.maxFee !== null || state.monthly !== null ||
      Object.keys(state.had).length > 0;
  }

  /*
    Apply the issuers' published bonus and approval rules, the fee limit and the
    spending budget to the visitor's answers. Returns:
      status         'ok' | 'blocked' | 'caution' (bank rules)
      rule           the rule behind a block or caution
      monthlyNeeded  spending a month the minimum spend asks for
      spendOk        true / false, or null before the spending question
      feeOk          true / false, or null before the fee question
      fits           false when any answer rules the card out
  */
  function checkFit(card) {
    var status = 'ok';
    var rule = '';
    var n524 = state.n524 === null ? 0 : state.n524;
    if (state.had[card.id]) {
      status = 'blocked';
      rule = OWN_CARD_RULE[card.issuer] || 'Issuer bonus rule';
    } else if (card.rule_family === 'amex_gold_personal' && state.had.amex_platinum) {
      status = 'blocked';
      rule = 'Amex family rule';
    } else if (card.rule_family === 'ihg_personal' && hadFamily('ihg_personal')) {
      status = 'blocked';
      rule = 'Chase IHG family rule';
    } else if (card.chase_524 && n524 >= 5) {
      status = 'blocked';
      rule = 'Chase 5/24 rule';
    } else if (card.barclays && n524 >= 6) {
      status = 'caution';
      rule = 'Barclays 6/24 caution';
    }
    var monthlyNeeded = Math.ceil(card.spend / card.months);
    var spendOk = state.monthly === null ? null : state.monthly >= monthlyNeeded;
    var feeOk = state.maxFee === null ? null : state.maxFee < 0 || card.annual_fee <= state.maxFee;
    return {
      status: status,
      rule: rule,
      monthlyNeeded: monthlyNeeded,
      spendOk: spendOk,
      feeOk: feeOk,
      fits: status !== 'blocked' && spendOk !== false && feeOk !== false
    };
  }

  /*
    Keep transfer bonuses that have not ended, biggest bonus first, and price each
    sweet spot in bank points with and without the bonus.
  */
  function liveTransfers(transfers) {
    return transfers.map(function (t) {
      var rate = t.base_ratio * (1 + t.bonus_pct / 100);
      var partnerPoints = Number(t.partner_points) || 0;
      return {
        t: t,
        daysLeft: daysUntil(t.ends),
        pointsWithout: partnerPoints ? Math.ceil(partnerPoints / t.base_ratio) : 0,
        pointsWith: partnerPoints ? Math.ceil(partnerPoints / rate) : 0
      };
    }).filter(function (row) {
      return row.daysLeft >= 0;
    }).sort(function (a, b) {
      return b.t.bonus_pct - a.t.bonus_pct || a.daysLeft - b.daysLeft;
    });
  }

  // card id -> referral url, from every group in referrals.json.
  function referralMap(referrals) {
    var map = {};
    (referrals.groups || []).forEach(function (group) {
      (group.items || []).forEach(function (item) {
        (item.card_ids || []).forEach(function (id) {
          if (item.url) map[id] = item.url;
        });
      });
    });
    return map;
  }

  function segmentRows() {
    return data.ranked.filter(function (r) { return r.segment === state.segment; });
  }

  /* ─── 4. Drawing ─── */

  // Intro sentence: record counts, top pick per segment and the richest transfer bonus.
  function drawIntro() {
    function top(segment) {
      return data.ranked.filter(function (r) { return r.segment === segment && r.rank === 1; })[0];
    }
    function count(segment) {
      return data.ranked.filter(function (r) { return r.segment === segment && r.tier === 'record'; }).length;
    }
    var parts = [
      'Right now ', bold(String(count('personal'))), ' personal and ',
      bold(String(count('business'))), ' business travel cards have a record-high welcome bonus.'
    ];
    ['personal', 'business'].forEach(function (segment) {
      var r = top(segment);
      if (r) parts.push(' The top ' + segment + ' pick is ', bold(r.card.card), ', worth about ', bold(fmtUsd(r.estValue)), '.');
    });
    var t = data.transfers[0];
    if (t) {
      parts.push(' The richest transfer bonus is ', bold(t.t.bonus_pct + '%'),
        ' from ' + t.t.program + ' to ' + t.t.partner + ', through ' + fmtDay(t.t.ends) + '.');
    }
    fill(document.getElementById('ccb-lede'), parts);
  }

  /*
    Question 4: one tap-to-select button per card listed in the current tab, so the
    visitor only sees the cards that matter here (never the whole data file).
  */
  function drawHadOptions() {
    var box = document.getElementById('ccb-had-options');
    box.textContent = '';
    segmentRows().forEach(function (r) {
      var btn = el('button', null, r.card.short);
      btn.type = 'button';
      btn.setAttribute('aria-pressed', String(Boolean(state.had[r.card.id])));
      btn.addEventListener('click', function () {
        if (state.had[r.card.id]) delete state.had[r.card.id];
        else state.had[r.card.id] = true;
        btn.setAttribute('aria-pressed', String(Boolean(state.had[r.card.id])));
        drawQuizNav();
        drawResults();
      });
      box.appendChild(btn);
    });
  }

  // The label of the chosen answer, read from the question's own button.
  function answerLabel(field) {
    var btn = document.querySelector('.ccb-options[data-field="' + field + '"] [data-value="' + state[field] + '"]');
    return btn ? btn.textContent : '';
  }

  // Small recap of the answers shown after the last question.
  function drawAnswers() {
    var box = document.getElementById('ccb-answers');
    var had = segmentRows().filter(function (r) { return state.had[r.card.id]; }).length;
    var parts = [
      answerLabel('n524') + ' new cards in 24 months',
      state.maxFee < 0 ? 'Any annual fee' : 'Annual fee ' + answerLabel('maxFee').replace(/^Up to/, 'up to'),
      answerLabel('monthly') + ' a month',
      had ? 'Had ' + had + ' ' + plural(had, 'card', 'cards') + ' listed here' : 'New to these cards'
    ];
    fill(box, parts.map(function (text) { return el('span', 'cc-badge plain', text); }));
  }

  // One-line result after the checker: how many cards in this tab fit.
  function drawFitSummary() {
    if (state.step !== QUESTIONS + 1) return;
    var rows = segmentRows();
    var ok = rows.filter(function (r) { return checkFit(r.card).fits; }).length;
    var out = document.getElementById('ccb-fit-summary');
    if (!ok) {
      out.textContent = 'None of these ' + state.segment + ' cards fit your answers right now.';
    } else {
      fill(out, [bold(ok + ' of ' + rows.length), ' ' + state.segment + ' cards fit your answers.']);
    }
    drawAnswers();
  }

  // Segment heading and the sentence explaining record vs near-record cards.
  function drawSegmentHeading() {
    var rows = segmentRows();
    var record = rows.filter(function (r) { return r.tier === 'record'; }).length;
    var near = rows.length - record;
    var label = state.segment === 'personal' ? 'Personal' : 'Business';
    document.getElementById('ccb-segment-title').textContent = label + ' travel cards at a record-high bonus';
    var note = document.getElementById('ccb-tier-note');
    if (!rows.length) note.textContent = 'No cards qualify right now.';
    else if (near === 0) note.textContent = record + ' ' + plural(record, 'card', 'cards') + ' at a record-high bonus, ranked by estimated value.';
    else note.textContent = record + ' ' + plural(record, 'card is', 'cards are') + ' at a record high, ranked by estimated value. The next ' +
      near + ' ' + plural(near, 'is', 'are') + ' the closest to their record.';
  }

  /*
    Horizontal bar chart of bonus value per $100 of required spend.
    Labels sit left of the bars on wide screens and above them on narrow ones.
  */
  function drawChart() {
    var box = document.getElementById('ccb-chart');
    box.textContent = '';
    var rows = segmentRows().slice().sort(function (a, b) { return b.returnPer100 - a.returnPer100; });
    if (!rows.length) return;

    var width = Math.max(260, box.clientWidth);
    var narrow = width < 460;
    var barH = 18, gap = 12, labelRow = narrow ? 18 : 0, axisH = 22;
    var rowH = barH + gap + labelRow;
    var height = rows.length * rowH - gap + axisH;
    var svg = svgEl('svg', {
      width: '100%', height: height, viewBox: '0 0 ' + width + ' ' + height, role: 'img',
      'aria-label': 'Estimated bonus value per $100 of required spending: ' +
        rows.map(function (r) { return r.card.short + ' $' + r.returnPer100; }).join(', ')
    });
    box.appendChild(svg);

    // Measure label widths so the bars start right after the longest name.
    var labelW = 0, valueW = 0;
    rows.forEach(function (r) {
      var a = svgEl('text', { 'class': 'ccb-chart-label' });
      a.textContent = r.card.short;
      var b = svgEl('text', { 'class': 'ccb-chart-value' });
      b.textContent = '$' + r.returnPer100;
      svg.appendChild(a);
      svg.appendChild(b);
      labelW = Math.max(labelW, a.getComputedTextLength());
      valueW = Math.max(valueW, b.getComputedTextLength());
      svg.removeChild(a);
      svg.removeChild(b);
    });
    var left = narrow ? 0 : Math.ceil(labelW) + 12;
    var right = Math.ceil(valueW) + 10;
    var maxVal = Math.max.apply(null, rows.map(function (r) { return r.returnPer100; })) || 1;
    var step = maxVal > 60 ? 20 : maxVal > 30 ? 10 : 5;
    var axisMax = Math.ceil(maxVal / step) * step;
    function x(v) { return left + (v / axisMax) * (width - left - right); }
    var plotBottom = height - axisH;

    // Grid lines and axis labels.
    for (var v = 0; v <= axisMax; v += step) {
      svg.appendChild(svgEl('line', { 'class': 'ccb-chart-grid', x1: x(v), x2: x(v), y1: 0, y2: plotBottom }));
      var tick = svgEl('text', { 'class': 'ccb-chart-tick', x: x(v), y: plotBottom + 16, 'text-anchor': v === 0 && narrow ? 'start' : 'middle' });
      tick.textContent = '$' + v;
      svg.appendChild(tick);
    }

    // One row per card: label, bar, value, and an invisible hover target.
    rows.forEach(function (r, i) {
      var y = i * rowH;
      var g = svgEl('g', { transform: 'translate(0,' + y + ')' });
      var label = svgEl('text', {
        'class': 'ccb-chart-label',
        x: narrow ? 0 : left - 10,
        y: narrow ? 12 : barH / 2,
        dy: narrow ? 0 : '0.35em',
        'text-anchor': narrow ? 'start' : 'end'
      });
      label.textContent = r.card.short;
      g.appendChild(label);
      g.appendChild(svgEl('rect', {
        'class': 'ccb-bar ' + (r.tier === 'record' ? 'ccb-bar-record' : 'ccb-bar-near'),
        x: left, y: labelRow, rx: 3, height: barH, width: Math.max(1, x(r.returnPer100) - left)
      }));
      var value = svgEl('text', { 'class': 'ccb-chart-value', x: x(r.returnPer100) + 6, y: labelRow + barH / 2, dy: '0.35em' });
      value.textContent = '$' + r.returnPer100;
      g.appendChild(value);

      var hit = svgEl('rect', { 'class': 'ccb-hit', x: 0, y: -gap / 2, width: width, height: rowH });
      function onMove(event) {
        var point = event.touches ? event.touches[0] : event;
        var rect = box.getBoundingClientRect();
        showTip(box, [
          r.card.short,
          r.tier === 'record' ? 'Record-high offer' : 'Near record: ' + r.pctOfBest + '% of its best',
          'Bonus worth about ' + fmtUsd(r.estValue),
          'Required spend ' + fmtUsd(r.card.spend),
          '$' + r.returnPer100 + ' back per $100 spent'
        ], point.clientX - rect.left, point.clientY - rect.top);
      }
      hit.addEventListener('mousemove', onMove);
      hit.addEventListener('touchstart', onMove, { passive: true });
      hit.addEventListener('mouseleave', function () { hideTip(box); });
      g.appendChild(hit);
      svg.appendChild(g);
    });
  }

  /*
    Offer-history sparkline: a step line of past offers, a dashed line at the best
    offer before today, a dot on today's offer, and a hover dot that follows the
    cursor along the line. Returns false when there is not enough history to draw.
  */
  function drawSparkline(box, r) {
    box.textContent = '';
    var pts = (r.card.history || []).map(function (h) {
      return { date: new Date(h.month + '-01T00:00:00Z'), value: Number(h.points) };
    }).filter(function (p) {
      return !isNaN(p.date.getTime()) && p.value > 0;
    }).sort(function (a, b) { return a.date - b.date; });
    if (pts.length < 2) return false;

    var width = Math.max(200, box.clientWidth), height = 64, padTop = 6, padBottom = 18, padRight = 6;
    var t0 = pts[0].date.getTime(), t1 = pts[pts.length - 1].date.getTime();
    var yMax = Math.max(r.card.best_ever, Math.max.apply(null, pts.map(function (p) { return p.value; })));
    function x(time) { return ((time - t0) / (t1 - t0)) * (width - padRight); }
    function y(value) { return padTop + (1 - value / yMax) * (height - padTop - padBottom); }

    var svg = svgEl('svg', {
      width: '100%', height: height, viewBox: '0 0 ' + width + ' ' + height, role: 'img',
      'aria-label': 'Offer history for ' + r.card.short + ': ' +
        pts.map(function (p) { return fmtMonth(p.date) + ' ' + fmtInt(p.value); }).join(', ')
    });

    // Step path: hold each offer flat until the next one starts.
    var d = 'M' + x(pts[0].date.getTime()) + ',' + y(pts[0].value);
    for (var i = 1; i < pts.length; i++) {
      d += ' H' + x(pts[i].date.getTime()) + ' V' + y(pts[i].value);
    }
    var last = pts[pts.length - 1];
    svg.appendChild(svgEl('line', { 'class': 'ccb-spark-best', x1: 0, x2: width - padRight, y1: y(r.card.best_ever), y2: y(r.card.best_ever) }));
    svg.appendChild(svgEl('path', { 'class': 'ccb-spark-line', d: d }));
    svg.appendChild(svgEl('circle', { 'class': 'ccb-spark-now', cx: x(last.date.getTime()), cy: y(last.value), r: 3.5 }));
    var from = svgEl('text', { 'class': 'ccb-chart-tick', x: 0, y: height - 4 });
    from.textContent = fmtMonth(pts[0].date);
    var to = svgEl('text', { 'class': 'ccb-chart-tick', x: width - padRight, y: height - 4, 'text-anchor': 'end' });
    to.textContent = 'Now';
    svg.appendChild(from);
    svg.appendChild(to);

    // Hover dot and tooltip: show the month under the cursor and the offer in effect then.
    var dot = svgEl('circle', { 'class': 'ccb-spark-hover', r: 4.5 });
    dot.style.display = 'none';
    svg.appendChild(dot);
    var hit = svgEl('rect', { 'class': 'ccb-hit', x: 0, y: 0, width: width, height: height });
    function onMove(event) {
      var point = event.touches ? event.touches[0] : event;
      var rect = box.getBoundingClientRect();
      var px = Math.max(0, Math.min(width - padRight, ((point.clientX - rect.left) / rect.width) * width));
      var at = t0 + (px / (width - padRight)) * (t1 - t0);
      var current = pts[0];
      pts.forEach(function (p) { if (p.date.getTime() <= at) current = p; });
      dot.setAttribute('cx', px);
      dot.setAttribute('cy', y(current.value));
      dot.style.display = '';
      showTip(box, [fmtMonth(new Date(at)) + ': ' + fmtInt(current.value) + ' ' + unit(r.card)],
        (px / width) * rect.width, 0);
    }
    function onLeave() {
      dot.style.display = 'none';
      hideTip(box);
    }
    hit.addEventListener('mousemove', onMove);
    hit.addEventListener('touchstart', onMove, { passive: true });
    hit.addEventListener('touchmove', onMove, { passive: true });
    hit.addEventListener('mouseleave', onLeave);
    hit.addEventListener('touchend', onLeave);
    svg.appendChild(hit);
    box.appendChild(svg);
    return true;
  }

  // A small rounded label, reusing the site's .cc-badge colors.
  function chip(text, tone) {
    return el('span', 'cc-badge ' + tone, text);
  }

  /*
    Annual fee box. A fee waived for the first year shows the regular fee crossed
    out in red next to the first-year price; a regular fee is just the amount.
  */
  function drawFee(feeNode, noteNode, card) {
    var notes = [];
    feeNode.textContent = '';
    if (card.first_year_fee < card.annual_fee) {
      feeNode.appendChild(el('s', 'ccb-fee-old', fmtUsd(card.annual_fee)));
      feeNode.appendChild(el('span', null, fmtUsd(card.first_year_fee)));
      feeNode.setAttribute('aria-label', fmtUsd(card.first_year_fee) + ' the first year, then ' + fmtUsd(card.annual_fee));
      notes.push('First year, then ' + fmtUsd(card.annual_fee) + ' a year');
    } else {
      feeNode.textContent = fmtUsd(card.annual_fee);
    }
    if (card.fee_note) notes.push(card.fee_note);
    noteNode.textContent = notes.join('. ');
  }

  // Fill one card from the template.
  function buildCard(template, r) {
    var c = r.card;
    var fit = checkFit(c);
    var node = template.content.firstElementChild.cloneNode(true);
    var referral = data.referralByCard[c.id];
    var applyUrl = referral || c.url;
    function slot(name) { return node.querySelector('[data-slot="' + name + '"]'); }

    node.id = 'card-' + c.id;
    if (answeredAny() && !fit.fits) node.classList.add('ccb-dim');

    // Card art, or a plain placeholder with the short name.
    var art = slot('art');
    if (c.image) {
      var img = el('img');
      img.src = c.image;
      img.alt = c.card + ' card art';
      img.loading = 'lazy';
      img.width = 220;
      img.height = 139;
      art.appendChild(img);
    } else {
      art.appendChild(el('span', 'ccb-art-fallback', c.short));
    }

    slot('rank').textContent = '#' + r.rank;
    slot('issuer').textContent = c.issuer + ' · ' + c.kind + ' · ' + c.program;
    var name = slot('name');
    name.textContent = c.card;
    name.href = applyUrl;

    // Status chips: record tier, best-ever note, end date, eligibility, spending fit.
    var chips = slot('chips');
    chips.appendChild(r.tier === 'record'
      ? chip('Record-high offer', 'high')
      : chip('Near record: ' + r.pctOfBest + '% of its best', 'near'));
    if (c.best_note) chips.appendChild(chip(c.best_note, 'plain'));
    if (c.ends) {
      var left = daysUntil(c.ends);
      var soon = left >= 0 && left <= 14;
      chips.appendChild(chip('Ends ' + fmtDay(c.ends, true) + (soon ? ' (' + left + ' ' + plural(left, 'day', 'days') + ' left)' : ''), soon ? 'near' : 'plain'));
    }
    // Checker results, shown once the visitor has answered something.
    if (fit.status === 'blocked') chips.appendChild(chip('No bonus for you: ' + fit.rule, 'bad'));
    if (fit.status === 'caution') chips.appendChild(chip('Check first: ' + fit.rule, 'near'));
    if (fit.feeOk === false) chips.appendChild(chip('Fee above your ' + fmtUsd(state.maxFee) + ' limit', 'near'));
    if (fit.spendOk === false) chips.appendChild(chip('Needs about ' + fmtUsd(fit.monthlyNeeded) + ' a month', 'near'));
    if (state.step === QUESTIONS + 1 && fit.fits) chips.appendChild(chip('Fits your answers', 'high'));

    // Offer numbers.
    slot('bonus').textContent = (c.as_high_as ? 'Up to ' : '') + fmtInt(c.bonus_points) + ' ' + unit(c);
    slot('spend').textContent = 'After ' + fmtUsd(c.spend) + ' in ' + c.months + ' months' + (c.bonus_extra ? '. ' + c.bonus_extra : '');
    slot('value').textContent = '≈ ' + fmtUsd(r.estValue);
    slot('cpp').textContent = 'At ' + c.cpp + '¢ per ' + unit(c).replace(/s$/, '') + '. $' + r.returnPer100 + ' back per $100 of required spend';
    drawFee(slot('fee'), slot('fee-note'), c);

    // Earning rates: one row per rate.
    groupEarn(c.earn).forEach(function (g) {
      var li = el('li');
      li.appendChild(el('b', null, g.rate));
      li.appendChild(el('span', null, g.what.join(' · ')));
      slot('earn').appendChild(li);
    });

    // Credits, then their yearly total.
    var credits = slot('credits');
    (c.credits || []).forEach(function (k) {
      var li = el('li');
      li.appendChild(el('span', null, k.label));
      li.appendChild(el('b', null, k.value));
      credits.appendChild(li);
    });
    if (!(c.credits || []).length) {
      credits.appendChild(el('li', 'ccb-none', 'No statement credits'));
    } else if (r.credits > 0) {
      var total = el('li', 'ccb-total');
      total.appendChild(el('span', null, 'Yearly total, if you use every one'));
      total.appendChild(el('b', null, fmtUsd(r.credits)));
      credits.appendChild(total);
    }

    // Highlights: perks without a fixed yearly dollar value.
    (c.highlights || []).forEach(function (h) {
      var li = el('li');
      li.appendChild(el('span', null, h.label));
      if (h.value) li.appendChild(el('b', null, h.value));
      slot('highlights').appendChild(li);
    });
    if (!(c.highlights || []).length) slot('highlights').appendChild(el('li', 'ccb-none', 'None listed'));

    // Footer: Apply (referral link when there is one).
    var apply = slot('apply');
    apply.href = applyUrl;
    apply.setAttribute('aria-label', 'Apply for ' + c.card);
    var official = slot('official');
    if (referral) {
      apply.textContent = 'Apply with my referral link →';
      apply.rel = 'noopener sponsored';
      name.rel = 'noopener sponsored';
      official.href = c.url;
    } else {
      official.remove();
    }
    return node;
  }

  // Card list for the selected segment, after the checker's filters.
  function drawList() {
    var list = document.getElementById('ccb-list');
    var template = document.getElementById('ccb-card-template');
    list.textContent = '';
    var filtering = state.step === QUESTIONS + 1 && state.onlyFits;
    var hidden = 0;
    var built = [];
    segmentRows().forEach(function (r) {
      if (filtering && !checkFit(r.card).fits) {
        hidden += 1;
        return;
      }
      var node = buildCard(template, r);
      list.appendChild(node);
      built.push({ node: node, r: r });
    });
    if (hidden > 0) {
      var note = el('li', 'ccb-empty', hidden + ' ' + plural(hidden, 'card is', 'cards are') + " hidden because " +
        plural(hidden, "it doesn't", "they don't") + ' fit your answers. ');
      var showAll = el('button', 'ccb-text-button', 'Show ' + plural(hidden, 'it', 'them'));
      showAll.type = 'button';
      showAll.addEventListener('click', function () { setOnlyFits(false); });
      note.appendChild(showAll);
      list.appendChild(note);
    }
    // Sparklines need the card in the page first so they can measure their width.
    // Cards without enough offer history hide the whole Offer history block.
    built.forEach(function (b) {
      var box = b.node.querySelector('[data-slot="spark"]');
      if (!drawSparkline(box, b.r)) box.closest('.ccb-history').hidden = true;
    });
  }

  // Transfer bonus table.
  function drawTransfers(note) {
    var body = document.getElementById('ccb-transfer-rows');
    body.textContent = '';
    if (!data.transfers.length) {
      var empty = el('tr');
      var td = el('td', 'ccb-empty', 'No transfer bonuses are running right now.');
      td.colSpan = 6;
      empty.appendChild(td);
      body.appendChild(empty);
    }
    // Column names come from the table header in the HTML; each cell keeps its
    // name in data-label so phones can show the table as stacked rows.
    var labels = Array.prototype.map.call(document.querySelectorAll('.ccb-table thead th'), function (th) {
      return th.textContent;
    });
    data.transfers.forEach(function (row) {
      var tr = el('tr');
      function cell(text, className) {
        var td = el('td', className, text);
        td.setAttribute('data-label', labels[tr.children.length] || '');
        tr.appendChild(td);
      }
      cell(row.t.program);
      cell(row.t.partner);
      cell(row.t.bonus_pct + '%', 'ccb-num ccb-pct');
      cell(fmtDay(row.t.ends, true), 'ccb-date');
      cell(row.daysLeft === 0 ? 'Last day' : String(row.daysLeft), 'ccb-num' + (row.daysLeft <= 7 ? ' ccb-soon' : ''));
      cell(row.t.note, 'ccb-why');
      body.appendChild(tr);
    });
    document.getElementById('ccb-transfer-note').textContent = note || '';
  }

  // Sweet spot cards: award price in bank points with today's bonus.
  function drawSweetSpots() {
    var list = document.getElementById('ccb-spots');
    list.textContent = '';
    var spots = data.transfers.filter(function (row) { return row.t.sweet_spot && row.pointsWith > 0; });
    if (!spots.length) {
      list.appendChild(el('li', 'ccb-empty', 'No sweet spots are priced this week.'));
      return;
    }
    spots.forEach(function (row) {
      var li = el('li', 'card');
      li.appendChild(el('div', 'meta', row.t.program + ' · ' + row.t.bonus_pct + '% bonus through ' + fmtDay(row.t.ends)));
      li.appendChild(el('h4', null, row.t.partner));
      li.appendChild(el('p', null, row.t.sweet_spot));
      li.appendChild(el('div', 'ccb-spot-value', fmtInt(row.pointsWith)));
      li.appendChild(el('p', 'ccb-meta', 'bank points with the bonus, instead of ' + fmtInt(row.pointsWithout)));
      list.appendChild(li);
    });
  }

  // Everything that changes when the segment or the checker answers change.
  function drawResults() {
    drawFitSummary();
    drawSegmentHeading();
    drawChart();
    drawList();
  }

  function showError(message) {
    document.getElementById('ccb-lede').textContent = message;
    document.getElementById('ccb-list').textContent = '';
  }

  /* ─── 5. Controls ─── */

  function setSegment(segment, updateHash) {
    state.segment = segment === 'business' ? 'business' : 'personal';
    document.querySelectorAll('.ccb-toggle button').forEach(function (btn) {
      btn.setAttribute('aria-pressed', String(btn.getAttribute('data-segment') === state.segment));
    });
    if (updateHash && window.history.replaceState) {
      window.history.replaceState(null, '', '#' + state.segment);
    }
    drawHadOptions();   // question 4 lists the cards of the current tab
    drawQuizNav();
    drawResults();
  }

  /* Checker: show one of its panels (start, quiz, done) */
  function showPanel(name) {
    document.querySelectorAll('#ccb-checker [data-panel]').forEach(function (panel) {
      panel.hidden = panel.getAttribute('data-panel') !== name;
    });
  }

  /* Checker: show question n, with the progress bar and the current answer marked */
  function showStep(n) {
    state.step = n;
    showPanel('quiz');
    document.querySelectorAll('#ccb-checker .ccb-step').forEach(function (step) {
      step.hidden = Number(step.getAttribute('data-step')) !== n;
    });
    document.querySelectorAll('#ccb-checker .ccb-options[data-field]').forEach(function (group) {
      var field = group.getAttribute('data-field');
      group.querySelectorAll('button').forEach(function (btn) {
        btn.setAttribute('aria-pressed', String(Number(btn.getAttribute('data-value')) === state[field]));
      });
    });
    document.getElementById('ccb-step-num').textContent = n;
    document.getElementById('ccb-step-bar').style.width = (100 * n / QUESTIONS) + '%';
    drawQuizNav();
    var heading = document.querySelector('#ccb-checker .ccb-step[data-step="' + n + '"] .ccb-question');
    if (heading) {
      heading.setAttribute('tabindex', '-1');
      heading.focus({ preventScroll: true });
    }
  }

  /* Checker: Back on every question but the first; on the last, a button that
     reads "None of these" until a card is picked, then "See my cards". */
  function drawQuizNav() {
    var back = document.querySelector('#ccb-checker [data-action="back"]');
    var next = document.querySelector('#ccb-checker [data-action="next"]');
    if (!back || !next) return;
    back.hidden = state.step <= 1;
    next.hidden = state.step !== QUESTIONS;
    var picked = segmentRows().some(function (r) { return state.had[r.card.id]; });
    next.textContent = picked ? 'See my cards' : 'None of these';
  }

  function finishQuiz() {
    state.step = QUESTIONS + 1;
    showPanel('done');
    drawResults();
  }

  function resetQuiz() {
    state.step = 0;
    state.n524 = state.maxFee = state.monthly = null;
    state.had = {};
    setOnlyFits(true);
    drawHadOptions();
    showPanel('start');
    drawResults();
  }

  function setOnlyFits(on) {
    state.onlyFits = on;
    document.getElementById('ccb-only-fits').checked = on;
    drawResults();
  }

  function bindControls() {
    document.querySelectorAll('.ccb-toggle button').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setSegment(btn.getAttribute('data-segment'), true);
      });
    });

    // Single-answer questions: tapping an answer saves it and moves to the next question.
    document.querySelectorAll('#ccb-checker .ccb-options[data-field] button').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var field = btn.parentNode.getAttribute('data-field');
        state[field] = Number(btn.getAttribute('data-value'));
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
    document.querySelectorAll('#ccb-checker [data-action]').forEach(function (btn) {
      btn.addEventListener('click', actions[btn.getAttribute('data-action')]);
    });

    document.getElementById('ccb-only-fits').addEventListener('change', function (event) {
      setOnlyFits(event.target.checked);
    });

    // Charts are sized to their container, so redraw them when the width changes.
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
    loadJson('data/cards.json'),
    loadJson('data/transfers.json'),
    loadJson('data/referrals.json').catch(function () { return { groups: [] }; }) // the page still works without referrals
  ]).then(function (files) {
    var cardsFile = files[0], transfersFile = files[1], referralsFile = files[2];
    data.cards = cardsFile.cards || [];
    data.ranked = rankCards(data.cards);
    data.transfers = liveTransfers(transfersFile.transfers || []);
    data.referralByCard = referralMap(referralsFile);

    drawIntro();
    drawTransfers(transfersFile.note);
    drawSweetSpots();
    bindControls();
    setSegment((window.location.hash || '').replace('#', ''), false);
  }).catch(function (err) {
    showError('The card data could not be loaded. Please refresh the page.');
    if (window.console) console.error(err);
  });
})();
