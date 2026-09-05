'use strict';

/**
 * Фоновые фотографии для блоков сайта.
 *
 * Источник — Wikimedia Commons, только свободные лицензии. Скрипт скачивает
 * оригинал, делает три ширины в webp и jpeg и дописывает автора в
 * public/img/photo/_credits.json: без этой строки лицензии CC BY и CC BY-SA
 * нарушаются, а подпись в подвале собирается именно из этого файла.
 *
 * Запуск:  node scripts/fetch-photos.js [slug ...]
 * Без аргументов обрабатываются только те слаги, файлов которых ещё нет.
 * Флаг --force перекачивает и пересобирает указанные слаги заново.
 *
 * Фотографии показывают материал, а не нашу площадку: подписывать их как
 * снимки с 2-й Барнаульской нельзя, поэтому alt в шаблонах описывает
 * именно материал.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const sharp = require('sharp');

const DIR = path.join(__dirname, '..', 'public', 'img', 'photo');
const CREDITS = path.join(DIR, '_credits.json');
const WIDTHS = [640, 1280, 1920];
const UA = 'mbaza55.ru site build (https://mbaza55.ru)';

/** Что откуда берём. Ключ — слаг, под которым фото зовут шаблоны. */
const SOURCES = {
  'yard-hero': 'File:Moscow, Vladykino-Moskovskoye railway station, heaps of scrap metal (21).jpg',
  grapple: 'File:Fuchs Bagger F301.jpg',
  chermet: 'File:Scrap metal yard.jpg',
  'chermet-alt': 'File:Steel Scrap Compacted.JPG',
  cvetmet: 'File:BS VW Aluminium Swarf.JPG',
  redkozem: 'File:Tungsten carbide inserts.jpg',
  radiolom: 'File:8Platinen-harddisc hg.jpg',
  dragmet: 'File:Ag 99 99 Uralelectromed.jpg'
};

/**
 * Кадрирование до ресайза, в долях от размера оригинала: [left, top, w, h].
 * Нужно там, где в кадр попадает лишнее. У слитка серебра это выбитые на
 * поверхности логотип завода и номер плавки: на плитке они читались как
 * подпись сайта, поэтому берём чистую полосу металла между ними.
 */
const CROPS = {
  dragmet: [0, 0.395, 1, 0.44]
};

/** Короткая заметка для _credits.json: зачем кадр нужен на сайте. */
const NOTES = {
  'yard-hero': 'Куча лома, Москва — фон первого экрана',
  grapple: 'Грейферный перегружатель',
  chermet: 'Чёрный лом навалом',
  'chermet-alt': 'Прессованный стальной лом',
  cvetmet: 'Алюминиевая стружка крупно',
  redkozem: 'Твердосплавные пластины ВК-ТК',
  radiolom: 'Печатные платы крупно — плитка «Радиолом»',
  dragmet: 'Слиток серебра 99,99 — плитка «Драгметаллы»'
};

function api(params) {
  const url = 'https://commons.wikimedia.org/w/api.php?' +
    new URLSearchParams({ format: 'json', ...params });
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': UA } }, res => {
      let body = '';
      res.on('data', chunk => (body += chunk));
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (e) { reject(new Error(body.slice(0, 200))); }
      });
    }).on('error', reject);
  });
}

function download(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': UA } }, res => {
      // Commons отдаёт файлы с редиректом на upload.wikimedia.org
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(download(res.headers.location));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} на ${url}`));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

const strip = html => String(html || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function build(slug, title) {
  const info = await api({
    action: 'query', titles: title, prop: 'imageinfo',
    iiprop: 'url|extmetadata'
  });
  const page = Object.values(info.query.pages)[0];
  if (!page || !page.imageinfo) throw new Error(`Не нашёл на Commons: ${title}`);

  const image = page.imageinfo[0];
  const meta = image.extmetadata || {};
  const original = await download(image.url);

  let source = original;
  if (CROPS[slug]) {
    const [left, top, w, h] = CROPS[slug];
    const meta = await sharp(original).metadata();
    source = await sharp(original)
      .extract({
        left: Math.round(meta.width * left),
        top: Math.round(meta.height * top),
        width: Math.round(meta.width * w),
        height: Math.round(meta.height * h)
      })
      .png()
      .toBuffer();
  }

  for (const width of WIDTHS) {
    const base = sharp(source).resize({ width, withoutEnlargement: true });
    await base.clone().webp({ quality: 78 }).toFile(path.join(DIR, `${slug}-${width}.webp`));
    await base.clone().jpeg({ quality: 82, mozjpeg: true }).toFile(path.join(DIR, `${slug}-${width}.jpg`));
  }

  return {
    slug,
    title: page.title.replace(/^File:/, ''),
    author: strip((meta.Artist || {}).value) || 'неизвестен',
    license: strip((meta.LicenseShortName || {}).value),
    licenseUrl: strip((meta.LicenseUrl || {}).value),
    source: image.descriptionurl,
    note: NOTES[slug] || ''
  };
}

(async () => {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const asked = args.filter(a => !a.startsWith('--'));

  const credits = fs.existsSync(CREDITS) ? JSON.parse(fs.readFileSync(CREDITS, 'utf8')) : [];
  const slugs = (asked.length ? asked : Object.keys(SOURCES)).filter(slug => {
    if (!SOURCES[slug]) throw new Error(`Неизвестный слаг: ${slug}`);
    if (force) return true;
    return !fs.existsSync(path.join(DIR, `${slug}-1280.jpg`));
  });

  if (!slugs.length) {
    console.log('Всё на месте, качать нечего. Для пересборки: --force');
    return;
  }

  for (const slug of slugs) {
    const credit = await build(slug, SOURCES[slug]);
    const at = credits.findIndex(c => c.slug === slug);
    if (at === -1) credits.push(credit); else credits[at] = credit;
    console.log(`${slug}: ${credit.author} (${credit.license})`);
    await sleep(1200); // Commons отдаёт 429 при частых запросах
  }

  fs.writeFileSync(CREDITS, JSON.stringify(credits, null, 2) + '\n', 'utf8');
  console.log(`Готово, слагов в манифесте: ${credits.length}`);
})().catch(err => {
  console.error(err.message);
  process.exit(1);
});
