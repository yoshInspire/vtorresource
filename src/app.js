'use strict';

const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const express = require('express');
const compression = require('compression');

const site = require('./config/site');
const format = require('./lib/format');
const pages = require('./routes/pages');

const app = express();

app.set('trust proxy', true);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));
app.disable('x-powered-by');

app.use(compression());
app.use(express.urlencoded({ extended: false, limit: '32kb' }));
app.use(express.json({ limit: '32kb' }));

app.use(express.static(path.join(__dirname, '..', 'public'), {
  maxAge: process.env.NODE_ENV === 'production' ? '30d' : 0,
  etag: true
}));

/**
 * Атрибуция временных фотографий. Снимки взяты с Wikimedia Commons по
 * лицензиям CC BY / CC BY-SA — они требуют указания автора, поэтому список
 * выводится в подвале. Когда заказчик пришлёт съёмку площадки, файл
 * public/img/photo/_credits.json удаляется вместе с блоком в подвале.
 */
let photoCredits = [];
try {
  photoCredits = require('../public/img/photo/_credits.json');
} catch (_) {
  photoCredits = [];
}

/**
 * Версия статики в адресе файла.
 *
 * Статика отдаётся с `Cache-Control: max-age=30d, immutable`, а имена файлов
 * не меняются. Без версии в адресе браузер, который уже был на сайте, месяц
 * показывает старый CSS и не перезапрашивает его даже после выкатки.
 * Хэш считается один раз при старте: файлы меняются только при деплое,
 * а он перезапускает процесс.
 */
const ASSET_VERSIONS = new Map();

function assetUrl(publicPath) {
  if (!ASSET_VERSIONS.has(publicPath)) {
    let version = '0';
    try {
      const file = fs.readFileSync(path.join(__dirname, '..', 'public', publicPath));
      version = crypto.createHash('sha1').update(file).digest('hex').slice(0, 8);
    } catch (_) {
      // файла нет — отдаём адрес без версии, страница не должна падать из-за этого
    }
    ASSET_VERSIONS.set(publicPath, version);
  }
  const version = ASSET_VERSIONS.get(publicPath);
  return version === '0' ? publicPath : `${publicPath}?v=${version}`;
}

// Общие для всех шаблонов данные
app.use((req, res, next) => {
  res.locals.site = site;
  res.locals.f = format;
  res.locals.currentPath = req.path;
  res.locals.leadStatus = req.query.lead || null;
  res.locals.photoCredits = photoCredits;
  res.locals.asset = assetUrl;
  next();
});

app.use('/', pages);

// Заготовка под админку: подключается, когда появится src/routes/admin.js
// app.use('/admin', require('./routes/admin'));

app.use((req, res) => {
  res.status(404).render('404', {
    page: '404',
    title: `Страница не найдена | ${site.brand}`,
    description: 'Запрошенная страница не найдена.',
    canonical: null,
    jsonLd: null
  });
});

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error(err);
  res.status(500).render('404', {
    page: 'error',
    title: `Ошибка сервера | ${site.brand}`,
    description: '',
    canonical: null,
    jsonLd: null,
    isError: true
  });
});

module.exports = app;
