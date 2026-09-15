'use strict';

/**
 * Фотографии плиток «что принимаем» из картинок, присланных заказчиком
 * 15 сентября 2026 (цветной, чёрный, редкоземельный лом, драгметаллы).
 * Плитка «Радиолом» по-прежнему берёт снимок с Commons, см. fetch-photos.js.
 *
 *   node scripts/build-tile-photos.js
 *
 * Исходники лежат в public/img/source/tile-*-src.*, результат в
 * public/img/photo под слагами tile-*, в тех же трёх ширинах, что и
 * остальные фото. Картинки у заказчика небольшие, поэтому не растягиваем:
 * широкие варианты совпадают с оригиналом по размеру.
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'public', 'img', 'source');
const OUT = path.join(ROOT, 'public', 'img', 'photo');
const WIDTHS = [640, 1280, 1920];

const SLUGS = ['tile-cvetmet', 'tile-chermet', 'tile-redkozem', 'tile-dragmet'];

/**
 * Кадрирование до ресайза, в пикселях оригинала: [left, top, width, height].
 * У цветного лома срезаем нижнюю полосу с подписями «латунь, медь, бронза»:
 * квадратная плитка режет их на обрывки букв, а название плитки и так
 * стоит внизу. У драгметаллов оставляем только строки с металлами:
 * заголовок таблицы повторяет название плитки и в широкий кадр не влезает.
 */
const CROPS = {
  'tile-cvetmet': [0, 0, 1100, 500],
  'tile-dragmet': [0, 405, 1180, 730]
};

(async () => {
  for (const slug of SLUGS) {
    const file = fs.readdirSync(SRC).find(f => f.startsWith(`${slug}-src.`));
    if (!file) throw new Error(`Нет исходника для ${slug} в ${SRC}`);
    let source = await fs.promises.readFile(path.join(SRC, file));
    if (CROPS[slug]) {
      const [left, top, width, height] = CROPS[slug];
      source = await sharp(source).extract({ left, top, width, height }).png().toBuffer();
    }
    for (const width of WIDTHS) {
      const base = sharp(source).resize({ width, withoutEnlargement: true });
      await base.clone().webp({ quality: 82 }).toFile(path.join(OUT, `${slug}-${width}.webp`));
      await base.clone().jpeg({ quality: 85, mozjpeg: true }).toFile(path.join(OUT, `${slug}-${width}.jpg`));
    }
    console.log(`${slug}: готово`);
  }
})().catch(err => {
  console.error(err.message);
  process.exit(1);
});
