/*
  Home page script
  ----------------
  Fills the "Record-high card bonuses this week" gallery from data/cards.json, the
  same file the Credit Card Bonus page reads, so the home page updates with the
  weekly offer check. The layout is the #home-bonus-template in index.html; this
  file only copies it and fills in each card. If the data can't load, the section
  is hidden.
*/

(function () {
  'use strict';

  var MAX_TILES = 8; // how many cards the gallery shows

  var section = document.getElementById('home-bonuses');
  var track = document.getElementById('home-bonus-track');
  var template = document.getElementById('home-bonus-template');
  if (!section || !track || !template) return;

  /* Estimated bonus value in dollars, the same formula as the Credit Card Bonus page */
  function estValue(card) {
    return Math.round((card.bonus_points * card.cpp) / 100);
  }

  function fmtInt(n) {
    return n.toLocaleString('en-US');
  }

  /* Record-high offers, best estimated value first */
  function pickCards(cards) {
    return cards
      .filter(function (c) { return c.bonus_points >= c.best_ever; })
      .sort(function (a, b) { return estValue(b) - estValue(a); })
      .slice(0, MAX_TILES);
  }

  /* Card art, or a plain placeholder with the card name when there is no image */
  function artFor(card) {
    if (card.image) {
      var img = document.createElement('img');
      img.className = 'bonus-tile-art';
      img.src = card.image;
      img.alt = '';
      img.loading = 'lazy';
      return img;
    }
    var box = document.createElement('div');
    box.className = 'bonus-tile-art';
    box.textContent = card.short;
    return box;
  }

  function buildTile(card) {
    var node = template.content.firstElementChild.cloneNode(true);
    function slot(name) { return node.querySelector('[data-slot="' + name + '"]'); }

    slot('link').href = '/credit-card-bonus#' + card.segment;

    var issuer = slot('issuer');
    issuer.textContent = card.issuer;
    if (card.segment === 'business') {
      var tag = document.createElement('span');
      tag.className = 'bonus-tile-tag';
      tag.textContent = ' · Business';
      issuer.appendChild(tag);
    }

    slot('name').textContent = card.short;
    slot('art').replaceWith(artFor(card));
    slot('points').textContent = (card.as_high_as ? 'Up to ' : '') + fmtInt(card.bonus_points) + ' points';
    slot('value').textContent = 'Worth about $' + fmtInt(estValue(card));
    return node;
  }

  fetch('data/cards.json', { cache: 'no-cache' })
    .then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function (data) {
      var picks = pickCards(data.cards || []);
      if (!picks.length) throw new Error('no record-high cards');
      picks.forEach(function (card) { track.appendChild(buildTile(card)); });
      // Let script.js update the arrow buttons now that the tiles are in place.
      track.dispatchEvent(new Event('scroll'));
    })
    .catch(function () {
      section.hidden = true;
    });
})();
