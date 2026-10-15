// Krisha Solutions website behaviour: navigation, reveal animations,
// enquiry form and analytics events. No dependencies.
(function () {
  'use strict';

  var doc = document;
  var analytics = window.KS_ANALYTICS || {};

  function track(eventName, params) {
    if (typeof window.gtag === 'function') window.gtag('event', eventName, params || {});
  }

  // ---------- Time-limited offer ----------
  // Elements with data-offer-ends="YYYY-MM-DD" disappear after that day (Nairobi time);
  // [data-offer-ended] notices appear in their place.
  var offerEls = doc.querySelectorAll('[data-offer-ends]');
  for (var o = 0; o < offerEls.length; o++) {
    var ends = new Date(offerEls[o].getAttribute('data-offer-ends') + 'T23:59:59+03:00');
    if (!isNaN(ends) && Date.now() > ends.getTime()) {
      offerEls[o].hidden = true;
      offerEls[o].setAttribute('data-offer-over', '');
      doc.querySelectorAll('[data-offer-ended]').forEach(function (el) { el.hidden = false; });
    }
  }

  // ---------- Header shadow on scroll ----------
  var header = doc.querySelector('[data-header]');
  if (header) {
    var onScroll = function () { header.classList.toggle('is-scrolled', window.scrollY > 4); };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  // ---------- Mobile navigation ----------
  var nav = doc.querySelector('[data-nav]');
  var navToggle = doc.querySelector('[data-nav-toggle]');
  var mobileQuery = window.matchMedia('(max-width: 1020px)');

  function setNav(open) {
    if (!nav || !navToggle) return;
    nav.classList.toggle('is-open', open);
    navToggle.setAttribute('aria-expanded', String(open));
    doc.body.classList.toggle('nav-open', open);
  }

  if (navToggle) {
    navToggle.addEventListener('click', function () {
      setNav(navToggle.getAttribute('aria-expanded') !== 'true');
    });
    mobileQuery.addEventListener('change', function (e) { if (!e.matches) setNav(false); });
  }

  // ---------- Services dropdown ----------
  var subItems = doc.querySelectorAll('[data-sub]');
  function setSub(item, open) {
    item.classList.toggle('is-open', open);
    var button = item.querySelector('[data-sub-toggle]');
    if (button) button.setAttribute('aria-expanded', String(open));
  }

  subItems.forEach(function (item) {
    var button = item.querySelector('[data-sub-toggle]');
    var closeTimer;
    button.addEventListener('click', function () {
      setSub(item, !item.classList.contains('is-open'));
    });
    item.addEventListener('mouseenter', function () {
      if (mobileQuery.matches) return;
      clearTimeout(closeTimer);
      setSub(item, true);
    });
    item.addEventListener('mouseleave', function () {
      if (mobileQuery.matches) return;
      closeTimer = setTimeout(function () { setSub(item, false); }, 150);
    });
    item.addEventListener('focusout', function (e) {
      if (!mobileQuery.matches && !item.contains(e.relatedTarget)) setSub(item, false);
    });
  });

  doc.addEventListener('click', function (e) {
    subItems.forEach(function (item) {
      if (!mobileQuery.matches && !item.contains(e.target)) setSub(item, false);
    });
  });

  doc.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    subItems.forEach(function (item) {
      if (item.classList.contains('is-open')) {
        setSub(item, false);
        item.querySelector('[data-sub-toggle]').focus();
      }
    });
    if (nav && nav.classList.contains('is-open')) {
      setNav(false);
      navToggle.focus();
    }
  });

  // ---------- Reveal on scroll ----------
  var revealEls = doc.querySelectorAll('[data-reveal]');
  if ('IntersectionObserver' in window && revealEls.length) {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    revealEls.forEach(function (el) { observer.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('is-visible'); });
  }

  // ---------- Contact click tracking ----------
  doc.addEventListener('click', function (e) {
    var link = e.target.closest('[data-track]');
    if (!link) return;
    var type = link.getAttribute('data-track');
    track(type === 'whatsapp' ? 'whatsapp_click' : 'contact_click', {
      method: type,
      link_url: link.href,
      page_path: location.pathname,
    });
    // Google Ads conversion for WhatsApp, email and phone clicks.
    if (analytics.adsId && analytics.contactLabel) {
      track('conversion', { send_to: analytics.adsId + '/' + analytics.contactLabel });
    }
  });

  // ---------- Lead conversion on the thank-you page ----------
  if (doc.body.hasAttribute('data-conversion')) {
    track('generate_lead', { method: 'enquiry_form' });
    if (analytics.adsId && analytics.leadLabel) {
      track('conversion', { send_to: analytics.adsId + '/' + analytics.leadLabel });
    }
  }

  // ---------- Enquiry form ----------
  var form = doc.querySelector('[data-enquiry-form]');
  if (!form) return;

  form.noValidate = true;
  var started = form.querySelector('[data-form-started]');
  if (started) started.value = String(Date.now());

  var statusBox = form.querySelector('[data-form-status]');
  var submitBtn = form.querySelector('[data-submit]');
  var submitLabel = form.querySelector('[data-submit-label]');

  // Pre-select a service from the link, e.g. /contact/?service=krishasure
  var params = new URLSearchParams(location.search);
  var serviceSelect = form.elements.service;
  var wanted = params.get('service') || form.getAttribute('data-default-service');
  if (wanted && serviceSelect) {
    for (var i = 0; i < serviceSelect.options.length; i++) {
      if (serviceSelect.options[i].value === wanted) serviceSelect.value = wanted;
    }
  }

  var whatsappLink = doc.createElement('a');
  whatsappLink.href = form.getAttribute('data-whatsapp') || '';
  var whatsappHint = whatsappLink.href
    ? ' You can also reach us on <a href="' + whatsappLink.href + '" target="_blank" rel="noopener" data-track="whatsapp">WhatsApp</a>.'
    : '';

  function showStatus(html) {
    statusBox.innerHTML = html;
    statusBox.hidden = false;
  }

  function clearErrors() {
    statusBox.hidden = true;
    statusBox.innerHTML = '';
    form.querySelectorAll('.field.has-error').forEach(function (f) { f.classList.remove('has-error'); });
    form.querySelectorAll('[data-error-for]').forEach(function (p) { p.textContent = ''; });
    form.querySelectorAll('[aria-invalid]').forEach(function (el) { el.removeAttribute('aria-invalid'); });
  }

  function setFieldError(name, message) {
    var target = form.querySelector('[data-error-for="' + name + '"]');
    var input = form.elements[name];
    if (target) target.textContent = message;
    if (input) {
      input.setAttribute('aria-invalid', 'true');
      var field = input.closest('.field');
      if (field) field.classList.add('has-error');
    }
  }

  function validate() {
    var errors = {};
    var value = function (name) { return (form.elements[name].value || '').trim(); };

    if (value('name').length < 2) errors.name = 'Please enter your name.';
    if (!value('company')) errors.company = 'Please enter your company name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value('email'))) errors.email = 'Please enter a valid email address.';
    if (!/^\+?[0-9\s()\-]{7,20}$/.test(value('phone'))) errors.phone = 'Please enter a valid phone number.';
    if (!value('service')) errors.service = 'Please choose the service you need.';
    if (value('message').length < 10) errors.message = 'Please tell us a little more (at least 10 characters).';
    if (!form.elements.consent.checked) errors.consent = 'Please confirm that we may use your details to respond.';
    return errors;
  }

  function showErrors(errors) {
    var names = Object.keys(errors);
    names.forEach(function (name) { setFieldError(name, errors[name]); });
    if (names.length) {
      var first = form.elements[names[0]];
      if (first && first.focus) first.focus();
    }
    return names.length;
  }

  function setLoading(loading) {
    submitBtn.disabled = loading;
    submitLabel.textContent = loading ? 'Sending…' : 'Send Enquiry';
    var spinner = submitBtn.querySelector('.spinner');
    if (loading && !spinner) {
      spinner = doc.createElement('span');
      spinner.className = 'spinner';
      spinner.setAttribute('aria-hidden', 'true');
      submitBtn.insertBefore(spinner, submitLabel);
    } else if (!loading && spinner) {
      spinner.remove();
    }
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    clearErrors();

    if (showErrors(validate())) {
      showStatus('Please check the highlighted fields.');
      return;
    }

    setLoading(true);
    fetch(form.action, {
      method: 'POST',
      body: new FormData(form),
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
    })
      .then(function (response) {
        return response.json().catch(function () { return { ok: false }; }).then(function (data) {
          return { status: response.status, data: data };
        });
      })
      .then(function (result) {
        if (result.data && result.data.ok) {
          track('form_submit', { form: 'enquiry' });
          window.location.href = '/contact/thank-you/';
          return;
        }
        setLoading(false);
        var data = result.data || {};
        if (data.errors && showErrors(data.errors)) {
          showStatus(escapeText(data.message || 'Please check the highlighted fields.'));
        } else {
          showStatus(escapeText(data.message || 'Sorry, something went wrong and your message was not sent.') + whatsappHint);
        }
      })
      .catch(function () {
        setLoading(false);
        showStatus('Sorry, we could not send your message. Please check your connection and try again.' + whatsappHint);
      });
  });

  function escapeText(text) {
    var div = doc.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
})();
