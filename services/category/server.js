// Category Service — manages spending taxonomy (category_id, name, budget_threshold)
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const app = express();
app.use(cors()); app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'spendwise_super_secret_change_me';
const PORT = process.env.PORT || 4002;
const SERVICE_NAME = 'category-service';

let CatModel = null;
(async () => {
  if (process.env.MONGO_URI) {
    try {
      const mongoose = require('mongoose');
      await mongoose.connect(process.env.MONGO_URI);
      CatModel = mongoose.model('Category', new mongoose.Schema({
        userId: { type: String, index: true }, name: { type: String, required: true }, budgetThreshold: { type: Number, default: 0, min: 0 },
      }, { timestamps: true }));
      console.log('[category] MongoDB connected');
    } catch (e) { console.warn('[category] memory fallback:', e.message); }
  }
})();

let mem = [
  { category_id: 'c-food', name: 'Food & Dining', budgetThreshold: 15000, userId: null },
  { category_id: 'c-travel', name: 'Travel', budgetThreshold: 20000, userId: null },
  { category_id: 'c-util', name: 'Utilities', budgetThreshold: 8000, userId: null },
  { category_id: 'c-shop', name: 'Shopping', budgetThreshold: 12000, userId: null },
  { category_id: 'c-health', name: 'Health', budgetThreshold: 10000, userId: null },
];

// JWT guard (gateway already checks, but services verify independently)
function auth(req, res, next) {
  const t = (req.headers.authorization || '').replace('Bearer ', '');
  if (!t) return res.status(401).json({ error: 'missing token' });
  try { req.user = jwt.verify(t, JWT_SECRET); next(); }
  catch { return res.status(401).json({ error: 'invalid token' }); }
}

async function allCats() { if (CatModel) return (await CatModel.find()).map(c => ({ category_id: c._id.toString(), name: c.name, budgetThreshold: c.budgetThreshold, userId: c.userId })); return mem; }

app.get('/health', (req, res) => res.json({ status: 'UP', service: SERVICE_NAME }));
app.get('/', auth, async (req, res) => {
  const cats = await allCats();
  res.json(cats.filter(c => !c.userId || c.userId === req.user.user_id));
});
app.get('/:id', auth, async (req, res) => {
  const cats = await allCats();
  const c = cats.find(x => x.category_id === req.params.id);
  if (!c) return res.status(404).json({ error: 'category not found' });
  res.json(c);
});
app.post('/', auth, async (req, res) => {
  const { name, budgetThreshold = 0 } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  if (CatModel) { const c = await CatModel.create({ name, budgetThreshold, userId: req.user.user_id }); return res.status(201).json({ category_id: c._id.toString(), name, budgetThreshold }); }
  const c = { category_id: crypto.randomUUID(), name, budgetThreshold: Number(budgetThreshold) || 0, userId: req.user.user_id };
  mem.push(c); res.status(201).json(c);
});
app.put('/:id', auth, async (req, res) => {
  const { name, budgetThreshold } = req.body;
  if (CatModel) { const c = await CatModel.findByIdAndUpdate(req.params.id, { ...(name && { name }), ...(budgetThreshold !== undefined && { budgetThreshold }) }, { new: true }); if (!c) return res.status(404).json({ error: 'not found' }); return res.json({ category_id: c._id.toString(), name: c.name, budgetThreshold: c.budgetThreshold }); }
  const c = mem.find(x => x.category_id === req.params.id);
  if (!c) return res.status(404).json({ error: 'not found' });
  if (name) c.name = name; if (budgetThreshold !== undefined) c.budgetThreshold = Number(budgetThreshold);
  res.json(c);
});
app.delete('/:id', auth, async (req, res) => {
  if (CatModel) { await CatModel.findByIdAndDelete(req.params.id); return res.json({ ok: true }); }
  mem = mem.filter(x => x.category_id !== req.params.id); res.json({ ok: true });
});

const DISCOVERY = process.env.DISCOVERY_URL || 'http://localhost:8761';
let myId = null;
async function register() { try { const r = await fetch(`${DISCOVERY}/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: SERVICE_NAME, host: process.env.SERVICE_HOST || 'localhost', port: PORT, url: process.env.SERVICE_URL || process.env.RENDER_EXTERNAL_URL || undefined }) }); myId = (await r.json()).id; } catch {} }
setInterval(async () => { if (!myId) return register(); try { await fetch(`${DISCOVERY}/heartbeat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: SERVICE_NAME, id: myId }) }); } catch {} }, 15000);

if (require.main === module) app.listen(PORT, () => { console.log(`[category] :${PORT}`); register(); });
module.exports = app;
