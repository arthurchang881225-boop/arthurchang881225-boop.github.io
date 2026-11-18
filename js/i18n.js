/*
  Language support: English (default) and Traditional Chinese (Taiwan)
  --------------------------------------------------------------------
  Loaded in <head> on every page, right after js/i18n-zh-tw.js (the Chinese text).

  Choosing the language
    1. ?lang=zh-TW or ?lang=en in the address (saved for later visits)
    2. the visitor's earlier choice from the header switch (saved in the browser)
    3. otherwise Chinese for browsers set to Traditional Chinese, else English

  Text in the HTML, applied by I18N.apply() (script.js calls it first):
    data-i18n="key"             replaces the element's text
    data-i18n-html="key"        replaces its HTML (for text with links or bold)
    data-i18n-attr="attr:key"   replaces attributes; several as "a:key1;b:key2"
  The keys and their Chinese text live in js/i18n-zh-tw.js under "html".

  Text built by scripts: I18N.t('English text with {n}', { n: 3 }) returns the
  Chinese for that exact English wording (from "js" in js/i18n-zh-tw.js), or the
  English when there is none, with {placeholders} filled in. So English pages
  never depend on the dictionary, and a missing translation shows English.

  Offer details that come from the weekly data files (card and bank names, steps,
  eligibility, notes) stay in English by design.
*/

(function () {
  'use strict';

  var STORAGE_KEY = 'lang';
  var ZH = 'zh-TW';
  var html = document.documentElement;
  var dict = window.I18N_ZH_TW || { html: {}, js: {} };

  function saved() {
    try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
  }

  function save(lang) {
    try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) { /* private mode: not remembered */ }
  }

  function pickLanguage() {
    var match = /[?&]lang=([a-zA-Z-]+)/.exec(window.location.search);
    if (match) {
      var asked = /^zh/i.test(match[1]) ? ZH : 'en';
      save(asked);
      return asked;
    }
    var stored = saved();
    if (stored === ZH || stored === 'en') return stored;
    var prefs = navigator.languages || [navigator.language || ''];
    for (var i = 0; i < prefs.length; i++) {
      if (/^zh-(TW|HK|MO|Hant)/i.test(prefs[i])) return ZH;
      if (/^(en|zh)/i.test(prefs[i])) return 'en';
    }
    return 'en';
  }

  var lang = pickLanguage();
  var isZh = lang === ZH;
  html.lang = isZh ? 'zh-Hant-TW' : 'en';
  // Hide the page for a moment while the Chinese text goes in, so English doesn't flash.
  if (isZh) {
    html.classList.add('i18n-wait');
    setTimeout(function () { html.classList.remove('i18n-wait'); }, 1500); // never stay hidden
  }

  function fillIn(text, vars) {
    if (!vars) return text;
    return text.replace(/\{(\w+)\}/g, function (all, name) {
      return Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : all;
    });
  }

  // Text for scripts: the English wording is the key.
  function t(english, vars) {
    var text = isZh && dict.js[english] != null ? dict.js[english] : english;
    return fillIn(text, vars);
  }

  // Text in the HTML: replace marked elements inside root (and inside its templates).
  function apply(root) {
    root = root || document;
    if (isZh) {
      root.querySelectorAll('[data-i18n]').forEach(function (node) {
        var text = dict.html[node.getAttribute('data-i18n')];
        if (text != null) node.textContent = text;
      });
      root.querySelectorAll('[data-i18n-html]').forEach(function (node) {
        var text = dict.html[node.getAttribute('data-i18n-html')];
        if (text != null) node.innerHTML = text; // our own dictionary, never visitor input
      });
      root.querySelectorAll('[data-i18n-attr]').forEach(function (node) {
        node.getAttribute('data-i18n-attr').split(';').forEach(function (pair) {
          var parts = pair.split(':');
          var text = dict.html[(parts[1] || '').trim()];
          if (parts[0] && text != null) node.setAttribute(parts[0].trim(), text);
        });
      });
      root.querySelectorAll('template').forEach(function (tpl) { apply(tpl.content); });
    }
    if (root === document) html.classList.remove('i18n-wait');
  }

  // Header switch: shows the other language and reloads the page in it.
  function bindSwitch() {
    document.querySelectorAll('.lang-toggle').forEach(function (btn) {
      btn.textContent = isZh ? 'EN' : '中文';
      btn.setAttribute('lang', isZh ? 'en' : 'zh-Hant-TW');
      btn.setAttribute('aria-label', isZh ? 'Switch to English' : '切換為繁體中文');
      btn.addEventListener('click', function () {
        save(isZh ? 'en' : ZH);
        // Drop ?lang= from the address so the saved choice applies.
        var url = window.location.pathname + window.location.search.replace(/([?&])lang=[^&]*&?/, '$1').replace(/[?&]$/, '') + window.location.hash;
        window.location.replace(url);
      });
    });
  }

  window.I18N = {
    lang: lang,
    isZh: isZh,
    locale: isZh ? 'zh-TW' : 'en-US', // for dates
    t: t,
    apply: function (root) {
      apply(root);
      if (!root || root === document) bindSwitch();
    }
  };
})();
