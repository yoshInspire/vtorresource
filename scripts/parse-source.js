/** Парсит сохранённые страницы f-vm.ru в промежуточный JSON. */
const fs = require('fs');
const path = require('path');
const SRC = path.join(__dirname, '..', 'data', '_source');

const strip = s => s.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
  .replace(/&laquo;/g, '«').replace(/&raquo;/g, '»').replace(/&mdash;/g, '—')
  .replace(/\s+/g, ' ').replace(/\s+,/g, ',').trim();

const cut = html => {
  const a = html.indexOf('cvet_table');
  const b = html.indexOf('informer_table', a);
  return html.slice(a, b > 0 ? b : html.length);
};

// --- цветной ---------------------------------------------------------------
const cvetHtml = fs.readFileSync(path.join(SRC, 'price_raw.html'), 'utf8');
const cats = []; let cur = null;
for (const r of cut(cvetHtml).split(/<tr[^>]*>/i).slice(1)) {
  const cat = r.match(/<td[^>]*class="expand-td"[^>]*>([\s\S]*?)<\/td>/i);
  if (cat) { const n = strip(cat[1]); if (n) { cur = { name: n, items: [] }; cats.push(cur); } continue; }
  const tds = [...r.matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/gi)];
  const nameTd = tds.find(t => /<!--ID=/.test(t[2]));
  if (!cur || !nameTd) continue;
  const full = strip(nameTd[2]);
  let title = full, note = '';
  const m = full.match(/^(.*?)\s*\((.+)\)\s*$/s);
  if (m && m[2].length > 12) { title = m[1].trim(); note = m[2].trim(); }
  const p = {};
  for (const t of tds) { const c = (t[1].match(/class="(price[1-4])"/) || [])[1]; if (c) p[c] = strip(t[2]); }
  if (title) cur.items.push({ title, note, cash: p.price1 || '', bank_fiz: p.price2 || '', bank_ur: p.price3 || '', vip: p.price4 || '' });
}
fs.writeFileSync(path.join(SRC, 'price_parsed.json'), JSON.stringify(cats.filter(c => c.items.length), null, 2), 'utf8');

// --- чёрный ----------------------------------------------------------------
const cherHtml = fs.readFileSync(path.join(SRC, 'chermet_raw.html'), 'utf8');
const items = [];
for (const r of cut(cherHtml).split(/<tr[^>]*>/i).slice(1)) {
  const tds = [...r.matchAll(/<td([^>]*)>([\s\S]*?)(?=<\/td>|<td|$)/gi)];
  const nameCell = tds.find(t => /<b>/.test(t[2]));
  const priceCell = tds.find(t => /class="price1"/.test(t[1]));
  if (!nameCell || !priceCell) continue;
  const code = strip((nameCell[2].match(/<b>([\s\S]*?)<\/b>/) || [, ''])[1]);
  const desc = strip(nameCell[2].replace(/<b>[\s\S]*?<\/b>/, ''));
  if (!code && !desc) continue;
  items.push({ code, note: desc, price: strip(priceCell[2]) });
}
fs.writeFileSync(path.join(SRC, 'chermet_parsed.json'), JSON.stringify(items, null, 2), 'utf8');

console.log('cvet cats', cats.length, 'items', cats.reduce((a, c) => a + c.items.length, 0), '| chermet items', items.length);
