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

/**
 * Какие каталоги существуют и как называются в интерфейсе.
 *
 * `flatten` — на каком уровне резать каталог на разделы страницы цен.
 * Уровней в данных два, группа и категория, и осмысленные названия
 * лежат на разных: у радиодеталей это категории («Конденсаторы»,
 * «Реле»), а у драгметаллов группы («Серебро», «Золото»), потому что
 * категории там это подразделы вроде «Контакты», которые сами по себе
 * ничего не говорят и повторяются под разными металлами.
 */
const REGISTRY = [
  { id: 'radio', file: 'radio', title: 'Радиодетали и платы', url: '/radiodetali', flatten: 'category' },
  { id: 'dragmet', file: 'dragmet', title: 'Драгметаллы', url: '/dragmetally', flatten: 'group' }
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
 * Плоский список разделов каталога для страницы цен: заголовок, якорь,
 * колонки цен и позиции. Группы на странице не показываются, как и на
 * основном прайсе, поэтому уровень резки задаётся в REGISTRY.
 *
 * Якорь берём у группы, когда категория в ней одна: на `/radiodetali#platy`
 * ведёт ссылка из подвала, и она не должна протухнуть.
 *
 * @returns {{id: string, title: string, columns: string[]|null, items: object[]}[]}
 */
function sections(catalog, mode) {
  const out = [];

  for (const group of catalog.groups) {
    const columns = (group.columns && group.columns.length) ? group.columns : null;

    if (mode === 'group') {
      out.push({
        id: group.id,
        title: group.title,
        columns,
        items: group.categories.reduce((all, c) => all.concat(c.items), [])
      });
      continue;
    }

    const single = group.categories.length === 1;
    for (const category of group.categories) {
      out.push({
        id: single ? group.id : category.id,
        title: single ? group.title : category.name,
        columns,
        items: category.items
      });
    }
  }

  return out;
}

/**
 * Единицы измерения каталога в том виде, в каком их показывают в цене.
 * Здесь только весовые: по ним считается верхняя цена каталога.
 */
const WEIGHT_UNITS = {
  '1 кг': { label: '₽/кг', perKg: 1 },
  '1 г': { label: '₽/г', perKg: 1000 }
};

/**
 * Верхняя цена каталога для плитки «что принимаем»: «до 590 000 ₽/кг».
 *
 * Считаем только по весовым позициям. Цена за штуку, за контакт и за галету
 * с ценой за килограмм несравнима, и «до 9 700 ₽/шт» рядом с «до 880 ₽/кг»
 * читалось бы как цена за вес. Граммы приводим к килограммам только для
 * сравнения, показываем в исходной единице.
 *
 * Цена в каталоге — строка: встречаются «до 40 000», «38 / 55» и «договорная».
 * Берём наибольшее число из строки, из «договорной» не берём ничего.
 *
 * @returns {{value: number, unit: string}|null}
 */
function topPrice(catalog) {
  let best = null;
  for (const group of catalog.groups) {
    for (const category of group.categories) {
      for (const item of category.items) {
        const unit = WEIGHT_UNITS[item.unit];
        if (!unit) continue;
        const numbers = String(item.price || '').match(/\d+(?:[.,]\d+)?/g);
        if (!numbers) continue;
        const value = Math.max(...numbers.map(n => Number(n.replace(',', '.'))));
        const perKg = value * unit.perKg;
        if (!best || perKg > best.perKg) best = { value, unit: unit.label, perKg };
      }
    }
  }
  return best ? { value: best.value, unit: best.unit } : null;
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
 * Все занятые id категорий. Как и в прайсе, id категории это ещё и якорь
 * на странице каталога (`/radiodetali#kondensatory`), поэтому он уникален
 * на весь каталог.
 */
function usedCategoryIds(data) {
  const ids = new Set();
  for (const group of data.groups) {
    for (const category of group.categories) ids.add(category.id);
  }
  return ids;
}

function freeId(taken, title, fallback) {
  const base = slugify(title) || fallback;
  let id = base;
  for (let i = 2; taken.has(id); i += 1) id = `${base}-${i}`;
  return id;
}

/**
 * Добавление категории в группу каталога. Встаёт в конец: порядок разделов
 * на странице каталога это порядок данных, двигают его из админки.
 * @returns {string|null} id созданной категории либо null, если группы нет
 */
function addCategory(name, groupId, categoryName) {
  const data = draft(name);
  const group = data.groups.find(g => g.id === groupId);
  if (!group) return null;

  const id = freeId(usedCategoryIds(data), categoryName, 'kategoriya');
  group.categories.push({ id, name: categoryName, items: [] });
  save(name, data);
  return id;
}

/**
 * Удаление категории вместе с её позициями.
 * @returns {object|null} удалённая категория либо null, если её не нашли
 */
function removeCategory(name, groupId, categoryId) {
  const data = draft(name);
  const group = data.groups.find(g => g.id === groupId);
  if (!group) return null;

  const index = group.categories.findIndex(c => c.id === categoryId);
  if (index === -1) return null;

  const [removed] = group.categories.splice(index, 1);
  save(name, data);
  return removed;
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
  sections,
  topPrice,
  formatPrice,
  getGroup,
  getCategory,
  addItem,
  removeItem,
  addCategory,
  removeCategory,
  slugify
};
