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

/* ─── Scroll Animations (fade-in + slide-up) ─── */
(function () {
  var observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.08, rootMargin: '0px 0px -40px 0px' }
  );

  function observe() {
    document.querySelectorAll('.animate-on-scroll').forEach(function (el) {
      observer.observe(el);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', observe);
  } else {
    observe();
  }
})();

/* ─── Countdown Timer to 2080/12/31 23:59:59 ─── */
(function () {
  var container = document.getElementById('countdown');
  if (!container) return;

  var target = new Date(2080, 11, 31, 23, 59, 59).getTime();

  function pad(n) {
    return n < 10 ? '0' + n : '' + n;
  }

  function render() {
    var now = Date.now();
    var diff = Math.max(0, target - now);

    var secs  = Math.floor(diff / 1000);
    var mins  = Math.floor(secs / 60);
    var hrs   = Math.floor(mins / 60);
    var days  = Math.floor(hrs / 24);
    var years = Math.floor(days / 365.25);

    days  = Math.floor((diff - years * 365.25 * 86400000) / 86400000);
    hrs   = Math.floor((diff % 86400000) / 3600000);
    mins  = Math.floor((diff % 3600000) / 60000);
    secs  = Math.floor((diff % 60000) / 1000);

    container.innerHTML =
      '<div class="unit"><span class="num">' + years + '</span><span class="lbl">Years</span></div>' +
      '<div class="unit"><span class="num">' + days + '</span><span class="lbl">Days</span></div>' +
      '<div class="unit"><span class="num">' + pad(hrs) + '</span><span class="lbl">Hours</span></div>' +
      '<div class="unit"><span class="num">' + pad(mins) + '</span><span class="lbl">Minutes</span></div>' +
      '<div class="unit"><span class="num">' + pad(secs) + '</span><span class="lbl">Seconds</span></div>';
  }

  render();
  setInterval(render, 1000);
})();
