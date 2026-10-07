// Expense Service — logs daily expenses. Validates category via Category Service (Expense -> Category).
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const app = express();
app.use(cors()); app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'spendwise_super_secret_change_me';
const PORT = process.env.PORT || 4003;
const SERVICE_NAME = 'expense-service';

let ExpModel = null;
(async () => {
  if (process.env.MONGO_URI) {
    try {
      const mongoose = require('mongoose');
      await mongoose.connect(process.env.MONGO_URI);
      const ExpSchema = new mongoose.Schema({
        userId: { type: String, required: true, index: true },
        categoryId: { type: String, index: true },
        amount: { type: Number, required: true, min: 0.01 },
        date: { type: String, required: true, index: true }, // YYYY-MM-DD
        note: { type: String, maxlength: 255 },
        paymentMethod: { type: String, default: 'cash', enum: ['cash', 'card', 'upi', 'netbanking', 'other'] },
      }, { timestamps: true });
      ExpSchema.index({ userId: 1, date: -1 }); // fast per-user monthly reads
      ExpSchema.index({ userId: 1, categoryId: 1, date: -1 }); // budget aggregation reads
      ExpModel = mongoose.model('Expense', ExpSchema);
      console.log('[expense] MongoDB connected');
    } catch (e) { console.warn('[expense] memory fallback:', e.message); }
  }
})();
let mem = [];

function auth(req, res, next) {
  const t = (req.headers.authorization || '').replace('Bearer ', '');
  if (!t) return res.status(401).json({ error: 'missing token' });
  try { req.user = jwt.verify(t, JWT_SECRET); next(); }
  catch { return res.status(401).json({ error: 'invalid token' }); }
}
const CAT_URL = () => process.env.CATEGORY_SERVICE_URL || 'http://localhost:4002';

// Inter-service call: validate category exists
async function validateCategory(categoryId, authHeader) {
  if (!categoryId) return null;
  try {
    const r = await fetch(`${CAT_URL()}/${categoryId}`, { headers: { Authorization: authHeader } });
    if (r.status === 404) throw Object.assign(new Error('invalid category_id'), { status: 400 });
    if (!r.ok) return null; // category service down -> allow with warning
    return await r.json();
  } catch (e) { if (e.status === 400) throw e; return null; }
}

async function monthTotal(userId, categoryId, month) {
  const list = ExpModel ? await ExpModel.find({ userId, ...(categoryId && { categoryId }) }) : mem.filter(e => e.userId === userId && (!categoryId || e.categoryId === categoryId));
  return list.filter(e => (e.date || '').startsWith(month)).reduce((s, e) => s + Number(e.amount), 0);
}

app.get('/health', (req, res) => res.json({ status: 'UP', service: SERVICE_NAME }));

function fmt(e) {
  return { expense_id: e._id ? e._id.toString() : e.expense_id, userId: e.userId, user_id: e.userId, amount: e.amount, date: e.date, categoryId: e.categoryId, category_id: e.categoryId, note: e.note, paymentMethod: e.paymentMethod };
}

// GET /?userId=&month=YYYY-MM&categoryId=&q=&sort=date&order=desc&page=1&limit=20
app.get('/', auth, async (req, res) => {
  const uid = req.query.userId || req.user.user_id;
  const { categoryId, month, q = '', sort = 'date', order = 'desc' } = req.query;
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));

  let list = ExpModel ? await ExpModel.find({ userId: uid }).lean() : mem.filter(e => e.userId === uid);
  if (categoryId) list = list.filter(e => (e.categoryId || e.category_id) === categoryId);
  if (month) list = list.filter(e => (e.date || '').startsWith(month));
  if (q) list = list.filter(e => (e.note || '').toLowerCase().includes(q.toLowerCase()));
  list = list.map(fmt).sort((a, b) => order === 'asc' ? (a[sort] > b[sort] ? 1 : -1) : (a[sort] < b[sort] ? 1 : -1));

  const total = list.length;
  const data = list.slice((page - 1) * limit, page * limit);
  res.json({ data, total, page, pages: Math.max(1, Math.ceil(total / limit)) });
});

