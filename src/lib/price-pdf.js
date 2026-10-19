'use strict';

const path = require('path');
const PDFDocument = require('pdfkit');
const site = require('../config/site');
const f = require('./format');
const cat = require('./catalogs');

/**
 * Прайс в PDF: кнопка «Скачать PDF» на страницах цен.
 *
 * Файл собирается на сервере из тех же данных, что и страница, а не лежит
 * готовым в public: цены заказчик правит через админку каждый день,
 * и выгруженный однажды PDF разошёлся бы с сайтом в первый же вечер.
 * Готовый файл держим в памяти, пока не поменялись данные: store и catalogs
 * отдают один и тот же объект до правки JSON, по нему и ключ кэша.
 *
 * Шрифты лежат рядом, в src/pdf/fonts: те же Golos Text и Oswald, что на
 * сайте, но в ttf и с полной кириллицей. woff2 из public/fonts pdfkit не
 * читает, а ttf из scripts/fonts обрезаны под обложку и букв в них не хватит.
 * Как собраны — в src/pdf/fonts/README.md.
 */

const FONTS = path.join(__dirname, '..', 'pdf', 'fonts');
const LOGO = path.join(__dirname, '..', '..', 'public', 'img', 'logo.png');

// Цвета со штендера, те же, что в public/css/style.css.
const C = {
  ink: '#0A1527',
  text: '#1B2433',
  muted: '#5E6878',
  line: '#E5E9EF',
  zebra: '#F7F8FA',
  orange: '#F26202',
  orangeLight: '#FF8324'
};

const PAGE = { size: 'A4', margins: { top: 40, bottom: 52, left: 40, right: 40 } };
const NUM_W = 26;
const PAD_Y = 4;

const cache = new WeakMap();

