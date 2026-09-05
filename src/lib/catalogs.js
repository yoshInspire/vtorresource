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
 * к числу значило бы терять смысл. По той же причине единица измерения
 * хранится у каждой позиции, а не у группы: в одной таблице соседствуют
 * цены за грамм, за штуку и за килограмм.
 */

const DATA_DIR = path.join(__dirname, '..', '..', 'data');

/** Какие каталоги существуют и как называются в интерфейсе. */
const REGISTRY = [
  { id: 'radio', file: 'radio', title: 'Радиодетали и платы', url: '/radiodetali' },
  { id: 'dragmet', file: 'dragmet', title: 'Драгметаллы', url: '/dragmetally' }
];

const cache = new Map();

function fileOf(name) {
  const entry = REGISTRY.find(c => c.id === name);
  if (!entry) throw new Error(`Неизвестный каталог: ${name}`);
  return path.join(DATA_DIR, `${entry.file}.json`);
}

function load(name) {
  const file = fileOf(name);
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

// --- запись ------------------------------------------------------------------

/** Запись через временный файл: при обрыве не останется половины каталога. */
function writeJson(file, data) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, file);
}

function save(name, data) {
  data.updatedAt = new Date().toISOString().slice(0, 10);
  writeJson(fileOf(name), data);
  cache.delete(name);
}

/** Свежая копия каталога для правки: кэш отдаёт общий объект, его менять нельзя. */
function draft(name) {
  return JSON.parse(fs.readFileSync(fileOf(name), 'utf8'));
}

function getGroup(name, groupId) {
  return load(name).groups.find(g => g.id === groupId) || null;
}

function getCategory(name, groupId, categoryId) {
  const group = getGroup(name, groupId);
  if (!group) return null;
  return group.categories.find(c => c.id === categoryId) || null;
}

const TRANSLIT = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i',
  й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
  у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '',
  э: 'e', ю: 'yu', я: 'ya'
};

function slugify(text) {
  return String(text)
    .toLowerCase()
    .split('')
    .map(c => (TRANSLIT[c] !== undefined ? TRANSLIT[c] : c))
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)
    .replace(/-$/, '');
}

function usedIds(data) {
  const ids = new Set();
  for (const group of data.groups) {
    for (const category of group.categories) {
      for (const item of category.items) ids.add(item.id);
    }
  }
  return ids;
}

/**
 * Добавление позиции.
 * @returns {string|null} id созданной позиции либо null, если категории нет
 */
function addItem(name, groupId, categoryId, fields) {
  const data = draft(name);
  const group = data.groups.find(g => g.id === groupId);
  const category = group && group.categories.find(c => c.id === categoryId);
  if (!category) return null;

  const taken = usedIds(data);
  const base = slugify(fields.title) || 'poziciya';
  let id = base;
  for (let i = 2; taken.has(id); i += 1) id = `${base}-${i}`;

  const item = {
    id,
    title: fields.title,
    unit: fields.unit || '1 кг',
    price: fields.price || 'договорная',
    note: fields.note || null
  };
  // Вторая цена есть только у плат, у остальных групп её быть не должно
  if (group.columns && group.columns[1]) item.priceBulk = fields.priceBulk || null;

  category.items.push(item);
  save(name, data);
  return id;
}

/**
 * Удаление позиции.
 * @returns {object|null} удалённая позиция либо null, если её не нашли
 */
function removeItem(name, groupId, categoryId, itemId) {
  const data = draft(name);
  const group = data.groups.find(g => g.id === groupId);
  const category = group && group.categories.find(c => c.id === categoryId);
  if (!category) return null;

  const index = category.items.findIndex(i => i.id === itemId);
  if (index === -1) return null;

  const [removed] = category.items.splice(index, 1);
  save(name, data);
  return removed;
}

module.exports = {
  REGISTRY,
  load,
  draft,
  save,
  countItems,
  formatPrice,
  getGroup,
  getCategory,
  addItem,
  removeItem,
  slugify
};