app.post('/', auth, async (req, res) => {
  const { amount, date, categoryId, category_id, note = '', paymentMethod = 'cash' } = req.body;
  const cat = categoryId || category_id;
  if (!amount || Number(amount) <= 0) return res.status(400).json({ error: 'amount must be > 0' });
  const d = date || new Date().toISOString().slice(0, 10);
  let catInfo = null;
  try { catInfo = await validateCategory(cat, req.headers.authorization); }
  catch (e) { return res.status(400).json({ error: 'invalid category_id' }); }
  let saved;
  if (ExpModel) { const e = await ExpModel.create({ userId: req.user.user_id, categoryId: cat || null, amount: Number(amount), date: d, note, paymentMethod }); saved = { expense_id: e._id.toString(), userId: e.userId, amount: e.amount, date: e.date, categoryId: e.categoryId, note, paymentMethod }; }
  else { saved = { expense_id: crypto.randomUUID(), userId: req.user.user_id, amount: Number(amount), date: d, categoryId: cat || null, note, paymentMethod }; mem.push(saved); }
  // spending-threshold monitor
  let thresholdAlert = null;
  if (catInfo && catInfo.budgetThreshold > 0) {
    const total = await monthTotal(req.user.user_id, cat, d.slice(0, 7));
    if (total > catInfo.budgetThreshold) thresholdAlert = `Monthly spend ${total} exceeded budget ${catInfo.budgetThreshold} for ${catInfo.name}`;
  }
  res.status(201).json({ ...saved, thresholdAlert });
});

app.delete('/:id', auth, async (req, res) => {
  if (ExpModel) { await ExpModel.findByIdAndDelete(req.params.id); return res.json({ ok: true }); }
  mem = mem.filter(e => e.expense_id !== req.params.id); res.json({ ok: true });
});

// edit an expense (re-validates category + amount)
app.put('/:id', auth, async (req, res) => {
  const { amount, date, categoryId, note, paymentMethod } = req.body;
  if (amount !== undefined && Number(amount) <= 0) return res.status(400).json({ error: 'amount must be > 0' });
  if (categoryId !== undefined) {
    try { await validateCategory(categoryId, req.headers.authorization); }
    catch { return res.status(400).json({ error: 'invalid category_id' }); }
  }
  const patch = {};
  if (amount !== undefined) patch.amount = Number(amount);
  if (date) patch.date = date;
  if (categoryId !== undefined) patch.categoryId = categoryId;
  if (note !== undefined) patch.note = note;
  if (paymentMethod) patch.paymentMethod = paymentMethod;
  if (ExpModel) {
    const e = await ExpModel.findOneAndUpdate({ _id: req.params.id, userId: req.user.user_id }, patch, { new: true });
    if (!e) return res.status(404).json({ error: 'expense not found' });
    return res.json(fmt(e));
  }
  const e = mem.find(x => x.expense_id === req.params.id && x.userId === req.user.user_id);
  if (!e) return res.status(404).json({ error: 'expense not found' });
  Object.assign(e, patch); res.json(fmt(e));
});

const DISCOVERY = process.env.DISCOVERY_URL || 'http://localhost:8761';
let myId = null;
async function register() { try { const r = await fetch(`${DISCOVERY}/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: SERVICE_NAME, host: 'localhost', port: PORT }) }); myId = (await r.json()).id; } catch {} }
setInterval(async () => { if (!myId) return register(); try { await fetch(`${DISCOVERY}/heartbeat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: SERVICE_NAME, id: myId }) }); } catch {} }, 15000);

if (require.main === module) app.listen(PORT, () => { console.log(`[expense] :${PORT}`); register(); });
module.exports = app;
