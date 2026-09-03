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

  // ---------- калькулятор суммы ---------------------------------------------
  // Цены приходят из data/prices.json через <script type="application/json">,
  // чтобы источник цифр был один и тот же для сервера и клиента.
  var calc = document.querySelector('[data-calc]');
  var calcData = document.getElementById('calc-data');

  if (calc && calcData) {
    var items = [];
    try { items = JSON.parse(calcData.textContent); } catch (e) { items = []; }

    var selItem = calc.querySelector('[data-calc-item]');
    var inpWeight = calc.querySelector('[data-calc-weight]');
    var selUnit = calc.querySelector('[data-calc-unit]');
    var outSum = calc.querySelector('[data-calc-sum]');
    var outBreak = calc.querySelector('[data-calc-breakdown]');

    var byId = {};
    items.forEach(function (i) { byId[i.id] = i; });

    function money(n) {
      return n.toLocaleString('ru-RU', { maximumFractionDigits: 0 });
    }

    function recalc() {
      var item = byId[selItem.value];
      var weight = parseFloat(String(inpWeight.value).replace(',', '.'));

      if (!item || !isFinite(weight) || weight <= 0) {
        outSum.textContent = '—';
        outBreak.textContent = 'Укажите вес, чтобы увидеть сумму.';
        return;
      }

      // Чёрный лом в прайсе идёт за тонну, цветной — за килограмм.
      // Приводим введённый вес к единице измерения позиции.
      var kg = selUnit.value === 't' ? weight * 1000 : weight;
      var qty = item.perTonne ? kg / 1000 : kg;
      var sum = qty * item.price;

      outSum.innerHTML = money(sum) + '<span class="calc__sum-unit">₽</span>';

      var qtyLabel = item.perTonne
        ? qty.toLocaleString('ru-RU', { maximumFractionDigits: 3 }) + ' т'
        : money(qty) + ' кг';
      outBreak.innerHTML = qtyLabel + ' × <b>' + money(item.price) + ' ' + item.unit + '</b>';
    }

    [selItem, inpWeight, selUnit].forEach(function (el) {
      if (!el) return;
      el.addEventListener('input', recalc);
      el.addEventListener('change', recalc);
    });
    recalc();
  }

  // ---------- карта по клику -------------------------------------------------
  // Iframe Яндекса ставит сторонние куки, поэтому вставляем его только после
  // явного согласия — это то, что заявлено в политике обработки данных.
  var mapBox = document.querySelector('[data-map]');
  var mapBtn = document.querySelector('[data-map-load]');

  if (mapBox && mapBtn) {
    mapBtn.addEventListener('click', function () {
      var frame = document.createElement('iframe');
      frame.className = 'map__frame';
      frame.src = mapBox.getAttribute('data-map-src');
      frame.title = mapBox.getAttribute('data-map-title');
      frame.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');
      frame.setAttribute('loading', 'lazy');
      mapBox.replaceWith(frame);
    });
  }

  // ---------- закрытие мобильного меню по клику ------------------------------
  var toggle = document.getElementById('nav-toggle');
  if (toggle) {
    document.querySelectorAll('.nav__link').forEach(function (link) {
      link.addEventListener('click', function () { toggle.checked = false; });
    });
  }
})();
