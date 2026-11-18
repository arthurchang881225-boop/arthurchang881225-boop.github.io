/*
  Site behavior script:
  - remembers the user's theme choice
  - types the homepage greeting
  - reveals content block by block as it scrolls into view
  - home page: 40 summers / 40 winters dots and countdown clock, word-by-word reveal
  - pages the arrow buttons of any .gallery
  - shows old .html addresses as clean ones, and keeps the current page visible in the nav
  - adds the social logos used in footers and on the contact page
*/

/* ─── Theme Toggle ─── */
(function () {
  var STORAGE_KEY = 'theme';
  var html = document.documentElement;

  var saved = localStorage.getItem(STORAGE_KEY);
  if (saved === 'light') html.classList.remove('dark');
  else html.classList.add('dark');

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.theme-toggle');
    if (!btn) return;
    html.classList.toggle('dark');
    localStorage.setItem(STORAGE_KEY, html.classList.contains('dark') ? 'dark' : 'light');
  });
})();

/* ─── Typing Animation ─── */
(function () {
  var el = document.getElementById('typed-heading');
  if (!el) return;

  var text = 'Arthur here.';
  var i = 0;

  function type() {
    if (i <= text.length) {
      el.textContent = text.slice(0, i);
      el.classList.add('typing-cursor');
      i++;
      setTimeout(type, 90);
    } else {
      /* Keep cursor blinking for a moment, then remove */
      setTimeout(function () {
        el.classList.remove('typing-cursor');
      }, 3000);
    }
  }

  /* Start after the page animation settles */
  setTimeout(type, 600);
})();

/* ─── Scroll Reveal ───
   Content appears block by block as it scrolls into view, rather than a whole
   section at once: each block fades in while rising about 48px, and blocks that
   come into view together follow one another.

   What counts as a block: each direct child of a page section (heading, paragraph,
   panel…). Lists and grids (ul, ol, .card-grid, .timeline…) are opened up so each
   item is its own block. Items that scripts add later (credit card and bank
   account lists, the home gallery, referral groups) are picked up as they appear.
   Visitors who ask for reduced motion see everything at once. */
