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

  // ---------- калькулятор суммы ---------------------------------------------
  // Цены приходят из data/prices.json через <script type="application/json">,
  // чтобы источник цифр был один и тот же для сервера и клиента.
  var calc = document.querySelector('[data-calc]');
  var calcData = document.getElementById('calc-data');

  if (calc && calcData) {
    var items = [];
    try { items = JSON.parse(calcData.textContent); } catch (e) { items = []; }

    var pick = calc.querySelector('[data-calc-pick]');
    var input = calc.querySelector('[data-calc-input]');
    var list = calc.querySelector('[data-calc-list]');
    var inpWeight = calc.querySelector('[data-calc-weight]');
    var selUnit = calc.querySelector('[data-calc-unit]');
    var outSum = calc.querySelector('[data-calc-sum]');

    var MAX_OPTIONS = 60;   // длиннее списка никто не листает
    var selected = null;    // позиция, по которой считаем
    var shown = [];         // что сейчас в подсказках
    var active = -1;        // подсвеченная строка

    // Регистр и «ё» в поиске мешать не должны: пишут и «Алюминий»,
    // и «алюминий», и «жёлтый» через «е».
    function norm(text) {
      return String(text).toLowerCase().replace(/ё/g, 'е').trim();
    }

    items.forEach(function (item) {
      item._search = norm(item.title + ' ' + item.category);
    });

    function money(n) {
      return n.toLocaleString('ru-RU', { maximumFractionDigits: 0 });
    }

    function label(item) {
      return item.title + ' · ' + item.priceLabel;
    }

    /**
     * Подсказки под полем.
     * Пустой запрос — ходовые позиции сверху, за ними остальной прайс.
     * Есть запрос — сначала те, где совпадение попало на начало слова,
     * потом те, где оно встретилось в середине названия.
     */
    function match(query) {
      var q = norm(query);

      if (!q) {
        return items.slice().sort(function (a, b) {
          if (a.rank !== null && b.rank !== null) return a.rank - b.rank;
          if (a.rank !== null) return -1;
          if (b.rank !== null) return 1;
          return 0;
        }).slice(0, MAX_OPTIONS);
      }

      var hits = [];
      items.forEach(function (item) {
        var at = item._search.indexOf(q);
        if (at === -1) return;
        var atWordStart = at === 0 || /[^a-zа-я0-9]/.test(item._search.charAt(at - 1));
        hits.push({ item: item, weight: (atWordStart ? 0 : 1000) + at });
      });
      hits.sort(function (a, b) { return a.weight - b.weight; });
      return hits.slice(0, MAX_OPTIONS).map(function (h) { return h.item; });
    }

    function render(query) {
      shown = match(query);
      active = -1;
      list.textContent = '';

      if (!shown.length) {
        var empty = document.createElement('li');
        empty.className = 'calc__empty';
        empty.textContent = 'Ничего не нашли. Позвоните, посчитаем по телефону.';
        list.appendChild(empty);
        return;
      }

      shown.forEach(function (item, i) {
        var option = document.createElement('li');
        option.className = 'calc__option';
        option.id = 'calc-option-' + i;
        option.setAttribute('role', 'option');
        option.setAttribute('aria-selected', selected && selected.id === item.id ? 'true' : 'false');
        option.setAttribute('data-id', item.id);

        var name = document.createElement('span');
        name.className = 'calc__option-name';
        name.textContent = item.title;

        var category = document.createElement('span');
        category.className = 'calc__option-cat';
        category.textContent = item.category;
        name.appendChild(category);

        var price = document.createElement('span');
        price.className = 'calc__option-price';
        price.textContent = item.priceLabel;

        option.appendChild(name);
        option.appendChild(price);
        list.appendChild(option);
      });
    }

    function open(query) {
      render(query === undefined ? input.value : query);
      list.hidden = false;
      input.setAttribute('aria-expanded', 'true');
    }

    function close() {
      list.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
      active = -1;
    }

    function highlight(index) {
      var options = list.querySelectorAll('.calc__option');
      if (!options.length) return;
      if (index < 0) index = options.length - 1;
      if (index >= options.length) index = 0;

      options.forEach(function (el) { el.classList.remove('is-active'); });
      options[index].classList.add('is-active');
      options[index].scrollIntoView({ block: 'nearest' });
      input.setAttribute('aria-activedescendant', options[index].id);
      active = index;
    }

    function select(item) {
      selected = item;
      input.value = label(item);
      close();
      recalc();
    }

    function recalc() {
      var weight = parseFloat(String(inpWeight.value).replace(',', '.'));

      if (!selected || !isFinite(weight) || weight <= 0) {
        outSum.textContent = '—';
        return;
      }

      // Чёрный лом в прайсе идёт за тонну, цветной — за килограмм.
      // Приводим введённый вес к единице измерения позиции.
      var kg = selUnit.value === 't' ? weight * 1000 : weight;
      var qty = selected.perTonne ? kg / 1000 : kg;

      // Заказчик просил оставить в результате одну цифру: разбор
      // «10 кг × 900 ₽/кг» с блока убран вместе с остальными пояснениями.
      outSum.innerHTML = money(qty * selected.price) + '<span class="calc__sum-unit">₽</span>';
    }

    if (items.length) {
      // По умолчанию первая ходовая позиция, а не первая строка прайса:
      // прайс начинается с чёрного лома, а его считают тоннами.
      selected = items.filter(function (i) { return i.rank !== null; })[0] || items[0];
      input.value = label(selected);
    }

    input.addEventListener('focus', function () { input.select(); open(''); });
    input.addEventListener('click', function () { if (list.hidden) open(''); });
    input.addEventListener('input', function () { open(input.value); });

    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (list.hidden) { open(input.value); highlight(0); return; }
        highlight(active + (e.key === 'ArrowDown' ? 1 : -1));
        return;
      }
      if (e.key === 'Enter' && !list.hidden && active >= 0 && shown[active]) {
        e.preventDefault();
        select(shown[active]);
        return;
      }
      if (e.key === 'Escape' && !list.hidden) {
        e.preventDefault();
        close();
        if (selected) input.value = label(selected);
      }
    });

    // mousedown, а не click: click приходит уже после blur, и к этому моменту
    // поле успевает вернуть прежнее название.
    list.addEventListener('mousedown', function (e) {
      var option = e.target.closest('.calc__option');
      if (!option) return;
      e.preventDefault();
      var id = option.getAttribute('data-id');
      var item = items.filter(function (i) { return i.id === id; })[0];
      if (item) select(item);
    });

    // Недописанный запрос в поле оставаться не должен: возвращаем название
    // той позиции, по которой на самом деле посчитано.
    input.addEventListener('blur', function () {
      close();
      if (selected) input.value = label(selected);
    });

    document.addEventListener('click', function (e) {
      if (pick && !pick.contains(e.target)) close();
    });

    [inpWeight, selUnit].forEach(function (el) {
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