/** «https://mbaza55.ru» -> «mbaza55.ru» */
function host() {
  return site.url.replace(/^https?:\/\//, '');
}

// --- модель документа ---------------------------------------------------------
//
// Обе раскладки, основной прайс и каталоги, сводятся к одному виду:
// разделы с заголовком, колонками цен справа и строками. Колонка названия
// резиновая и в `columns` не входит.

/** Основной прайс: цена одна, единица измерения в заголовке раздела. */
function fromPrices(prices, categories) {
  return {
    title: 'Цены на приём металлолома',
    updatedAt: prices.updatedAt,
    note: prices.note,
    sections: categories.map(({ group, category }) => ({
      title: category.name,
      unit: group.unit,
      head: false,
      columns: [{ label: `Цена, ${group.unit}`, width: 110 }],
      rows: category.items.map(item => ({
        title: item.title,
        note: item.note,
        cells: [f.itemPrice(item)]
      }))
    }))
  };
}

/** Радиодетали и драгметаллы: единица у каждой строки, у плат вторая цена. */
function fromCatalog(catalog, sections, title) {
  return {
    title,
    updatedAt: catalog.updatedAt,
    note: catalog.note,
    sections: sections.map(block => {
      const bulk = Boolean(block.columns && block.columns[1]);
      const columns = [
        { label: 'Ед.', width: 62, align: 'left', plain: true },
        { label: block.columns ? block.columns[0] : 'Цена, ₽', width: 84 }
      ];
      if (bulk) columns.push({ label: block.columns[1], width: 72 });

      return {
        title: block.title,
        unit: '',
        head: true,
        columns,
        rows: block.items.map(item => ({
          title: item.title,
          note: item.note,
          cells: [item.unit, cat.formatPrice(item.price)]
            .concat(bulk ? [item.priceBulk ? cat.formatPrice(item.priceBulk) : '—'] : [])
        }))
      };
    })
  };
}

// --- вёрстка -----------------------------------------------------------------

function render(model) {
  const doc = new PDFDocument({
    ...PAGE,
    bufferPages: true,
    info: {
      Title: `${model.title} — ${site.brand}`,
      Author: site.brand,
      Subject: `Обновлено ${f.dateLong(model.updatedAt)}`
    }
  });

  doc.registerFont('text', path.join(FONTS, 'GolosText-Regular.ttf'));
  doc.registerFont('bold', path.join(FONTS, 'GolosText-SemiBold.ttf'));
  doc.registerFont('display', path.join(FONTS, 'Oswald-SemiBold.ttf'));

  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  const bottom = () => doc.page.height - doc.page.margins.bottom;

  header(doc, model, left, width);

  let n = 0;
  for (const section of model.sections) {
    const priceW = section.columns.reduce((s, c) => s + c.width, 0);
    const nameW = width - NUM_W - priceW;

    // Заголовок раздела не должен остаться внизу страницы без единой строки.
    const first = section.rows[0];
    const need = 30 + (section.head ? 18 : 0) + (first ? rowHeight(doc, first, nameW, section.columns) : 0);
    if (doc.y + need > bottom()) doc.addPage();
    else doc.y += 10;

    sectionHead(doc, section, left, width, nameW, false);

    section.rows.forEach((row, i) => {
      const h = rowHeight(doc, row, nameW, section.columns);
      if (doc.y + h > bottom()) {
        doc.addPage();
        sectionHead(doc, section, left, width, nameW, true);
      }
      n += 1;
      drawRow(doc, row, n, i % 2 === 1, left, width, nameW, section.columns, h);
    });
  }

  closing(doc, left, width, bottom());
  footers(doc, left, width);
  return doc;
}

function header(doc, model, left, width) {
  const top = doc.y;
  const logoH = 52;
  const logoW = Math.round(logoH * 208 / 138);
  doc.image(LOGO, left, top, { height: logoH });

  // Контакты справа: телефоны крупно, ниже адрес площадки, режим и сайт.
  const colW = 185;
  const colX = left + width - colW;

  const textX = left + logoW + 12;
  doc.font('display').fontSize(22).fillColor(C.ink)
    .text(site.brand.toUpperCase(), textX, top + 2, { characterSpacing: 0.5, lineBreak: false });

  // «Цены на приём радиодеталей и плат в Омске» длиннее остальных и на 11 pt
  // заезжает на контакты: такой заголовок набираем мельче, а не переносим.
  const subtitle = `${model.title} ${site.cityIn}`;
  const room = colX - textX - 12;
  let size = 11;
  doc.font('bold');
  while (size > 8 && doc.fontSize(size).widthOfString(subtitle) > room) size -= 0.5;
  doc.fillColor(C.orange).text(subtitle, textX, top + 32 + (11 - size) / 2, { lineBreak: false });
  let y = top;
  doc.font('bold').fontSize(11).fillColor(C.ink);
  for (const p of site.phones) {
    doc.text(p.display, colX, y, { width: colW, align: 'right' });
    y += 14;
  }
  doc.font('text').fontSize(8).fillColor(C.muted);
  for (const line of [site.address.full, site.hours.short, host()]) {
    doc.text(line, colX, y + 1, { width: colW, align: 'right' });
    y += 10.5;
  }

  y = Math.max(top + logoH, y) + 10;
  doc.rect(left, y, width, 2).fill(C.orange);
  y += 10;

  doc.font('bold').fontSize(9).fillColor(C.ink)
    .text(`Цены на ${f.dateLong(model.updatedAt)}`, left, y, { width, continued: Boolean(model.note) });
  if (model.note) doc.font('text').fillColor(C.muted).text(`. ${model.note}`);
  doc.y += 2;
}

function sectionHead(doc, section, left, width, nameW, cont) {
  const y = doc.y;
  doc.rect(left, y, width, 20).fill(C.ink);
  doc.font('display').fontSize(10.5).fillColor('#FFFFFF')
    .text((section.title + (cont ? ' (продолжение)' : '')).toUpperCase(), left + 8, y + 2, {
      width: width - 120, lineBreak: false, ellipsis: true, characterSpacing: 0.4
    });
  if (section.unit) {
    doc.font('bold').fontSize(9).fillColor(C.orangeLight)
      .text(section.unit, left + width - 108, y + 5.5, { width: 100, align: 'right', lineBreak: false });
  }
  doc.y = y + 20;

  if (!section.head) return;
  const hy = doc.y;
  doc.font('bold').fontSize(7.5).fillColor(C.muted);
  doc.text('Позиция', left + NUM_W, hy + 5, { width: nameW - 8, lineBreak: false });
  let x = left + NUM_W + nameW;
  for (const col of section.columns) {
    doc.text(col.label, x, hy + 5, { width: col.width - 6, align: col.align || 'right', lineBreak: false });
    x += col.width;
  }
  doc.moveTo(left, hy + 17).lineTo(left + width, hy + 17).lineWidth(0.6).strokeColor(C.line).stroke();
  doc.y = hy + 18;
}

/** Высота строки по самой высокой ячейке: цена тоже может не влезть в одну строку. */
function rowHeight(doc, row, nameW, columns) {
  doc.font('text').fontSize(9);
  let h = doc.heightOfString(row.title, { width: nameW - 8 });
  if (row.note) {
    doc.fontSize(7.5);
    h += 1.5 + doc.heightOfString(row.note, { width: nameW - 8 });
  }
  columns.forEach((col, i) => {
    doc.font(col.plain ? 'text' : 'bold').fontSize(9);
    h = Math.max(h, doc.heightOfString(row.cells[i], { width: col.width - 6 }));
  });
  return h + PAD_Y * 2;
}

function drawRow(doc, row, n, zebra, left, width, nameW, columns, h) {
  const y = doc.y;
  if (zebra) doc.rect(left, y, width, h).fill(C.zebra);

  doc.font('text').fontSize(8).fillColor(C.muted)
    .text(String(n), left, y + PAD_Y + 1, { width: NUM_W - 6, align: 'right', lineBreak: false });

  const nameX = left + NUM_W;
  doc.font('text').fontSize(9).fillColor(C.text)
    .text(row.title, nameX, y + PAD_Y, { width: nameW - 8 });
  if (row.note) {
    doc.fontSize(7.5).fillColor(C.muted)
      .text(row.note, nameX, doc.y + 1.5, { width: nameW - 8 });
  }

  let x = nameX + nameW;
  columns.forEach((col, i) => {
    doc.font(col.plain ? 'text' : 'bold').fontSize(9).fillColor(col.plain ? C.muted : C.ink)
      .text(row.cells[i], x, y + PAD_Y, { width: col.width - 6, align: col.align || 'right' });
    x += col.width;
  });

  doc.y = y + h;
}

/** Под таблицей: кто принимает и по какой лицензии — прайс уходит людям в руки. */
function closing(doc, left, width, limit) {
  const lines = [
    `${site.legalName}, ИНН ${site.legal.inn}, ОГРН ${site.legal.ogrn}.`,
    `Лицензия ${site.legal.license.number} от ${site.legal.license.dateText}: ${site.legal.license.activity}.`,
    'Приём по паспорту РФ, расчёт переводом на карту, организациям на расчётный счёт. ' +
      `Актуальные цены на сайте ${host()}.`
  ];
  doc.font('text').fontSize(7.5);
  const h = lines.reduce((s, l) => s + doc.heightOfString(l, { width }) + 2, 14);
  if (doc.y + h > limit) doc.addPage();

  let y = doc.y + 12;
  doc.moveTo(left, y - 6).lineTo(left + width, y - 6).lineWidth(0.6).strokeColor(C.line).stroke();
  doc.fillColor(C.muted);
  for (const line of lines) {
    doc.text(line, left, y, { width });
    y = doc.y + 2;
  }
}

/** Колонтитул на каждой странице. Пишем ниже нижнего поля, иначе pdfkit заведёт новую страницу. */
function footers(doc, left, width) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    const margin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const y = doc.page.height - 32;
    doc.font('text').fontSize(7.5).fillColor(C.muted);
    doc.text(`${site.brand} · ${site.phonePrimary.display} · ${host()}`, left, y, { width, lineBreak: false });
    doc.text(`Стр. ${i + 1} из ${range.count}`, left, y, { width, align: 'right', lineBreak: false });
    doc.page.margins.bottom = margin;
  }
}

// --- выдача ------------------------------------------------------------------

function toBuffer(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

/**
 * PDF по данным. `source` — объект из store или catalogs, он же ключ кэша:
 * после правки в админке модули перечитывают JSON и отдают новый объект.
 */
async function build(source, makeModel) {
  const hit = cache.get(source);
  if (hit) return hit;
  const buffer = await toBuffer(render(makeModel()));
  cache.set(source, buffer);
  return buffer;
}

/** Отдать PDF скачиванием: `mbaza55-price-2026-09-05.pdf`. */
function send(res, buffer, slug, updatedAt) {
  const name = `${host().split('.')[0]}-${slug}-${updatedAt}.pdf`;
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="${name}"`,
    'Cache-Control': 'no-cache'
  });
  res.send(buffer);
}

module.exports = { fromPrices, fromCatalog, build, send };