(function () {
  if (!('IntersectionObserver' in window)) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var main = document.querySelector('main');
  if (!main) return;

  // Page sections whose children are revealed one by one.
  var SECTIONS = 'main > section, main section.section-block, main .hero';
  // Containers whose items are revealed one by one instead of all together.
  var ITEM_LISTS = 'ul, ol, .card-grid, .project-grid, .timeline, .contact-grid, .hero-text, .photo-grid';
  var STEP_MS = 90;      // delay between blocks that come into view together
  var MAX_STEPS = 6;     // longest wait, so long lists don't lag
  var DONE_MS = 1400;    // a little longer than the CSS transition
  var loadedAt = Date.now();

  var observer = new IntersectionObserver(function (entries) {
    var shown = entries.filter(function (entry) { return entry.isIntersecting; })
      .map(function (entry) { return entry.target; })
      .sort(function (a, b) { return a.getBoundingClientRect().top - b.getBoundingClientRect().top; });
    shown.forEach(function (node, i) {
      observer.unobserve(node);
      var delay = Math.min(i, MAX_STEPS) * STEP_MS;
      node.style.transitionDelay = delay + 'ms';
      node.classList.add('in-view');
      // Once it has arrived, hand the element back to its own styles (hover effects etc.).
      setTimeout(function () {
        node.classList.remove('reveal');
        node.style.transitionDelay = '';
      }, delay + DONE_MS);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });

  // Hide one block until it scrolls into view. Blocks a script redraws in place
  // (for example after a checker answer) appear straight away instead of fading in again.
  function addBlock(node) {
    if (node.nodeType !== 1 || node.tagName === 'TEMPLATE' || node.tagName === 'SCRIPT') return;
    if (node.classList.contains('reveal') || node.classList.contains('in-view')) return;
    var settled = Date.now() - loadedAt > 1500;
    if (settled && node.getBoundingClientRect().top < window.innerHeight) {
      node.classList.add('in-view');
      return;
    }
    node.classList.add('reveal');
    observer.observe(node);
  }

  // A block, or each item of a list or grid.
  function addChild(node) {
    if (node.nodeType !== 1) return;
    if (node.matches(ITEM_LISTS)) {
      node.setAttribute('data-reveal-items', '');
      Array.prototype.forEach.call(node.children, addBlock);
    } else {
      addBlock(node);
    }
  }

  function addSection(section) {
    if (section.hasAttribute('data-reveal-section')) return;
    section.setAttribute('data-reveal-section', '');
    Array.prototype.forEach.call(section.children, addChild);
  }

  function start() {
    document.querySelectorAll(SECTIONS).forEach(addSection);
    // Elements marked .animate-on-scroll outside any section still get revealed.
    document.querySelectorAll('.animate-on-scroll').forEach(function (node) {
      if (!node.closest('[data-reveal-section]')) addBlock(node);
    });

    // New content drawn by page scripts.
    new MutationObserver(function (mutations) {
      mutations.forEach(function (m) {
        Array.prototype.forEach.call(m.addedNodes, function (node) {
          if (node.nodeType !== 1) return;
          var parent = node.parentNode;
          if (node.matches(SECTIONS)) addSection(node);
          else if (parent && parent.hasAttribute && parent.hasAttribute('data-reveal-items')) addBlock(node);
          else if (parent && parent.hasAttribute && parent.hasAttribute('data-reveal-section')) addChild(node);
        });
      });
    }).observe(main, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();

/* ─── 40 Summers, 40 Winters ───
   One summer (June to August) and one winter (December to February) per year from
   2024 through 2063, ending December 31, 2063. Fills the "left" counts, one dot per
   season, and a live countdown clock. */
(function () {
  var FIRST_YEAR = 2024;
  var LAST_YEAR = 2063;
  var END = new Date(LAST_YEAR, 11, 31, 23, 59, 59);   // December 31, 2063

  var clock = document.getElementById('countdown');
  var grid = document.getElementById('season-grid');
  if (!clock && !grid) return;

  /* Start and end of one season; the last winter is cut off at END */
  function season(kind, year) {
    var start = kind === 'summer' ? new Date(year, 5, 1) : new Date(year, 11, 1);
    var end = kind === 'summer' ? new Date(year, 8, 1) : new Date(year + 1, 2, 1);
    return { start: start, end: end < END ? end : END };
  }

  /* 'spent' once a season is over, 'now' while it is happening, otherwise 'ahead' */
  function seasonState(kind, year, now) {
    var s = season(kind, year);
    if (now >= s.end) return 'spent';
    if (now >= s.start) return 'now';
    return 'ahead';
  }

  function drawSeasons() {
    var now = new Date();
    ['summer', 'winter'].forEach(function (kind) {
      var row = grid.querySelector('[data-season="' + kind + '"]');
      var left = 0;
      row.innerHTML = '';
      for (var year = FIRST_YEAR; year <= LAST_YEAR; year++) {
        var state = seasonState(kind, year, now);
        if (state !== 'spent') left++;
        var dot = document.createElement('span');
        dot.className = 'season-dot ' + kind + ' ' + state;
        dot.style.setProperty('--i', year - FIRST_YEAR);
        dot.title = kind === 'summer' ? 'Summer ' + year : 'Winter ' + year + '–' + String(year + 1).slice(2);
        row.appendChild(dot);
      }
      var count = document.getElementById(kind + 's-left');
      if (count) count.textContent = left;
    });
  }

  /* Whole calendar years, then days, hours, minutes and seconds */
  function timeLeft(now) {
    var years = 0;
    var mark = new Date(now.getTime());
    while (true) {
      var next = new Date(mark.getTime());
      next.setFullYear(next.getFullYear() + 1);
      if (next > END) break;
      mark = next;
      years++;
    }
    var rest = Math.max(0, END - mark);
    return {
      years: years,
      days: Math.floor(rest / 86400000),
      hours: Math.floor((rest % 86400000) / 3600000),
      minutes: Math.floor((rest % 3600000) / 60000),
      seconds: Math.floor((rest % 60000) / 1000)
    };
  }

  function pad(n) {
    return n < 10 ? '0' + n : '' + n;
  }

  function drawClock() {
    var t = timeLeft(new Date());
    clock.innerHTML =
      '<div class="unit"><span class="num">' + t.years + '</span><span class="lbl">Years</span></div>' +
      '<div class="unit"><span class="num">' + t.days + '</span><span class="lbl">Days</span></div>' +
      '<div class="unit"><span class="num">' + pad(t.hours) + '</span><span class="lbl">Hours</span></div>' +
      '<div class="unit"><span class="num">' + pad(t.minutes) + '</span><span class="lbl">Minutes</span></div>' +
      '<div class="unit"><span class="num">' + pad(t.seconds) + '</span><span class="lbl">Seconds</span></div>';
  }

  if (grid) drawSeasons();
  if (clock) {
    drawClock();
    setInterval(drawClock, 1000);
  }
})();

/* ─── Word Reveal ───
   Splits each .reveal-words element into words that light up one by one as the
   element moves up the screen, like a sentence being read. With reduced motion the
   CSS shows every word at once. */
(function () {
  var blocks = document.querySelectorAll('.reveal-words');
  if (!blocks.length) return;

  blocks.forEach(function (block) {
    var words = block.textContent.trim().split(/\s+/);
    block.setAttribute('aria-label', words.join(' '));
    block.textContent = '';
    words.forEach(function (w, i) {
      var span = document.createElement('span');
      span.className = 'word';
      span.setAttribute('aria-hidden', 'true');
      span.textContent = w;
      if (i) block.appendChild(document.createTextNode(' '));
      block.appendChild(span);
    });
  });

  function update() {
    var vh = window.innerHeight;
    blocks.forEach(function (block) {
      var box = block.getBoundingClientRect();
      // 0 when the block's top reaches 85% down the screen, 1 when its bottom reaches 45%.
      var start = vh * 0.85;
      var end = vh * 0.45;
      var progress = (start - box.top) / (start - end + box.height);
      progress = Math.min(1, Math.max(0, progress));
      var words = block.querySelectorAll('.word');
      var lit = Math.round(progress * words.length);
      words.forEach(function (w, i) { w.classList.toggle('lit', i < lit); });
    });
  }

  var queued = false;
  function onScroll() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () { queued = false; update(); });
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  update();
})();

/* ─── Gallery Arrows ───
   The arrow buttons under a .gallery page its track left or right and turn off at
   either end. */
(function () {
  document.querySelectorAll('.gallery').forEach(function (gallery) {
    var track = gallery.querySelector('.gallery-track');
    var prev = gallery.querySelector('[data-dir="-1"]');
    var next = gallery.querySelector('[data-dir="1"]');
    if (!track || !prev || !next) return;

    function updateButtons() {
      var max = track.scrollWidth - track.clientWidth - 2;
      prev.disabled = track.scrollLeft <= 2;
      next.disabled = track.scrollLeft >= max;
    }

    [prev, next].forEach(function (btn) {
      btn.addEventListener('click', function () {
        var dir = Number(btn.getAttribute('data-dir'));
        track.scrollBy({ left: dir * track.clientWidth * 0.8, behavior: 'smooth' });
      });
    });

    track.addEventListener('scroll', updateButtons, { passive: true });
    window.addEventListener('resize', updateButtons);
    updateButtons();
  });
})();

/* ─── Clean Addresses ───
   Old links such as /about.html still work; this shows them as /about in the
   address bar, matching the site's links. */
(function () {
  var path = location.pathname;
  if (!/\.html$/.test(path) || location.protocol === 'file:') return;
  var clean = path.replace(/index\.html$/, '').replace(/\.html$/, '');
  history.replaceState(null, '', clean + location.search + location.hash);
})();

/* ─── Current Page in the Nav ───
   On narrow screens the nav is one row you can swipe; this brings the current
   page's link into view. */
(function () {
  var nav = document.querySelector('nav');
  var active = nav && nav.querySelector('a.active');
  if (!active || nav.scrollWidth <= nav.clientWidth) return;
  nav.scrollLeft = active.offsetLeft - (nav.clientWidth - active.offsetWidth) / 2;
})();

/* ─── Social Icons ───
   Adds the GitHub, LinkedIn, Instagram and Spotify logos to the page as hidden
   SVG symbols, so any <svg class="icon"><use href="#icon-github"></use></svg>
   in the footer or on the contact cards can draw them. Built into the page this
   way, they show whether the site is served or opened straight from disk.
   Icons from Bootstrap Icons v1.11.3 (MIT License, https://icons.getbootstrap.com);
   they draw in currentColor, so they follow the link color in both themes. */
(function () {
  var ICON_PATHS = {
    github: 'M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8',
    linkedin: 'M0 1.146C0 .513.526 0 1.175 0h13.65C15.474 0 16 .513 16 1.146v13.708c0 .633-.526 1.146-1.175 1.146H1.175C.526 16 0 15.487 0 14.854zm4.943 12.248V6.169H2.542v7.225zm-1.2-8.212c.837 0 1.358-.554 1.358-1.248-.015-.709-.52-1.248-1.342-1.248S2.4 3.226 2.4 3.934c0 .694.521 1.248 1.327 1.248zm4.908 8.212V9.359c0-.216.016-.432.08-.586.173-.431.568-.878 1.232-.878.869 0 1.216.662 1.216 1.634v3.865h2.401V9.25c0-2.22-1.184-3.252-2.764-3.252-1.274 0-1.845.7-2.165 1.193v.025h-.016l.016-.025V6.169h-2.4c.03.678 0 7.225 0 7.225z',
    instagram: 'M8 0C5.829 0 5.556.01 4.703.048 3.85.088 3.269.222 2.76.42a3.9 3.9 0 0 0-1.417.923A3.9 3.9 0 0 0 .42 2.76C.222 3.268.087 3.85.048 4.7.01 5.555 0 5.827 0 8.001c0 2.172.01 2.444.048 3.297.04.852.174 1.433.372 1.942.205.526.478.972.923 1.417.444.445.89.719 1.416.923.51.198 1.09.333 1.942.372C5.555 15.99 5.827 16 8 16s2.444-.01 3.298-.048c.851-.04 1.434-.174 1.943-.372a3.9 3.9 0 0 0 1.416-.923c.445-.445.718-.891.923-1.417.197-.509.332-1.09.372-1.942C15.99 10.445 16 10.173 16 8s-.01-2.445-.048-3.299c-.04-.851-.175-1.433-.372-1.941a3.9 3.9 0 0 0-.923-1.417A3.9 3.9 0 0 0 13.24.42c-.51-.198-1.092-.333-1.943-.372C10.443.01 10.172 0 7.998 0zm-.717 1.442h.718c2.136 0 2.389.007 3.232.046.78.035 1.204.166 1.486.275.373.145.64.319.92.599s.453.546.598.92c.11.281.24.705.275 1.485.039.843.047 1.096.047 3.231s-.008 2.389-.047 3.232c-.035.78-.166 1.203-.275 1.485a2.5 2.5 0 0 1-.599.919c-.28.28-.546.453-.92.598-.28.11-.704.24-1.485.276-.843.038-1.096.047-3.232.047s-2.39-.009-3.233-.047c-.78-.036-1.203-.166-1.485-.276a2.5 2.5 0 0 1-.92-.598 2.5 2.5 0 0 1-.6-.92c-.109-.281-.24-.705-.275-1.485-.038-.843-.046-1.096-.046-3.233s.008-2.388.046-3.231c.036-.78.166-1.204.276-1.486.145-.373.319-.64.599-.92s.546-.453.92-.598c.282-.11.705-.24 1.485-.276.738-.034 1.024-.044 2.515-.045zm4.988 1.328a.96.96 0 1 0 0 1.92.96.96 0 0 0 0-1.92m-4.27 1.122a4.109 4.109 0 1 0 0 8.217 4.109 4.109 0 0 0 0-8.217m0 1.441a2.667 2.667 0 1 1 0 5.334 2.667 2.667 0 0 1 0-5.334',
    spotify: 'M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0m3.669 11.538a.5.5 0 0 1-.686.165c-1.879-1.147-4.243-1.407-7.028-.77a.499.499 0 0 1-.222-.973c3.048-.696 5.662-.397 7.77.892a.5.5 0 0 1 .166.686m.979-2.178a.624.624 0 0 1-.858.205c-2.15-1.321-5.428-1.704-7.972-.932a.625.625 0 0 1-.362-1.194c2.905-.881 6.517-.454 8.986 1.063a.624.624 0 0 1 .206.858m.084-2.268C10.154 5.56 5.9 5.419 3.438 6.166a.748.748 0 1 1-.434-1.432c2.825-.857 7.523-.692 10.492 1.07a.747.747 0 1 1-.764 1.288'
  };

  var symbols = Object.keys(ICON_PATHS).map(function (name) {
    return '<symbol id="icon-' + name + '" viewBox="0 0 16 16">' +
      '<path fill="currentColor" d="' + ICON_PATHS[name] + '"/></symbol>';
  }).join('');

  // Zero-size rather than display:none, which stops some browsers drawing <use> copies.
  var sprite = document.createElement('div');
  sprite.setAttribute('aria-hidden', 'true');
  sprite.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
  sprite.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg">' + symbols + '</svg>';
  document.body.insertBefore(sprite, document.body.firstChild);
})();
