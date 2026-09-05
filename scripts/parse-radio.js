/**
 * Разбирает выгрузки f-vm.ru по радиодеталям и электронному лому
 * в data/radio.json.
 *
 * Запускается разово при обновлении источника:
 *   node scripts/parse-radio.js
 *
 * Структура источника: одна большая таблица, где строка с colspan=5
 * открывает категорию, а обычные строки — позиции.
 * Платы (электронный лом) идут первой категорией: так просил заказчик,
 * их спрашивают чаще всего.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'data', '_source');
const OUT = path.join(__dirname, '..', 'data', 'radio.json');

const MAP = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i',
  й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
  у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '',
  э: 'e', ю: 'yu', я: 'ya'
};

const slug = s => String(s).toLowerCase().split('')
  .map(c => (MAP[c] !== undefined ? MAP[c] : c)).join('')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48).replace(/-$/, '');

const seen = new Set();
const uniq = base => {
  let s = base || 'poz';
  let i = 2;
  while (seen.has(s)) s = `${base}-${i++}`;
  seen.add(s);
  return s;
};

const decode = s => String(s)
  .replace(/&nbsp;|⠀| /g, ' ')
  .replace(/&laquo;/g, '«').replace(/&raquo;/g, '»')
  .replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ')
  .trim();

const strip = html => decode(String(html).replace(/<[^>]*>/g, ' '));

/** Достаёт самую большую таблицу страницы: в ней и лежит прайс. */
function mainTable(html) {
  let best = '';
  let idx = -1;
  while ((idx = html.indexOf('<table', idx + 1)) !== -1) {
    const end = html.indexOf('</table>', idx);
    const chunk = html.slice(idx, end);
    if (chunk.length > best.length) best = chunk;
  }
  return best;
}

/**
 * @returns {{name: string, items: object[]}[]}
 */
function parseTable(html, unitFallback) {
  const table = mainTable(html);
  const rows = table.split(/<tr[^>]*>/i).slice(1);
  const cats = [];
  let current = null;

  for (const row of rows) {
    const cells = row.split(/<\/td>/i).slice(0, -1).map(c => c.replace(/<td[^>]*>/i, ''));
    if (!cells.length) continue;

    // строка-заголовок категории
    if (/colspan\s*=\s*["']?5/i.test(row) || cells.length === 1) {
      const name = strip(cells[0]).replace(/^\d+\.\s*/, '');
      if (name && !/^№$/.test(name)) {
        current = { id: uniq(slug(name)), name, items: [] };
        cats.push(current);
      }
      continue;
    }

    // шапка таблицы
    if (/Наименование/i.test(row) && /Цена/i.test(row)) continue;
    if (cells.length < 3) continue;

    // № | фото | наименование | ед. изм. | цена
    const offset = cells.length >= 5 ? 2 : cells.length - 3;
    const title = strip(cells[offset]);
    const unit = strip(cells[offset + 1]) || unitFallback;
    const priceRaw = strip(cells[offset + 2]);
    if (!title || /^\d+$/.test(title)) continue;

    if (!current) {
      current = { id: uniq(slug('prochee')), name: 'Прочее', items: [] };
      cats.push(current);
    }

    current.items.push({
      id: uniq(slug(title)),
      title,
      unit: unit.replace(/\.$/, ''),
      price: priceRaw
    });
  }

  return cats.filter(c => c.items.length);
}

function read(name) {
  return fs.readFileSync(path.join(SRC, name), 'utf8');
}

/**
 * Электронный лом свёрстан иначе: шесть колонок
 * «Арт | Вид деталей | Требования | Фото | Цена за 1 кг | Цена свыше 100 кг».
 * Требования уходят в примечание, вторая цена — в отдельное поле.
 */
function parseBoards(html) {
  const table = mainTable(html);
  const rows = table.split(/<tr[^>]*>/i).slice(1);
  const items = [];

  for (const row of rows) {
    const cells = row.split(/<\/td>/i).slice(0, -1).map(c => strip(c.replace(/<td[^>]*>/i, '')));
    if (cells.length < 5) continue;
    if (/^Арт/i.test(cells[0])) continue;

    const [, title, note, , price, priceBulk] = cells;
    if (!title) continue;

    items.push({
      id: uniq(slug(title)),
      title,
      note: note || null,
      unit: '1 кг',
      price,
      priceBulk: priceBulk || null
    });
  }

  return [{ id: 'platy-vse', name: 'Платы, срезка и блоки', items }];
}

const boards = parseBoards(read('price_electro-lom_raw.html'));
const radio = parseTable(read('radio_detali_raw.html'), '1 шт');

const data = {
  updatedAt: new Date().toISOString().slice(0, 10),
  note: 'Цены справочные. Позиции принимаются после осмотра и взвешивания на площадке. ' +
        'Редкие и нестандартные позиции оцениваем отдельно, звоните.',
  groups: [
    {
      id: 'platy',
      title: 'Платы и электронный лом',
      short: 'Платы',
      description: 'Печатные платы, срезка с плат и блоки электроники. Цена зависит от насыщенности платы и наличия позолоты. От 100 кг цена выше.',
      columns: ['Цена за 1 кг', 'От 100 кг'],
      categories: boards
    },
    {
      id: 'radiodetali',
      title: 'Радиодетали',
      short: 'Радиодетали',
      description: 'Конденсаторы, разъёмы, транзисторы, микросхемы, резисторы, переключатели и реле советского выпуска.',
      categories: radio
    }
  ]
};

fs.writeFileSync(OUT, JSON.stringify(data, null, 2) + '\n', 'utf8');

const count = g => g.categories.reduce((a, c) => a + c.items.length, 0);
console.log(data.groups.map(g => `${g.id}: ${g.categories.length} категорий, ${count(g)} позиций`).join('\n'));
