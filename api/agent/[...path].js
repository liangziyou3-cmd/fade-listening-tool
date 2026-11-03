const { isAuthorized } = require('../../lib/access');

module.exports = async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (!isAuthorized(request)) {
    response.status(401).json({ error: 'Enter a valid invite code to use Fade Agent.' });
    return;
  }

  const origin = process.env.FADE_AGENT_API_ORIGIN;
  if (!origin) {
    response.status(503).json({ error: 'FADE_AGENT_API_ORIGIN is not configured.' });
    return;
  }

  const segments = Array.isArray(request.query.path) ? request.query.path : [request.query.path].filter(Boolean);
  const target = new URL(segments.map(segment => encodeURIComponent(segment)).join('/'), `${origin.replace(/\/$/, '')}/`);
  const query = new URLSearchParams(request.query);
  query.delete('path');
  target.search = query.toString();
  const headers = {};
  if (request.headers['content-type']) headers['content-type'] = request.headers['content-type'];

  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : JSON.stringify(request.body || {})
    });
    const body = Buffer.from(await upstream.arrayBuffer());
    response.status(upstream.status);
    response.setHeader('content-type', upstream.headers.get('content-type') || 'application/json');
    response.send(body);
  } catch (error) {
    response.status(502).json({ error: `Agent API proxy failed: ${error.message}` });
  }
};
