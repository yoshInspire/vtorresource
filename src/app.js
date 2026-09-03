'use strict';

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

// Общие для всех шаблонов данные
app.use((req, res, next) => {
  res.locals.site = site;
  res.locals.f = format;
  res.locals.currentPath = req.path;
  res.locals.leadStatus = req.query.lead || null;
  res.locals.photoCredits = photoCredits;
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
