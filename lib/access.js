const crypto = require('node:crypto');

const COOKIE_NAME = 'fade_access';
const SESSION_SECONDS = 60 * 60 * 24 * 7;

function signature(expiresAt, secret) {
  return crypto.createHmac('sha256', secret).update(`fade-access-v1:${expiresAt}`).digest('hex');
}

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map(part => part.trim().split(/=(.*)/s).slice(0, 2)).filter(([key, value]) => key && value !== undefined));
}

function isAuthorized(request, secret = process.env.FADE_INVITE_CODE) {
  if (!secret) return false;
  const value = parseCookies(request.headers?.cookie)[COOKIE_NAME];
  if (!value) return false;
  const [expiryText, supplied] = value.split('.');
  const expiresAt = Number(expiryText);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000) || !/^[a-f0-9]{64}$/.test(supplied || '')) return false;
  const expected = signature(expiresAt, secret);
  return crypto.timingSafeEqual(Buffer.from(supplied, 'hex'), Buffer.from(expected, 'hex'));
}

function sessionCookie(request, secret = process.env.FADE_INVITE_CODE) {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const value = `${expiresAt}.${signature(expiresAt, secret)}`;
  const secure = request.headers?.['x-forwarded-proto'] === 'https' || process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${COOKIE_NAME}=${value}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${SESSION_SECONDS}${secure}`;
}

function clearedCookie(request) {
  const secure = request.headers?.['x-forwarded-proto'] === 'https' || process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0${secure}`;
}

module.exports = { COOKIE_NAME, isAuthorized, sessionCookie, clearedCookie };
