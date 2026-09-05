'use strict';

const express = require('express');
const site = require('../config/site');
const content = require('../content');
const privacy = require('../content/privacy');
const store = require('../lib/store');
const seo = require('../lib/seo');
const f = require('../lib/format');
const cat = require('../lib/catalogs');

const router = express.Router();

/**
 * Позиции для калькулятора: ходовые из content.popular плюс чёрный лом.
 * Отдаём в шаблон и в JSON для клиентского скрипта. Считать умеет и он, и мы,
 * но источник цен один и тот же — data/prices.json.
 */
function buildCalcItems(prices) {
  const picked = store.pickItems(content.popular);
  const items = picked
    .filter(i => i.cash !== null)
    .map(i => ({
      id: i.id,
      label: `${i.title} · ${i.cashTo ? 'от ' : ''}${f.price(i.cash)} ${i.group.unit}`,
      price: i.cash,
      unit: i.group.unit,
      perTonne: i.group.id === 'chermet'
    }));

  const chermet = prices.groups.find(g => g.id === 'chermet');
  if (chermet) {
    chermet.categories[0].items
      .filter(i => i.cash !== null)
      .slice(0, 5)
      .forEach(i => items.push({
        id: i.id,
        label: `${i.title} · ${i.cashTo ? 'от ' : ''}${f.price(i.cash)} ${chermet.unit}`,
        price: i.cash,
        unit: chermet.unit,
        perTonne: true
      }));
  }
  return items;
}

/**
 * Сколько позиций с ценами сейчас на сайте.
 *   `prices` — только основной прайс, к нему ведёт кнопка «Прайс-лист»;
 *   `total`  — вместе с радиодеталями и драгметаллами, это цифра «на сайте».
 * Считаем по факту, а не константой: заказчик правит все три каталога через
 * админку, и вручную проставленное число разъезжается с таблицами сразу же.
 */
function countPositions() {
  const prices = store.getPrices().groups.reduce(
    (n, group) => n + group.categories.reduce((m, c) => m + c.items.length, 0),
    0
  );
  const catalogs = cat.REGISTRY.reduce((n, c) => n + cat.countItems(cat.load(c.id)), 0);
  return { prices, total: prices + catalogs };
}

/** «498 позиций» / «141 позиция» — число со склонённым словом. */
function positionsText(n) {
  return `${n} ${f.plural(n, 'позиция', 'позиции', 'позиций')}`;
}

// --- главная ---------------------------------------------------------------
router.get('/', (req, res) => {
  const prices = store.getPrices();

  // Крупные плитки «что принимаем». У плиток прайса в углу стоит верхняя цена
  // группы, у радиолома и драгметаллов — размер их каталога: там цены за грамм,
  // за штуку и за контакт лежат в одной таблице, одной цифрой не обойтись.
  // Число берём из каталога, а не из константы, чтобы оно не разъезжалось
  // с тем, что заказчик правит в админке.
  const tiles = content.tiles.map(tile => {
    if (tile.countFrom) {
      const n = cat.countItems(cat.load(tile.countFrom));
      return { ...tile, countText: `${n} ${f.plural(n, 'позиция', 'позиции', 'позиций')}` };
    }
    const group = prices.groups.find(g => g.id === tile.priceFrom.group);
    const category = group && group.categories.find(c => c.id === tile.priceFrom.category);
    return {
      ...tile,
      unit: group ? ' ' + group.unit : '',
      from: category ? store.topPrice(category) : 0
    };
  });

  // Бегущая строка цен.
  const ticker = store.pickItems(content.ticker).map(item => ({
    label: item.title,
    price: f.itemPrice(item),
    unit: item.group.unit,
    anchor: `/price#${item.categoryId}`
  }));

  const calcItems = buildCalcItems(prices);
  const counts = countPositions();

  // Первый экран: четвёртый факт и FAQ говорят об одном и том же числе,
  // поэтому подставляем его в одном месте.
  const heroFacts = content.hero.facts.map(fact => (
    fact.id === 'positions'
      ? { value: String(counts.total), label: f.plural(counts.total, 'позиция', 'позиции', 'позиций') + ' с ценами' }
      : fact
  ));
  const faq = content.faq.map(item => ({
    ...item,
    a: item.a.replace('{positions}', positionsText(counts.total))
  }));

  const title = `Приём металлолома в Омске — сдать чёрный и цветной лом | ${site.brand}`;
  const description = site.seo.defaultDescription;

  res.render('index', {
    page: 'home',
    title,
    description,
    canonical: seo.abs('/'),
    prices,
    counts,
    positionsText,
    heroFacts,
    faq,
    tiles,
    ticker,
    calcItems,
    calcItemsJson: JSON.stringify(calcItems),
    mapEmbed: `https://yandex.ru/map-widget/v1/?ll=${site.geo.lon}%2C${site.geo.lat}&z=17&pt=${site.geo.lon},${site.geo.lat},pm2rdm`,
    reviews: content.reviews,
    content,
    jsonLd: seo.graph([
      seo.organization(),
      seo.webSite(),
      seo.webPage({ path: '/', title, description }),
      seo.faqPage(faq)
    ])
  });
});

