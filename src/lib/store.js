'use strict';

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const PRICES_FILE = path.join(DATA_DIR, 'prices.json');
const LEADS_FILE = path.join(DATA_DIR, 'leads.json');

/**
 * Хранилище прайса. Сейчас — JSON-файл с атомарной записью и кэшем в памяти.
 * Весь доступ к данным идёт только через этот модуль, поэтому будущая админка
 * (и, при необходимости, переезд на SQLite) не затронет роуты и шаблоны.
 */

let cache = null;
let cacheMtime = 0;

function readPrices() {
  const stat = fs.statSync(PRICES_FILE);
  if (!cache || stat.mtimeMs !== cacheMtime) {
    cache = JSON.parse(fs.readFileSync(PRICES_FILE, 'utf8'));
    cacheMtime = stat.mtimeMs;
  }
  return cache;
}

function writeJson(file, data) {
  const tmp = `${file}.${process.pid}.tmp`;
  // Перевод строки в конце файла: без него каждое сохранение из админки
  // помечается в git как «No newline at end of file». В catalogs.js так же.
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, file);
}

// --- чтение ----------------------------------------------------------------

function getPrices() {
  return readPrices();
}

function getGroup(groupId) {
  return readPrices().groups.find(g => g.id === groupId) || null;
}

function getCategory(groupId, categoryId) {
  const group = getGroup(groupId);
  if (!group) return null;
  return group.categories.find(c => c.id === categoryId) || null;
}

/** Плоский список всех позиций с ссылками на группу и категорию. */
function allItems() {
  const out = [];
  for (const group of readPrices().groups) {
    for (const category of group.categories) {
      for (const item of category.items) {
        out.push({ group, category, item });
      }
    }
  }
  return out;
}

/** Максимальная цена по категории — для блоков «от N ₽/кг» на главной. */
function topPrice(category) {
  return category.items.reduce((max, i) => (i.cash !== null && i.cash > max ? i.cash : max), 0);
}

/** Позиции по списку id — витрина ходовых цен на главной. */
function pickItems(list) {
  const index = new Map();
  for (const { group, category, item } of allItems()) {
    index.set(item.id, { ...item, group, categoryName: category.name, categoryId: category.id });
  }
  return list
    .map(entry => {
      const found = index.get(entry.id);
      return found ? { ...found, title: entry.label || found.title } : null;
    })
    .filter(Boolean);
}

// --- запись (задел под админку) -------------------------------------------

/**
 * Точечное обновление цены позиции.
 * @returns {boolean} true, если позиция найдена и сохранена
 */
function updateItem(groupId, categoryId, itemId, patch) {
  const data = JSON.parse(fs.readFileSync(PRICES_FILE, 'utf8'));
  const group = data.groups.find(g => g.id === groupId);
  const category = group && group.categories.find(c => c.id === categoryId);
  const item = category && category.items.find(i => i.id === itemId);
  if (!item) return false;

  for (const key of ['title', 'note', 'cash', 'cashTo', 'text']) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) item[key] = patch[key];
  }
  data.updatedAt = new Date().toISOString().slice(0, 10);
  writeJson(PRICES_FILE, data);
  cache = null;
  return true;
}

/**
 * Транслитерация в идентификатор позиции: «Лом меди Блеск» -> «lom-medi-blesk».
 * Те же правила, что в scripts/build-prices.js, чтобы id, созданные в админке,
 * не отличались от импортированных.
 */
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

/** Все занятые id позиций: они должны быть уникальны на весь прайс. */
function usedItemIds(data) {
  const ids = new Set();
  for (const group of data.groups) {
    for (const category of group.categories) {
      for (const item of category.items) ids.add(item.id);
    }
  }
  return ids;
}

/**
 * Добавление позиции в категорию.
 * Идентификатор строится из названия и при совпадении дополняется числом.
 * @returns {string|null} id созданной позиции либо null, если категории нет
 */
function addItem(groupId, categoryId, fields) {
  const data = JSON.parse(fs.readFileSync(PRICES_FILE, 'utf8'));
  const group = data.groups.find(g => g.id === groupId);
  const category = group && group.categories.find(c => c.id === categoryId);
  if (!category) return null;

  const taken = usedItemIds(data);
  const base = slugify(fields.title) || 'poziciya';
  let id = base;
  for (let i = 2; taken.has(id); i += 1) id = `${base}-${i}`;

  category.items.push({
    id,
    title: fields.title,
    note: fields.note || null,
    cash: fields.cash === undefined ? null : fields.cash,
    cashTo: fields.cashTo === undefined ? null : fields.cashTo,
    text: fields.text || null
  });

  data.updatedAt = new Date().toISOString().slice(0, 10);
  writeJson(PRICES_FILE, data);
  cache = null;
  return id;
}

/**
 * Удаление позиции.
 * @returns {object|null} удалённая позиция либо null, если её не нашли
 */
function removeItem(groupId, categoryId, itemId) {
  const data = JSON.parse(fs.readFileSync(PRICES_FILE, 'utf8'));
  const group = data.groups.find(g => g.id === groupId);
  const category = group && group.categories.find(c => c.id === categoryId);
  if (!category) return null;

  const index = category.items.findIndex(i => i.id === itemId);
  if (index === -1) return null;

  const [removed] = category.items.splice(index, 1);
  data.updatedAt = new Date().toISOString().slice(0, 10);
  writeJson(PRICES_FILE, data);
  cache = null;
  return removed;
}

/** Полная перезапись прайса (импорт, массовое редактирование). */
function replacePrices(data) {
  data.updatedAt = new Date().toISOString().slice(0, 10);
  writeJson(PRICES_FILE, data);
  cache = null;
}

// --- заявки ----------------------------------------------------------------

function saveLead(lead) {
  let leads = [];
  try {
    leads = JSON.parse(fs.readFileSync(LEADS_FILE, 'utf8'));
  } catch (_) {
    leads = [];
  }
  const record = { id: Date.now().toString(36), createdAt: new Date().toISOString(), ...lead };
  leads.unshift(record);
  writeJson(LEADS_FILE, leads.slice(0, 5000));
  return record;
}

function getLeads(limit = 200) {
  try {
    return JSON.parse(fs.readFileSync(LEADS_FILE, 'utf8')).slice(0, limit);
  } catch (_) {
    return [];
  }
}

module.exports = {
  getPrices,
  getGroup,
  getCategory,
  allItems,
  topPrice,
  pickItems,
  updateItem,
  addItem,
  removeItem,
  slugify,
  replacePrices,
  saveLead,
  getLeads,
  PRICES_FILE,
  LEADS_FILE
};
