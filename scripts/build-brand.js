'use strict';

/**
 * Фирменная графика: обложка для соцсетей и иконки вкладки.
 *
 *   node scripts/build-brand.js            # всё
 *   node scripts/build-brand.js og         # только обложку
 *   node scripts/build-brand.js icons      # только иконки
 *   node scripts/build-brand.js watermark  # только подложку первого экрана
 *
 * Собирается из public/img/source/phoenix-2026-src.png — это присланный
 * заказчиком знак, уже с прозрачным фоном. Логотип в шапке (logo.png) этот
 * скрипт не трогает: он обрезан под конкретную высоту строки и переснимать
 * его без нужды незачем.
 *
 * Текст на обложке набирается тем же Oswald, что и заголовки на сайте.
 * librsvg берёт шрифты через fontconfig, а woff2 из public/fonts он не
 * читает, поэтому рядом лежат ttf-версии (scripts/fonts, там же README
 * с командой пересборки и лицензии OFL).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'public', 'img', 'source', 'phoenix-2026-src.png');
const OUT = path.join(ROOT, 'public', 'img');
const FONTS = path.join(__dirname, 'fonts');

// --- шрифты ------------------------------------------------------------------
// fontconfig ищет fonts.conf в каталоге из FONTCONFIG_PATH и читает эту
// переменную при старте процесса. Выставить её из кода уже поздно: sharp
// подтянет системные шрифты и молча заменит Oswald моноширинным. Поэтому
// при первом запуске скрипт готовит конфиг и перезапускает сам себя.
if (!process.env.MBAZA55_FONTS_READY) {
  const confDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mbaza55-fc-'));
  const slash = p => p.replace(/\\/g, '/');
  fs.writeFileSync(path.join(confDir, 'fonts.conf'), `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>${slash(FONTS)}</dir>
  <cachedir>${slash(path.join(confDir, 'cache'))}</cachedir>
</fontconfig>
`, 'utf8');

  const child = require('child_process').spawnSync(
    process.execPath,
    [__filename, ...process.argv.slice(2)],
    { stdio: 'inherit', env: { ...process.env, FONTCONFIG_PATH: confDir, MBAZA55_FONTS_READY: '1' } }
  );
  fs.rmSync(confDir, { recursive: true, force: true });
  process.exit(child.status === null ? 1 : child.status);
}

const sharp = require('sharp');

/**
 * Проверка, что шрифт действительно подхватился. Без неё librsvg молча
 * подставляет системный моноширинный, и ошибка вылезает уже на картинке.
 */
