/**
 * Собирает data/prices.json из выгрузок data/_source/*.json.
 * Запускается один раз при первичном наполнении; дальше прайс правится через админку.
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'data', '_source');
const OUT = path.join(__dirname, '..', 'data', 'prices.json');

const MAP = { а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',
  н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'c',ч:'ch',ш:'sh',щ:'sch',
  ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya' };
const slug = s => s.toLowerCase().split('').map(c => MAP[c] !== undefined ? MAP[c] : c)
  .join('').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48).replace(/-$/, '');

const quotes = s => String(s).replace(/"([^"]+)"/g, '«$1»');

const num = s => {
  if (s === null || s === undefined) return null;
  const v = String(s).replace(/\s/g, '').replace(',', '.').replace(/[^\d.]/g, '');
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
};

const seen = new Set();
const uniq = base => { let s = base || 'item', i = 2; while (seen.has(s)) s = `${base}-${i++}`; seen.add(s); return s; };

// ---- цветной лом ----------------------------------------------------------
const cvet = JSON.parse(fs.readFileSync(path.join(SRC, 'price_parsed.json'), 'utf8'));
const cvetCats = cvet.map(c => ({
  id: uniq(slug(c.name)),
  name: c.name,
  items: c.items.map(it => {
    const rawCash = String(it.cash).replace(/[⠀ ]+/g, ' ').replace(/\s+/g, ' ').trim();
    const cash = num(rawCash);
    const special = cash === null || /до/i.test(rawCash);
    return {
      id: uniq(slug(it.title)),
      title: quotes(it.title),
      note: quotes(it.note || ''),
      cash: special ? null : cash,
      bank: special ? null : num(it.bank_fiz),
      text: special ? rawCash : null
    };
  })
}));

// ---- чёрный лом -----------------------------------------------------------
const CHER_NAMES = {
  '0A': 'Деловой металлопрокат',
  '3A': 'Стальной кусковой лом, габарит',
  '5A': 'Стальной негабаритный лом',
  '12A': 'Стальной лом тонкий (до 4 мм)',
  '17A': 'Чугунный лом, габарит',
  '21A': 'Чугунный лом, негабарит'
};
const cher = JSON.parse(fs.readFileSync(path.join(SRC, 'chermet_parsed.json'), 'utf8'));
const cherItems = cher.map(it => {
  const raw = String(it.price).replace(/за\s*тонну/i, '').trim();
  const range = raw.match(/(\d[\d\s]*?)\s*[-–—]\s*(\d[\d\s]*)/);
  const label = CHER_NAMES[it.code];
  return {
    id: uniq(slug(it.code)),
    title: label ? `${label} (${it.code})` : it.code,
    note: it.note || '',
    cash: range ? num(range[1]) : num(raw),
    cashTo: range ? num(range[2]) : null,
    bank: null,
    text: null
  };
});

const data = {
  updatedAt: new Date().toISOString().slice(0, 10),
  note: 'Цены справочные и зависят от объёма, засора и состояния лома. Точную стоимость называем после осмотра и взвешивания. От 500 кг — цена договорная.',
  groups: [
    {
      id: 'chermet',
      title: 'Чёрный лом',
      short: 'Чёрный металл',
      unit: '₽/тонна',
      unitShort: 'т',
      columns: ['Цена, ₽/тонна'],
      description: 'Приём стального и чугунного лома по ГОСТ 2787-75 на площадке в Омске.',
      categories: [{ id: 'stal-chugun', name: 'Сталь и чугун', items: cherItems }]
    },
    {
      id: 'cvetmet',
      title: 'Цветной лом',
      short: 'Цветной металл',
      unit: '₽/кг',
      unitShort: 'кг',
      columns: ['Наличный расчёт, ₽/кг', 'Безналичный расчёт, ₽/кг'],
      description: 'Приём меди, латуни, бронзы, алюминия, свинца, никеля, олова, нержавейки и радиолома в Омске.',
      categories: cvetCats
    }
  ]
};

fs.writeFileSync(OUT, JSON.stringify(data, null, 2), 'utf8');
const total = data.groups.reduce((a, g) => a + g.categories.reduce((b, c) => b + c.items.length, 0), 0);
console.log(`prices.json: ${data.groups.length} groups, ${data.groups.reduce((a, g) => a + g.categories.length, 0)} categories, ${total} items`);
