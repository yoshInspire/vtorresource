/* Вторресурс — минимальный клиентский слой.
   Всё содержимое отдаёт сервер; скрипты только улучшают взаимодействие. */
(function () {
  'use strict';

  // ---------- маска телефона -------------------------------------------------
  function formatPhone(raw) {
    var d = raw.replace(/\D/g, '');
    if (d[0] === '8') d = '7' + d.slice(1);
    if (d[0] !== '7') d = '7' + d;
    d = d.slice(0, 11);

    var out = '+7';
    if (d.length > 1) out += ' (' + d.slice(1, 4);
    if (d.length >= 5) out += ') ' + d.slice(4, 7);
    if (d.length >= 8) out += '-' + d.slice(7, 9);
    if (d.length >= 10) out += '-' + d.slice(9, 11);
    return out;
  }

  document.querySelectorAll('[data-phone-mask]').forEach(function (input) {
    input.addEventListener('input', function () {
      var atEnd = input.selectionStart === input.value.length;
      input.value = input.value.replace(/\D/g, '') ? formatPhone(input.value) : '';
      if (atEnd) input.setSelectionRange(input.value.length, input.value.length);
      input.removeAttribute('aria-invalid');
    });
    input.addEventListener('focus', function () {
      if (!input.value) input.value = '+7 (';
    });
    input.addEventListener('blur', function () {
      if (input.value.replace(/\D/g, '').length < 2) input.value = '';
    });
  });

  // ---------- отправка заявки без перезагрузки -------------------------------
  document.querySelectorAll('[data-lead-form]').forEach(function (form) {
    var status = form.querySelector('[data-lead-status]');
    var button = form.querySelector('button[type="submit"]');

    form.addEventListener('submit', function (e) {
      var phone = form.querySelector('input[name="phone"]');
      var digits = phone.value.replace(/\D/g, '');

      if (digits.length < 11) {
        e.preventDefault();
        phone.setAttribute('aria-invalid', 'true');
        phone.focus();
        if (status) { status.textContent = 'Введите номер телефона полностью.'; status.className = 'lead-form__status is-err'; }
        return;
      }

      if (!window.fetch) return; // без fetch уходит обычный POST с редиректом
      e.preventDefault();

      var data = new FormData(form);
      var body = new URLSearchParams();
      data.forEach(function (v, k) { body.append(k, v); });

      button.disabled = true;
      var label = button.querySelector('span');
      var prev = label ? label.textContent : '';
      if (label) label.textContent = 'Отправляем…';

      fetch('/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: body.toString()
      })
        .then(function (r) { return r.json().catch(function () { return { ok: r.ok }; }); })
        .then(function (res) {
          if (res.ok) {
            form.reset();
            if (status) { status.textContent = 'Заявка принята — перезвоним в ближайшее время.'; status.className = 'lead-form__status is-ok'; }
          } else {
            if (status) { status.textContent = res.error || 'Не удалось отправить. Позвоните нам, пожалуйста.'; status.className = 'lead-form__status is-err'; }
          }
        })
        .catch(function () {
          if (status) { status.textContent = 'Нет связи с сервером. Позвоните нам, пожалуйста.'; status.className = 'lead-form__status is-err'; }
        })
        .finally(function () {
          button.disabled = false;
          if (label) label.textContent = prev;
        });
    });
  });

  // ---------- поиск по прайсу -----------------------------------------------
  var search = document.querySelector('[data-price-search]');
  if (search) {
    var rows = Array.prototype.slice.call(document.querySelectorAll('[data-price-row]'));
    var cats = Array.prototype.slice.call(document.querySelectorAll('[data-price-cat]'));
    var groups = Array.prototype.slice.call(document.querySelectorAll('[data-price-group]'));
    var empty = document.querySelector('[data-price-empty]');
    var clear = document.querySelector('[data-price-clear]');
    var timer;

    function apply() {
      var q = search.value.trim().toLowerCase();
      if (clear) clear.hidden = !q;

      if (!q) {
        rows.forEach(function (r) { r.hidden = false; });
        cats.concat(groups).forEach(function (el) { el.hidden = false; });
        if (empty) empty.hidden = true;
        return;
      }

      var words = q.split(/\s+/);
      var found = 0;

      rows.forEach(function (row) {
        var hay = row.getAttribute('data-search');
        var match = words.every(function (w) { return hay.indexOf(w) !== -1; });
        row.hidden = !match;
        if (match) found++;
      });

      cats.forEach(function (cat) {
        cat.hidden = !cat.querySelector('[data-price-row]:not([hidden])');
      });
      groups.forEach(function (g) {
        g.hidden = !g.querySelector('[data-price-cat]:not([hidden])');
      });

      if (empty) empty.hidden = found > 0;
    }

    search.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(apply, 120);
    });
    if (clear) {
      clear.addEventListener('click', function () { search.value = ''; apply(); search.focus(); });
    }
  }

  // ---------- закрытие мобильного меню по клику ------------------------------
  var toggle = document.getElementById('nav-toggle');
  if (toggle) {
    document.querySelectorAll('.nav__link').forEach(function (link) {
      link.addEventListener('click', function () { toggle.checked = false; });
    });
  }
})();