// --- цены ------------------------------------------------------------------
router.get('/price', (req, res) => {
  const prices = store.getPrices();
  const title = `Цены на металлолом в Омске: прайс за кг и тонну | ${site.brand}`;
  const description =
    `Прайс на приём металлолома в Омске: ${positionsText(countPositions().prices)}. ` +
    'Цена меди, латуни, бронзы, алюминия, свинца, нержавейки за кг, чёрного лома за тонну. ' +
    'Приём на 2-й Барнаульской, 105.';

  res.render('price', {
    page: 'price',
    title,
    description,
    canonical: seo.abs('/price'),
    prices,
    content,
    jsonLd: seo.graph([
      seo.organization(),
      seo.webSite(),
      seo.webPage({ path: '/price', title, description }),
      seo.breadcrumbs([
        { name: 'Главная', path: '/' },
        { name: 'Прайс-лист', path: '/price' }
      ]),
      seo.offerCatalog(prices.groups)
    ])
  });
});


// --- радиодетали и платы -----------------------------------------------------
router.get('/radiodetali', (req, res) => {
  const catalog = cat.load('radio');
  const title = `Приём радиодеталей и плат в Омске: цены | ${site.brand}`;
  const description =
    'Приём радиодеталей и печатных плат в Омске: конденсаторы КМ, разъёмы с позолотой, ' +
    'микросхемы, транзисторы, реле, материнские платы и срезка. Цены за штуку и за килограмм.';

  res.render('catalog', {
    page: 'radiodetali',
    title,
    description,
    canonical: seo.abs('/radiodetali'),
    catalog,
    cat,
    catalogTitle: 'Радиодетали и платы',
    h1: 'Приём радиодеталей и плат в Омске',
    lead:
      'Принимаем печатные платы, срезку с плат и радиодетали советского выпуска: ' +
      'конденсаторы КМ, разъёмы с позолотой, микросхемы, транзисторы, резисторы и реле.',
    itemCount: cat.countItems(catalog),
    aboutTitle: 'Как оцениваются радиодетали',
    about: [
      'Цена детали зависит от содержания драгметалла, а не от веса корпуса. У разъёмов ' +
      'это толщина и длина позолоченной ножки, у микросхем — тип корпуса и наличие ' +
      'золотого дна, у конденсаторов КМ — группа и цвет.',
      'Платы оцениваются по насыщенности: чем больше на плате разъёмов, микросхем ' +
      'и позолоты, тем выше цена за килограмм. Батарейки, радиаторы, крепёж и ' +
      'пластиковые части в оплачиваемый вес не входят, их лучше снять заранее.',
      'Выпаивать детали с плат самостоятельно не нужно: срезка принимается отдельной ' +
      'позицией. Если сомневаетесь, что у вас за деталь, привозите как есть или ' +
      'пришлите фотографию, приёмщик подскажет.',
      'От 100 кг по платам действует отдельная цена, она указана в таблице второй колонкой. ' +
      '<a href="/price">Основной прайс-лист</a> на чёрный, цветной и редкоземельный лом — ' +
      'в отдельном разделе.'
    ],
    content,
    jsonLd: seo.graph([
      seo.organization(),
      seo.webSite(),
      seo.webPage({ path: '/radiodetali', title, description }),
      seo.breadcrumbs([
        { name: 'Главная', path: '/' },
        { name: 'Радиодетали и платы', path: '/radiodetali' }
      ])
    ])
  });
});

