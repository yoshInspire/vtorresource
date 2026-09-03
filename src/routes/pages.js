'use strict';

const express = require('express');
const site = require('../config/site');
const content = require('../content');
const privacy = require('../content/privacy');
const store = require('../lib/store');
const seo = require('../lib/seo');
const f = require('../lib/format');

const router = express.Router();

/**
 * Позиции для калькулятора: ходовые из content.popular плюс чёрный лом.
 * Отдаём в шаблон и в JSON для клиентского скрипта — считать умеет и он,
 * и мы, источник цен один и тот же.
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

// --- главная ---------------------------------------------------------------
router.get('/', (req, res) => {
  const prices = store.getPrices();

  // Крупные плитки «что принимаем» — цена «до N» берётся из прайса.
  const tiles = content.tiles.map(tile => {
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
    calcItems,
    calcItemsJson: JSON.stringify(calcItems),
    mapEmbed: `https://yandex.ru/map-widget/v1/?ll=${site.geo.lon}%2C${site.geo.lat}&z=17&pt=${site.geo.lon},${site.geo.lat},pm2rdm`,
    reviews: content.reviews,
    content,
    jsonLd: seo.graph([
      seo.organization(),
      seo.webSite(),
      seo.webPage({ path: '/', title, description }),
      seo.faqPage(content.faq)
    ])
  });
});

// --- прайс -----------------------------------------------------------------
router.get('/price', (req, res) => {
  const prices = store.getPrices();
  const title = `Цены на металлолом в Омске — прайс за кг и тонну | ${site.brand}`;
  const description =
    'Прайс на приём металлолома в Омске: 141 позиция. Цена меди, латуни, бронзы, алюминия, свинца, нержавейки за кг, чёрного лома за тонну. Приём на 2-й Барнаульской, 105.';

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
        { name: 'Цены на металлолом', path: '/price' }
      ]),
      seo.offerCatalog(prices.groups)
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
    { loc: seo.abs('/privacy'), priority: '0.2', changefreq: 'yearly' }
  ];
  res.type('application/xml').send(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map(u => `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`).join('\n') +
    `\n</urlset>\n`
  );
});

module.exports = router;
