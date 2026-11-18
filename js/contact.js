/*
  Contact form script
  -------------------
  Sends the contact form to Formspree in the background (the form's action is the
  Formspree endpoint), so the visitor stays on the page and sees the result under
  the button. Formspree emails each message to Arthur; replying to that email
  answers the visitor, because the form has an "email" field.
  Without JavaScript the form still works: the browser posts it to Formspree,
  which shows its own thank-you page.
*/

(function () {
  'use strict';

  var form = document.getElementById('contact-form');
  if (!form || !window.fetch || !window.FormData) return;

  var status = document.getElementById('contact-status');
  var button = form.querySelector('button[type="submit"]');

  function showStatus(text, isError) {
    status.textContent = text;
    status.classList.toggle('is-error', Boolean(isError));
    status.hidden = false;
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    button.disabled = true;
    button.textContent = tx('Sending…');
    status.hidden = true;

    fetch(form.action, {
      method: 'POST',
      body: new FormData(form),
      headers: { Accept: 'application/json' }
    }).then(function (res) {
      if (res.ok) {
        form.reset();
        showStatus(tx("Thanks! Your message is on its way, and I'll reply by email."));
        return;
      }
      // Formspree explains what went wrong (for example an invalid email) in JSON.
      return res.json().catch(function () { return {}; }).then(function (body) {
        var reasons = (body.errors || []).map(function (e) { return e.message; }).filter(Boolean);
        showStatus(reasons.length ? reasons.join(' ') : tx('Sorry, the message could not be sent. Please try again.'), true);
      });
    }).catch(function () {
      showStatus(tx('Sorry, the message could not be sent. Check your connection and try again.'), true);
    }).then(function () {
      button.disabled = false;
      button.textContent = tx('Send message');
    });
  });
})();
