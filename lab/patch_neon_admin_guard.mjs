/**
 * Narrow experimental patch for pinned Neon Fist c28ffb7.
 * Fail-closed guard for /api/admin/* only; NOT a complete production auth/RBAC system.
 * Original MIT license attribution remains on the upstream distribution.
 * The patch is intentionally strict about source anchors to avoid silently
 * modifying unrelated versions.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const upstream = resolve(process.argv[2] || 'upstream');
const routesPath = resolve(upstream, 'src/server/liveopsRoutes.js');
const testPath = resolve(upstream, 'tests/t_liveops_http.js');

function replaceOnce(s, from, to, file) {
  if (!s.includes(from)) throw new Error(file + ' expected patch anchor missing');
  const pos = s.indexOf(from);
  if (s.indexOf(from, pos + from.length) !== -1) {
    throw new Error(file + ' patch anchor appears more than once');
  }
  return s.slice(0, pos) + to + s.slice(pos + from.length);
}
let routes = readFileSync(routesPath, 'utf8');
routes = replaceOnce(routes,
  "import express from 'express';",
  "import express from 'express';\nimport { createHash, timingSafeEqual } from 'node:crypto';",
  routesPath);

const anchor = "  const detector = new AbuseDetector();";
const guard = `
  // P0 experimental guard: default-deny admin endpoints without a strong secret.
  // A real public service must replace this with verified sessions, RBAC, audit
  // logs, rate limits and secure operational secret management.
  r.use('/admin', (req, res, next) => {
    const expected = process.env.NEON_ADMIN_TOKEN;
    if (typeof expected !== 'string' || Buffer.byteLength(expected) < 32) {
      return res.status(503).json({ error: 'admin_unconfigured' });
    }
    const auth = req.get('authorization');
    if (!auth || !auth.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'admin_authentication_required' });
    }
    const candidate = auth.slice('Bearer '.length);
    const receivedHash = createHash('sha256').update(candidate).digest();
    const expectedHash = createHash('sha256').update(expected).digest();
    if (!timingSafeEqual(receivedHash, expectedHash)) {
      return res.status(403).json({ error: 'admin_forbidden' });
    }
    return next();
  });
`;
routes = replaceOnce(routes, anchor, anchor + guard, routesPath);
writeFileSync(routesPath, routes);

let tests = readFileSync(testPath, 'utf8');
const getAnchor = "  const get = async p => (await fetch(url(p))).json();";
tests = replaceOnce(tests, getAnchor,
  "  const adminHeaders = p => p.startsWith('/api/admin/') ? { authorization: 'Bearer ' + process.env.NEON_ADMIN_TOKEN } : {};\n  const get = async p => (await fetch(url(p), { headers: adminHeaders(p) })).json();",
  testPath);
const postAnchor = "headers: { 'content-type': 'application/json' }";
tests = replaceOnce(tests, postAnchor,
  "headers: { 'content-type': 'application/json', ...adminHeaders(p) }",
  testPath);
const assertions = `
  // Guard regression: test unauthenticated/incorrect auth without disclosing the token.
  const anon = await fetch(url('/api/admin/config/kill'), {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ channel: 'stable', killed: true }),
  });
  t.eq(anon.status, 401, 'anonymous admin mutation rejected');

  const wrong = await fetch(url('/api/admin/config/kill'), {
    method: 'POST', headers: {
      'content-type': 'application/json', authorization: 'Bearer invalid'
    },
    body: JSON.stringify({ channel: 'stable', killed: true }),
  });
  t.eq(wrong.status, 403, 'wrong admin token rejected');

  const previousToken = process.env.NEON_ADMIN_TOKEN;
  delete process.env.NEON_ADMIN_TOKEN;
  try {
    const unconfigured = await fetch(url('/api/admin/config/kill'), {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ channel: 'stable', killed: true }),
    });
    t.eq(unconfigured.status, 503, 'missing admin token fails closed');
  } finally {
    process.env.NEON_ADMIN_TOKEN = previousToken;
  }
`;
const marker="  /* ---- Phase 16 over HTTP ---- */";
tests = replaceOnce(tests, marker, assertions + '\n' + marker, testPath);
writeFileSync(testPath, tests);
console.log('Applied experimental fail-closed /api/admin guard and 3 regression assertions (no token output).');
