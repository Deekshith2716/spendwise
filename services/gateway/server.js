// API Gateway — single entry point (:4000): JWT check, discovery-aware routing + round-robin load balancing
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const app = express();
app.use(cors()); app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'spendwise_super_secret_change_me';
const PORT = process.env.PORT || 4000;
// Render's `host` property may be a bare hostname — ensure a URL scheme.
function norm(u) { u = String(u || '').trim().replace(/\/+$/, ''); if (u && !/^https?:\/\//i.test(u)) u = 'https://' + u; return u; }
const DISCOVERY = norm(process.env.DISCOVERY_URL || 'http://localhost:8761');

const FALLBACK = {
  'auth-service': () => norm(process.env.AUTH_SERVICE_URL || 'http://localhost:4001'),
  'category-service': () => norm(process.env.CATEGORY_SERVICE_URL || 'http://localhost:4002'),
  'expense-service': () => norm(process.env.EXPENSE_SERVICE_URL || 'http://localhost:4003'),
  'report-service': () => norm(process.env.REPORT_SERVICE_URL || 'http://localhost:4004'),
};
const rr = {}; // round-robin counters

async function resolveService(name) {
  try {
    const r = await fetch(`${DISCOVERY}/services/${name}`);
    if (r.ok) {
      const list = await r.json();
      if (list.length) { rr[name] = ((rr[name] || 0) + 1) % list.length; return list[rr[name]].url; }
    }
  } catch {}
  return FALLBACK[name]();
}

// JWT guard — everything except /api/auth/* needs a token
function gatewayAuth(req, res, next) {
  if (req.path === '/health' || req.path.startsWith('/api/auth')) return next();
  const t = (req.headers.authorization || '').replace('Bearer ', '');
  if (!t) return res.status(401).json({ error: 'missing token (login first)' });
  try { req.user = jwt.verify(t, JWT_SECRET); next(); }
  catch { return res.status(401).json({ error: 'invalid/expired token' }); }
}
app.use(gatewayAuth);

async function proxy(serviceName, req, res, strip) {
  const base = norm(await resolveService(serviceName));
  const target = base + req.originalUrl.replace(strip, '');
  try {
    const r = await fetch(target, {
      method: req.method,
      headers: { 'Content-Type': 'application/json', ...(req.headers.authorization && { Authorization: req.headers.authorization }) },
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body || {}),
    });
    const data = await r.text();
    res.status(r.status);
    const ct = r.headers.get('content-type'); if (ct) res.set('Content-Type', ct);
    const cd = r.headers.get('content-disposition'); if (cd) res.set('Content-Disposition', cd);
    let parsed = null;
    try { parsed = JSON.parse(data); } catch {}
    if (parsed) return res.json(parsed);
    // Downstream returned a non-JSON error page (e.g. host waking up) — normalize it
    if (r.status >= 400) return res.status(502).json({ error: `Servers are waking up — please retry in ~30 seconds`, retry: true });
    res.send(data);
  } catch (e) { res.status(502).json({ error: `${serviceName} unreachable`, detail: e.message }); }
}

app.use('/api/auth', (req, res) => proxy('auth-service', req, res, '/api/auth'));
app.use('/api/categories', (req, res) => proxy('category-service', req, res, '/api/categories'));
app.use('/api/expenses', (req, res) => proxy('expense-service', req, res, '/api/expenses'));
app.use('/api/reports', (req, res) => proxy('report-service', req, res, '/api/reports'));
app.get('/health', (req, res) => res.json({ status: 'UP', service: 'api-gateway' }));

if (require.main === module) app.listen(PORT, () => console.log(`[gateway] :${PORT} -> discovery ${DISCOVERY}`));
module.exports = app;
