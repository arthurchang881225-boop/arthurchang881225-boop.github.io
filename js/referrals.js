/*
  Referrals page script
  ---------------------
  Draws one section per group in data/referrals.json (travel cards, cash back
  cards, bank accounts…) into #ref-groups. Groups with no items are skipped, so
  a new group appears as soon as its first link is added.

  It also reads data/cards.json: when a card covered by a link is at a record-high
  bonus this week, its entry gets a badge pointing to the Credit Card Bonus page.
*/

(function () {
  'use strict';

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function loadJson(url) {
    return fetch(url, { cache: 'no-cache' }).then(function (res) {
      if (!res.ok) throw new Error(url + ' returned ' + res.status);
      return res.json();
    });
  }

  // card id -> segment, for cards at a record-high bonus right now.
  function recordCards(cardsFile) {
    var map = {};
    ((cardsFile && cardsFile.cards) || []).forEach(function (c) {
      if (c.bonus_points >= c.best_ever) map[c.id] = c.segment;
    });
    return map;
  }

  // One referral entry, styled like the site's other content cards.
  function buildItem(item, records) {
    var li = el('li', 'card ref-card');
    li.appendChild(el('div', 'meta', item.issuer));
    li.appendChild(el('h4', null, item.name));
    if (item.note) li.appendChild(el('p', null, item.note));

    // Badge when one of the covered cards is on this week's record-high list.
    var hit = (item.card_ids || []).filter(function (id) { return records[id]; })[0];
    if (hit) {
      var badge = el('a', 'cc-badge high ref-badge', 'Record-high bonus this week');
      badge.href = 'credit-card-bonus.html#' + records[hit];
      li.appendChild(badge);
    }

    var link = el('a', 'cc-cta', 'Open referral link →');
    link.href = item.url;
    link.target = '_blank';
    link.rel = 'noopener sponsored';
    link.setAttribute('aria-label', 'Open referral link for ' + item.name);
    li.appendChild(link);
    return li;
  }

  function draw(referrals, cardsFile) {
    var root = document.getElementById('ref-groups');
    var records = recordCards(cardsFile);
    root.textContent = '';
    (referrals.groups || []).forEach(function (group) {
      if (!group.items || !group.items.length) return;
      var section = el('section', 'section-block');
      section.id = group.id;
      var header = el('div', 'section-header');
      header.appendChild(el('h3', null, group.title));
      section.appendChild(header);
      var list = el('ul', 'card-grid ref-list');
      group.items.forEach(function (item) { list.appendChild(buildItem(item, records)); });
      section.appendChild(list);
      root.appendChild(section);
    });
  }

  Promise.all([
    loadJson('data/referrals.json'),
    loadJson('data/cards.json').catch(function () { return null; }) // badges are optional
  ]).then(function (files) {
    draw(files[0], files[1]);
  }).catch(function (err) {
    document.getElementById('ref-groups').textContent = 'The referral links could not be loaded. Please refresh the page.';
    if (window.console) console.error(err);
  });
})();
