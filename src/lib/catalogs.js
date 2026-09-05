'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Каталоги, которые не входят в основной прайс: радиодетали с платами
 * и драгметаллы.
 *
 * Формат отличается от data/prices.json намеренно. Там цена это число,
 * потому что по ней считает калькулятор. Здесь цена — строка: в источнике
 * встречаются «38 / 55», «до 40 000» и «договорная», и приводить это
 * к числу значило бы терять смысл.
 *
 * ⚠️ Через админку эти каталоги пока не правятся, см. docs/TODO.md.
 */

const DATA_DIR = path.join(__dirname, '..', '..', 'data');

const cache = new Map();

function load(name) {
  const file = path.join(DATA_DIR, `${name}.json`);
  const stat = fs.statSync(file);
  const hit = cache.get(name);
  if (!hit || hit.mtime !== stat.mtimeMs) {
    cache.set(name, { mtime: stat.mtimeMs, data: JSON.parse(fs.readFileSync(file, 'utf8')) });
  }
  return cache.get(name).data;
}

/** Сколько всего позиций в каталоге. */
function countItems(catalog) {
  return catalog.groups.reduce(
    (total, group) => total + group.categories.reduce((n, c) => n + c.items.length, 0),
    0
  );
}

/**
 * «102000» -> «102 000», «38 / 55» -> «38 / 55», «договорная» -> как есть.
 * Разделяем разряды только там, где цена это одно число.
 */
function formatPrice(raw) {
  const value = String(raw || '').trim();
  if (!value) return 'по запросу';
  if (/^\d+([.,]\d+)?$/.test(value)) {
    const n = Number(value.replace(',', '.'));
    return n.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
  }
  // «до 40000» и подобное: разделяем только само число
  return value.replace(/\d{4,}/g, m => Number(m).toLocaleString('ru-RU'));
}

module.exports = { load, countItems, formatPrice };
