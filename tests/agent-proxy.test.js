const test = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../api/agent/[...path]');
const { sessionCookie } = require('../lib/access');

function mockResponse() {
  return {
    headers: {},
    statusCode: null,
    body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    send(value) { this.body = value; return this; }
  };
}

test('agent proxy requires a configured server API key', async () => {
  const original = { invite: process.env.FADE_INVITE_CODE, api: process.env.FADE_AGENT_API_KEY, origin: process.env.FADE_AGENT_API_ORIGIN };
  process.env.FADE_INVITE_CODE = 'invite-secret';
  process.env.FADE_AGENT_API_ORIGIN = 'https://agent.example.test';
  delete process.env.FADE_AGENT_API_KEY;
  try {
    const response = mockResponse();
    await handler({ method: 'GET', headers: { cookie: sessionCookie({ headers: {} }, 'invite-secret').split(';')[0] }, query: { path: ['health'] } }, response);
    assert.equal(response.statusCode, 503);
    assert.match(response.body.error, /FADE_AGENT_API_KEY/);
  } finally {
    if (original.invite === undefined) delete process.env.FADE_INVITE_CODE;
    else process.env.FADE_INVITE_CODE = original.invite;
    if (original.api === undefined) delete process.env.FADE_AGENT_API_KEY;
    else process.env.FADE_AGENT_API_KEY = original.api;
    if (original.origin === undefined) delete process.env.FADE_AGENT_API_ORIGIN;
    else process.env.FADE_AGENT_API_ORIGIN = original.origin;
  }
});

test('agent proxy injects only its server API key, not a client Authorization header', async () => {
  const original = { invite: process.env.FADE_INVITE_CODE, api: process.env.FADE_AGENT_API_KEY, origin: process.env.FADE_AGENT_API_ORIGIN, fetch: global.fetch };
  process.env.FADE_INVITE_CODE = 'invite-secret';
  process.env.FADE_AGENT_API_KEY = 'server-secret';
  process.env.FADE_AGENT_API_ORIGIN = 'https://agent.example.test';
  let forwardedHeaders;
  global.fetch = async (_url, options) => {
    forwardedHeaders = options.headers;
    return { status: 200, headers: { get: () => 'application/json' }, arrayBuffer: async () => Buffer.from('{}') };
  };
  try {
    const cookie = sessionCookie({ headers: {} }, 'invite-secret').split(';')[0];
    const response = mockResponse();
    await handler({ method: 'GET', headers: { cookie, authorization: 'Bearer client-controlled' }, query: { path: ['health'] } }, response);
    assert.equal(response.statusCode, 200);
    assert.equal(forwardedHeaders.authorization, 'Bearer server-secret');
    assert.equal(Object.keys(forwardedHeaders).length, 1);
  } finally {
    for (const [name, value] of [['FADE_INVITE_CODE', original.invite], ['FADE_AGENT_API_KEY', original.api], ['FADE_AGENT_API_ORIGIN', original.origin]]) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    global.fetch = original.fetch;
  }
});
