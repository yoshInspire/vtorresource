'use strict';

const crypto = require('crypto');

/**
 * Авторизация админки без внешних зависимостей.
 *
 * Сессия — подписанная кука: `<expires>.<hmac>`. Сервер ничего не хранит,
 * подпись проверяется секретом из окружения. Этого достаточно для одного
 * администратора; появится второй — здесь же меняется на нормальные сессии.
 *
 * Переменные окружения (см. .env.example):
 *   ADMIN_PASSWORD — пароль входа, без него админка выключена целиком;
 *   ADMIN_SECRET   — секрет для подписи куки и CSRF-токенов.
 *
 * Если ADMIN_SECRET не задан, он выводится из пароля. Это хуже отдельного
 * секрета (смена пароля разлогинивает), но лучше предсказуемой строки в коде.
 */

const COOKIE = 'vr_admin';
const TTL_MS = 12 * 60 * 60 * 1000; // 12 часов

function password() {
  return process.env.ADMIN_PASSWORD || '';
}

function secret() {
  return process.env.ADMIN_SECRET || (password() ? `derived:${password()}` : '');
}

/** Админка доступна, только если пароль задан в окружении. */
function isEnabled() {
  return password().length > 0;
}

function sign(value) {
  return crypto.createHmac('sha256', secret()).update(value).digest('hex');
}

/** Сравнение без утечки времени: важно и для пароля, и для подписей. */
function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function checkPassword(input) {
  if (!isEnabled()) return false;
  return safeEqual(input || '', password());
}

function createToken() {
  const expires = String(Date.now() + TTL_MS);
  return `${expires}.${sign(expires)}`;
}

function verifyToken(token) {
  if (!token || !isEnabled()) return false;
  const [expires, mac] = String(token).split('.');
  if (!expires || !mac) return false;
  if (!safeEqual(mac, sign(expires))) return false;
  return Number(expires) > Date.now();
}

/** Куки парсим руками: cookie-parser ради одной строки ставить незачем. */
function readCookie(req, name) {
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return null;
}

function setSession(res, token) {
  const flags = [
    `${COOKIE}=${encodeURIComponent(token)}`,
    'Path=/admin',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${Math.floor(TTL_MS / 1000)}`
  ];
  if (process.env.NODE_ENV === 'production') flags.push('Secure');
  res.setHeader('Set-Cookie', flags.join('; '));
}

function clearSession(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=0`);
}

function currentToken(req) {
  return readCookie(req, COOKIE);
}

function isAuthorized(req) {
  return verifyToken(currentToken(req));
}

/**
 * CSRF-токен привязан к сессии: без сессии его не подделать, а сессионная
 * кука помечена SameSite=Strict, поэтому чужая форма её не отправит.
 */
function csrfToken(req) {
  const token = currentToken(req);
  return token ? sign(`csrf:${token}`) : '';
}

function checkCsrf(req) {
  const sent = (req.body && req.body._csrf) || '';
  const expected = csrfToken(req);
  return Boolean(expected) && safeEqual(sent, expected);
}

module.exports = {
  COOKIE,
  isEnabled,
  checkPassword,
  createToken,
  isAuthorized,
  setSession,
  clearSession,
  csrfToken,
  checkCsrf
};
