const test = require('node:test');
const assert = require('node:assert/strict');
const { isAuthorized, sessionCookie, clearedCookie } = require('../lib/access');

test('invite session grants access only with the issuing secret', () => {
  const issued = sessionCookie({ headers: {} }, 'first-secret');
  const cookie = issued.split(';')[0];
  assert.match(issued, /HttpOnly/);
  assert.match(issued, /SameSite=Strict/);
  assert.equal(isAuthorized({ headers: { cookie } }, 'first-secret'), true);
  assert.equal(isAuthorized({ headers: { cookie } }, 'other-secret'), false);
  assert.equal(isAuthorized({ headers: {} }, 'first-secret'), false);
  assert.match(clearedCookie({ headers: {} }), /Max-Age=0/);
});

test('invite session rejects expired and malformed cookies', () => {
  assert.equal(isAuthorized({ headers: { cookie: `fade_access=1.${'0'.repeat(64)}` } }, 'secret'), false);
  assert.equal(isAuthorized({ headers: { cookie: 'fade_access=invalid' } }, 'secret'), false);
  assert.equal(isAuthorized({ headers: { cookie: 'fade_access=garbage.abc' } }, 'secret'), false);
});
