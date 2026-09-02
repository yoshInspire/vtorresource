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
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
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

  for (const key of ['title', 'note', 'cash', 'cashTo', 'bank', 'text']) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) item[key] = patch[key];
  }
  data.updatedAt = new Date().toISOString().slice(0, 10);
  writeJson(PRICES_FILE, data);
  cache = null;
  return true;
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
  replacePrices,
  saveLead,
  getLeads,
  PRICES_FILE,
  LEADS_FILE
};