async function assertFontsLoaded() {
  const probe = family => sharp(Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="90">
       <text x="0" y="70" font-family="${family}" font-size="64">МЕТАЛЛОБАЗА55</text>
     </svg>`
  )).png().toBuffer().then(b => sharp(b).trim({ threshold: 1 }).toBuffer({ resolveWithObject: true }));

  const [display, body] = await Promise.all([probe(DISPLAY), probe(BODY)]);
  // Oswald узкий, Golos широкий: если оба съехали в один системный шрифт,
  // ширины совпадут с точностью до пикселя.
  if (display.info.width === body.info.width) {
    throw new Error(
      `Шрифты не подхватились: «${DISPLAY}» и «${BODY}» отрисовались одинаково. ` +
      'Проверьте scripts/fonts, см. scripts/fonts/README.md'
    );
  }
}

const DISPLAY = 'Oswald SemiBold';
const BODY = 'Golos Text Site';

// Цвета те же, что в public/css/style.css. Держим копию здесь, а не читаем CSS:
// разбирать таблицу стилей ради четырёх значений дороже, чем раз в год сверить.
const INK_950 = '#050B16';
const INK_900 = '#0A1527';
const ORANGE = '#FF8324';
const BLUE = '#1E6BEF';
const DIM = '#93A7C4';

const site = require('../src/config/site');

/** Диагональные полосы, как на первом экране и в тёмных секциях сайта. */
function streaks(width, height) {
  const lines = [];
  for (let x = -height; x < width; x += 96) {
    lines.push(`<line x1="${x}" y1="${height}" x2="${x + height}" y2="0"
      stroke="${BLUE}" stroke-width="2" opacity="0.16"/>`);
  }
  return lines.join('\n');
}

async function buildOgCover() {
  const W = 1200;
  const H = 630;

  const background = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0.35" y2="1">
        <stop offset="0" stop-color="${INK_900}"/>
        <stop offset="1" stop-color="${INK_950}"/>
      </linearGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#bg)"/>
    ${streaks(W, H)}
  </svg>`);

  // Знак: 560 px по ширине, верхняя часть обложки. Ниже остаётся место под три
  // строки текста, поэтому птицу не центрируем по вертикали. Хвост должен
  // заканчиваться выше заголовка: наложение читается как брак вёрстки.
  const MARK_W = 560;
  const MARK_TOP = 34;
  const mark = await sharp(SRC).resize({ width: MARK_W }).png().toBuffer();
  const markHeight = (await sharp(mark).metadata()).height;

  const text = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <text x="${W / 2}" y="482" text-anchor="middle" fill="#FFFFFF"
          font-family="${DISPLAY}" font-size="76" letter-spacing="2">${site.brand.toUpperCase()}</text>
    <text x="${W / 2}" y="530" text-anchor="middle" fill="${ORANGE}"
          font-family="${DISPLAY}" font-size="34" letter-spacing="3">ПРИЁМ МЕТАЛЛОЛОМА В ОМСКЕ</text>
    <text x="${W / 2}" y="578" text-anchor="middle" fill="${DIM}"
          font-family="${BODY}" font-size="24">${site.address.full} · ${site.hours.short}</text>
  </svg>`);

  const file = path.join(OUT, 'og-cover.png');
  await sharp(background)
    .composite([
      { input: mark, top: MARK_TOP, left: Math.round((W - MARK_W) / 2) },
      { input: text, top: 0, left: 0 }
    ])
    .png()
    .toFile(file);

  console.log(`og-cover.png: ${W}×${H}, знак ${MARK_W}×${markHeight} до y=${MARK_TOP + markHeight}`);
}

/**
 * Знак для подложки первого экрана. Обрезаем прозрачные поля, осветляем и
 * почти полностью обесцвечиваем: на тёмном фоне под текстом нужна светлая
 * фактура, а не цветная картинка. В шапке лежит logo.png шириной 208 px —
 * растянуть его на пол-экрана нельзя, поэтому знак пересобирается из
 * исходника отдельным файлом.
 */
async function buildWatermark() {
  const W = 700;
  const file = path.join(OUT, 'logo-watermark.png');

  const trimmed = await sharp(SRC).png().toBuffer()
    .then(buf => sharp(buf).trim({ threshold: 1 }).png().toBuffer());

  // 16 цветов вместо полной палитры: файл втрое легче (56 КБ против 200),
  // а на подложке в 16% непрозрачности разницы не видно.
  const info = await sharp(trimmed)
    .modulate({ brightness: 1.75, saturation: 0.12 })
    .resize({ width: W })
    .png({ compressionLevel: 9, palette: true, colours: 16, effort: 10 })
    .toFile(file);

  console.log(`logo-watermark.png: ${info.width}×${info.height}, ${Math.round(info.size / 1024)} КБ`);
}

/**
 * Иконки вкладки и домашнего экрана. Знак обрезаем по краям непрозрачных
 * пикселей и вписываем в квадрат с полями: без обрезки птица тонет
 * в прозрачных отступах исходника и на 32 px превращается в точку.
 *
 * Для favicon металл дополнительно осветляется почти до белого силуэта.
 * В оригинале знак серебристо-медный, на тёмной подложке в 32 px эти оттенки
 * сливаются в пятно: цвет на таком размере всё равно не читается, а форма да.
 * У иконки для домашнего экрана 180 px, там цвет оставляем как есть.
 */
async function buildIcons() {
  const trimmed = await sharp(SRC).png().toBuffer()
    .then(buf => sharp(buf).trim({ threshold: 1 }).png().toBuffer());

  for (const [name, size, pad, radius, lighten] of [
    ['favicon-32.png', 32, 1, 6, true],
    ['apple-touch-icon.png', 180, 14, 40, false]
  ]) {
    const inner = size - pad * 2;
    const source = lighten
      ? sharp(trimmed).modulate({ brightness: 1.9, saturation: 0.15 }).linear(1.5, -10)
      : sharp(trimmed);
    const bird = await source
      .resize({ width: inner, height: inner, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();

    const plate = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
      <rect width="${size}" height="${size}" rx="${radius}" fill="${INK_950}"/>
    </svg>`);

    await sharp(plate)
      .composite([{ input: bird, top: pad, left: pad }])
      .png()
      .toFile(path.join(OUT, name));
    console.log(`${name}: ${size}×${size}`);
  }
}

(async () => {
  const what = process.argv[2] || 'all';
  if (what === 'all' || what === 'og') {
    await assertFontsLoaded();
    await buildOgCover();
  }
  if (what === 'all' || what === 'icons') await buildIcons();
  if (what === 'all' || what === 'watermark') await buildWatermark();
})().catch(err => {
  console.error(err.message);
  process.exit(1);
});
