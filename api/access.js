const crypto = require('node:crypto');
const { isAuthorized, sessionCookie, clearedCookie } = require('../lib/access');

function sameSecret(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Vary', 'Cookie');

  if (request.method === 'GET') {
    response.status(isAuthorized(request) ? 200 : 401).json({ authorized: isAuthorized(request) });
    return;
  }

  if (request.method === 'DELETE') {
    response.setHeader('Set-Cookie', clearedCookie(request));
    response.status(204).end();
    return;
  }

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'GET, POST, DELETE');
    response.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  const inviteCode = request.body?.invite_code;
  const configuredCode = process.env.FADE_INVITE_CODE;
  if (!configuredCode) {
    response.status(503).json({ error: 'Invite access is not configured on the server.' });
    return;
  }
  if (!sameSecret(inviteCode, configuredCode)) {
    response.status(401).json({ error: 'That invite code is not valid.' });
    return;
  }

  response.setHeader('Set-Cookie', sessionCookie(request, configuredCode));
  response.status(200).json({ authorized: true });
};
