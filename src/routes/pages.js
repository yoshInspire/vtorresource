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
 * Позиции для калькулятора — весь прайс, а не десяток ходовых: в поле
 * «что сдаёте» человек вводит текст, и подсказки ищутся по всем строкам.
 * Берём только позиции с числовой ценой: договорные и текстовые
 * («по запросу») посчитать нельзя, в подсказках им делать нечего.
 *
 * `popular` помечает ходовые из content.popular: пока поле пустое, они стоят
 * первыми, иначе человек видит сверху чёрный лом и редкие сплавы.
 * Источник цен один и тот же и для сервера, и для скрипта — data/prices.json.
 */
function buildCalcItems() {
  const popular = new Map(content.popular.map((p, i) => [p.id, i]));

  return store.allItems()
    .filter(({ item }) => item.cash !== null)
    .map(({ group, category, item }) => ({
      id: item.id,
      title: item.title,
      category: category.name,
      priceLabel: `${item.cashTo ? 'от ' : ''}${f.price(item.cash)} ${group.unit}`,
      price: item.cash,
      perTonne: group.id === 'chermet',
      rank: popular.has(item.id) ? popular.get(item.id) : null
    }));
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

  // Крупные плитки «что принимаем»: на каждой верхняя цена «до N».
  // У плиток основного прайса это максимум по категории, у радиолома
  // и драгметаллов — максимум по весовым позициям их каталога. Считаем
  // по факту, а не константой: все три каталога заказчик правит через
  // админку, и вручную проставленная цифра разъедется в первый же день.
  const tiles = content.tiles.map(tile => {
    if (tile.catalogFrom) {
      const top = cat.topPrice(cat.load(tile.catalogFrom));
      return { ...tile, unit: top ? ' ' + top.unit : '', from: top ? top.value : 0 };
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

  const calcItems = buildCalcItems();

  const title = `Приём металлолома в Омске — сдать чёрный и цветной лом | ${site.brand}`;
  const description = site.seo.defaultDescription;

  res.render('index', {
    page: 'home',
    title,
    description,
    canonical: seo.abs('/'),
    prices,
    tiles,
    ticker,
    calcItemsJson: JSON.stringify(calcItems),
    mapEmbed: `https://yandex.ru/map-widget/v1/?ll=${site.geo.lon}%2C${site.geo.lat}&z=17&pt=${site.geo.lon},${site.geo.lat},pm2rdm`,
    reviews: content.reviews,
    content,
    // FAQPage больше нет: блок вопросов убран со страницы, а размечать
    // текст, которого на ней не видно, поисковики считают нарушением.
    jsonLd: seo.graph([
      seo.organization(),
      seo.webSite(),
      seo.webPage({ path: '/', title, description })
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
    : res.redirect('/?lead=error#zayavka-form');

  // honeypot: поле company скрыто от людей, боты его заполняют
  if (company.trim()) return wantsJson ? res.json({ ok: true }) : res.redirect('/?lead=ok#zayavka-form');
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

  return wantsJson ? res.json({ ok: true }) : res.redirect('/?lead=ok#zayavka-form');
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
