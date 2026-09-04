'use strict';

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

/** 818.18 -> «818,18»; 20000 -> «20 000» */
function price(value) {
  if (value === null || value === undefined) return '—';
  const hasCents = Math.round(value * 100) % 100 !== 0;
  return value.toLocaleString('ru-RU', {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2
  });
}

/** Цена позиции с учётом диапазона и текстовых значений («до 40 000»). */
function itemPrice(item) {
  if (item.text) return item.text;
  if (item.cash === null) return 'по запросу';
  if (item.cashTo) return `${price(item.cash)} – ${price(item.cashTo)}`;
  return price(item.cash);
}

/** «2026-09-02» -> «2 сентября 2026» */
function dateLong(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** «2026-09-04T07:12:33.000Z» -> «4 сентября, 12:12» (местное время сервера). */
function dateTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${time}`;
}

/** «79059228555» -> «8 (905) 922-85-55». Для списка заявок в админке. */
function phone(digits) {
  const d = String(digits).replace(/\D/g, '');
  const n = d.length === 11 ? d.slice(1) : d;
  if (n.length !== 10) return digits;
  return `8 (${n.slice(0, 3)}) ${n.slice(3, 6)}-${n.slice(6, 8)}-${n.slice(8)}`;
}

/** Экранирование для вставки в JSON-LD внутри <script>. */
function jsonLd(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}

module.exports = { price, itemPrice, dateLong, dateTime, phone, jsonLd };