// --- драгметаллы -------------------------------------------------------------
router.get('/dragmetally', (req, res) => {
  const catalog = cat.load('dragmet');
  const title = `Приём лома драгметаллов в Омске: серебро, палладий, платина | ${site.brand}`;
  const description =
    'Приём лома драгметаллов в Омске: серебряные контакты, палладиевые и платиновые ' +
    'катализаторы, ламели Pd и Au, термопары, посеребрённая лигатура. Оценка по описанию.';

  res.render('catalog', {
    page: 'dragmetally',
    title,
    description,
    canonical: seo.abs('/dragmetally'),
    catalog,
    cat,
    catalogTitle: 'Драгметаллы',
    h1: 'Приём лома драгметаллов в Омске',
    lead:
      'Серебряные контакты и лигатура, палладиевые и платиновые катализаторы, ламели, ' +
      'термопары, позолоченные узлы и генераторные лампы. Оцениваем по виду изделия ' +
      'и маркировке.',
    itemCount: cat.countItems(catalog),
    aboutTitle: 'Что важно знать о приёме драгметаллов',
    about: [
      'Принимаем и лом с содержанием драгметаллов, и изделия: контакты, ламели, ' +
      'катализаторы, термопары, узлы приборов, а также слитки, монеты, ювелирные ' +
      'и столовые изделия. Цена зависит от пробы и содержания металла.',
      'Содержание драгметалла определяется по типу изделия, маркировке и году выпуска. ' +
      'Поэтому у большинства позиций цена договорная: назвать её заранее по телефону ' +
      'можно только приблизительно, точную дают после осмотра.',
      'Разбирать узлы и выпаивать контакты самостоятельно не нужно. Если не уверены, ' +
      'есть ли в вашем изделии драгметалл, опишите его по телефону или привезите как есть.',
      'Обратите внимание на единицу измерения в таблице: слитки, монеты, изделия ' +
      'и контакты считаются за грамм, а посеребрённый лом за килограмм.',
      'Многое из этого списка встречается вместе с радиодеталями, поэтому загляните ' +
      'и в <a href="/radiodetali">прайс на радиодетали и платы</a>.'
    ],
    content,
    jsonLd: seo.graph([
      seo.organization(),
      seo.webSite(),
      seo.webPage({ path: '/dragmetally', title, description }),
      seo.breadcrumbs([
        { name: 'Главная', path: '/' },
        { name: 'Драгметаллы', path: '/dragmetally' }
      ])
    ])
  });
});

// --- политика обработки персональных данных --------------------------------
router.get('/privacy', (req, res) => {
  const title = `Политика обработки персональных данных | ${site.brand}`;
  const description =
    'Какие данные собирает форма на сайте, зачем они нужны, сколько хранятся и как их удалить. ' +
    'Политика обработки персональных данных в соответствии с 152-ФЗ.';

  res.render('privacy', {
    page: 'privacy',
    title,
    description,
    canonical: seo.abs('/privacy'),
    privacy,
    content,
    jsonLd: seo.graph([
      seo.organization(),
      seo.webSite(),
      seo.webPage({ path: '/privacy', title, description }),
      seo.breadcrumbs([
        { name: 'Главная', path: '/' },
        { name: 'Политика обработки персональных данных', path: '/privacy' }
      ])
    ])
  });
});

// --- приём заявок ----------------------------------------------------------
const RATE = new Map();

function rateLimited(ip) {
  const now = Date.now();
  const hits = (RATE.get(ip) || []).filter(t => now - t < 60_000);
  hits.push(now);
  RATE.set(ip, hits);
  if (RATE.size > 5000) RATE.clear();
  return hits.length > 5;
}

router.post('/lead', (req, res) => {
  const wantsJson = req.get('accept') && req.get('accept').includes('application/json');
  const { phone = '', name = '', comment = '', company = '' } = req.body || {};

  const fail = message => wantsJson
    ? res.status(400).json({ ok: false, error: message })
    : res.redirect('/?lead=error#zayavka');

  // honeypot: поле company скрыто от людей, боты его заполняют
  if (company.trim()) return wantsJson ? res.json({ ok: true }) : res.redirect('/?lead=ok#zayavka');
  if (rateLimited(req.ip)) return fail('Слишком много заявок, попробуйте через минуту');

  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 11) return fail('Проверьте номер телефона');

  store.saveLead({
    phone: digits,
    name: String(name).slice(0, 100),
    comment: String(comment).slice(0, 1000),
    page: String(req.get('referer') || '').slice(0, 300),
    ua: String(req.get('user-agent') || '').slice(0, 300)
  });

  return wantsJson ? res.json({ ok: true }) : res.redirect('/?lead=ok#zayavka');
});

// --- служебные -------------------------------------------------------------
router.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(
    `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /lead\n\nHost: ${site.url}\nSitemap: ${site.url}/sitemap.xml\n`
  );
});

router.get('/sitemap.xml', (req, res) => {
  const lastmod = store.getPrices().updatedAt;
  const urls = [
    { loc: seo.abs('/'), priority: '1.0', changefreq: 'weekly' },
    { loc: seo.abs('/price'), priority: '0.9', changefreq: 'daily' },
    { loc: seo.abs('/radiodetali'), priority: '0.8', changefreq: 'weekly' },
    { loc: seo.abs('/dragmetally'), priority: '0.7', changefreq: 'weekly' },
    { loc: seo.abs('/privacy'), priority: '0.2', changefreq: 'yearly' }
  ];
  res.type('application/xml').send(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map(u => `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`).join('\n') +
    `\n</urlset>\n`
  );
});

module.exports = router;
