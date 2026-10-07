// Report Service — aggregates Expense + Category into summaries (Report -> Expense -> Category)
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const app = express();
app.use(cors()); app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'spendwise_super_secret_change_me';
const PORT = process.env.PORT || 4004;
const SERVICE_NAME = 'report-service';
const EXP_URL = () => process.env.EXPENSE_SERVICE_URL || 'http://localhost:4003';
const CAT_URL = () => process.env.CATEGORY_SERVICE_URL || 'http://localhost:4002';

let RepModel = null;
(async () => {
  if (process.env.MONGO_URI) {
    try {
      const mongoose = require('mongoose');
      await mongoose.connect(process.env.MONGO_URI);
      RepModel = mongoose.model('Report', new mongoose.Schema({
        userId: { type: String, required: true, index: true }, totalExpense: Number, month: { type: String, index: true }, breakdown: Object,
      }, { timestamps: true }));
      console.log('[report] MongoDB connected');
    } catch (e) { console.warn('[report] memory fallback:', e.message); }
  }
})();
let memReports = [];

function auth(req, res, next) {
  const t = (req.headers.authorization || '').replace('Bearer ', '');
  if (!t) return res.status(401).json({ error: 'missing token' });
  try { req.user = jwt.verify(t, JWT_SECRET); next(); }
  catch { return res.status(401).json({ error: 'invalid token' }); }
}

// Pure aggregation — also unit-tested in tests/
function buildSummary(expenses, categories, month) {
  const list = month ? expenses.filter(e => (e.date || '').startsWith(month)) : expenses;
  const catName = Object.fromEntries(categories.map(c => [c.category_id || c._id, c.name]));
  const catBudget = Object.fromEntries(categories.map(c => [c.category_id || c._id, c.budgetThreshold || 0]));
  const total = list.reduce((s, e) => s + Number(e.amount), 0);
  const byCategory = {};
  for (const e of list) {
    const key = e.categoryId || e.category_id || 'uncategorized';
    byCategory[key] = byCategory[key] || { categoryId: key, name: catName[key] || key, total: 0, count: 0, budget: catBudget[key] || 0 };
    byCategory[key].total += Number(e.amount); byCategory[key].count += 1;
  }
  const rows = Object.values(byCategory);
  const alerts = rows.filter(r => r.budget > 0 && r.total > r.budget).map(r => `${r.name}: spent ${r.total} over budget ${r.budget}`);
  const daily = {};
  for (const e of list) daily[e.date] = (daily[e.date] || 0) + Number(e.amount);
  return { total_expense: total, totalExpense: total, count: list.length, month: month || 'all', byCategory: rows, daily, alerts };
}
app.buildSummary = buildSummary;

app.get('/health', (req, res) => res.json({ status: 'UP', service: SERVICE_NAME }));

// GET /summary?userId=&month=YYYY-MM — live aggregation across services
app.get('/summary', auth, async (req, res) => {
  const uid = req.query.userId || req.user.user_id;
  const month = req.query.month || '';
  const H = { Authorization: req.headers.authorization };
  const [er, cr] = await Promise.all([
    fetch(`${EXP_URL()}/?userId=${uid}${month ? `&month=${month}` : ''}&limit=100`, { headers: H }).then(r => r.json()).catch(() => []),
    fetch(`${CAT_URL()}/`, { headers: H }).then(r => r.json()).catch(() => []),
  ]);
  const expenses = Array.isArray(er) ? er : (er.data || []);
  res.json({ user_id: uid, ...buildSummary(expenses, Array.isArray(cr) ? cr : [], month) });
});

// GET /export?month=YYYY-MM — download the monthly summary as CSV
app.get('/export', auth, async (req, res) => {
  const uid = req.query.userId || req.user.user_id;
  const month = req.query.month || '';
  const H = { Authorization: req.headers.authorization };
  const [er, cr] = await Promise.all([
    fetch(`${EXP_URL()}/?userId=${uid}${month ? `&month=${month}` : ''}&limit=100`, { headers: H }).then(r => r.json()).catch(() => []),
    fetch(`${CAT_URL()}/`, { headers: H }).then(r => r.json()).catch(() => []),
  ]);
  const expenses = Array.isArray(er) ? er : (er.data || []);
  const s = buildSummary(expenses, Array.isArray(cr) ? cr : [], month);
  const rows = [['Category', 'Transactions', 'Total', 'Budget', 'Status']];
  for (const c of s.byCategory) rows.push([c.name, c.count, c.total, c.budget || '', c.budget && c.total > c.budget ? 'OVER BUDGET' : 'OK']);
  rows.push(['TOTAL', s.count, s.total_expense, '', '']);
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  res.header('Content-Type', 'text/csv');
  res.attachment(`spendwise-${month || 'all'}.csv`);
  res.send(csv);
});
// Saved snapshots (report_id, user_id, total_expense)
app.post('/', auth, async (req, res) => {
  const { user_id, total_expense, month = '', breakdown = {} } = req.body;
  const rec = { report_id: crypto.randomUUID(), user_id: user_id || req.user.user_id, total_expense: Number(total_expense) || 0, month, breakdown };
  if (RepModel) { const r = await RepModel.create({ userId: rec.user_id, totalExpense: rec.total_expense, month, breakdown }); rec.report_id = r._id.toString(); }
  else memReports.push(rec);
  res.status(201).json(rec);
});
app.get('/', auth, async (req, res) => {
  if (RepModel) return res.json((await RepModel.find({ userId: req.user.user_id })).map(r => ({ report_id: r._id.toString(), user_id: r.userId, total_expense: r.totalExpense, month: r.month, breakdown: r.breakdown })));
  res.json(memReports.filter(r => r.user_id === req.user.user_id));
});

const DISCOVERY = process.env.DISCOVERY_URL || 'http://localhost:8761';
let myId = null;
async function register() { try { const r = await fetch(`${DISCOVERY}/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: SERVICE_NAME, host: 'localhost', port: PORT }) }); myId = (await r.json()).id; } catch {} }
setInterval(async () => { if (!myId) return register(); try { await fetch(`${DISCOVERY}/heartbeat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: SERVICE_NAME, id: myId }) }); } catch {} }, 15000);

if (require.main === module) app.listen(PORT, () => { console.log(`[report] :${PORT}`); register(); });
module.exports = app;
