// Auth Service — JWT register/login/verify (MERN). Uses MongoDB if MONGO_URI set, else memory.
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const app = express();
app.use(cors()); app.use(express.json());
const JWT_SECRET = process.env.JWT_SECRET || 'spendwise_super_secret_change_me';
const PORT = process.env.PORT || 4001;
const SERVICE_NAME = 'auth-service';

// --- optional Mongo ---
let UserModel = null;
(async () => {
  if (process.env.MONGO_URI) {
    try {
      const mongoose = require('mongoose');
      await mongoose.connect(process.env.MONGO_URI);
      UserModel = mongoose.model('User', new mongoose.Schema({
        name: String, email: { type: String, unique: true }, passwordHash: String,
      }, { timestamps: true }));
      console.log('[auth] MongoDB connected');
    } catch (e) { console.warn('[auth] Mongo fallback to memory:', e.message); }
  }
})();

// --- memory fallback ---
const users = new Map(); // email -> { user_id, name, email, passwordHash }

async function findUser(email) {
  if (UserModel) { const u = await UserModel.findOne({ email }); return u ? { user_id: u._id.toString(), name: u.name, email: u.email, passwordHash: u.passwordHash } : null; }
  return users.get(email) || null;
}
async function saveUser({ name, email, passwordHash }) {
  if (UserModel) { const u = await UserModel.create({ name, email, passwordHash }); return { user_id: u._id.toString(), name, email }; }
  const user_id = crypto.randomUUID();
  users.set(email, { user_id, name, email, passwordHash });
  return { user_id, name, email };
}

const sign = (u) => jwt.sign({ user_id: u.user_id, email: u.email, name: u.name }, JWT_SECRET, { expiresIn: '12h' });

app.post('/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'name, email, password required' });
  if (String(password).length < 6) return res.status(400).json({ error: 'password must be at least 6 characters' });
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'invalid email address' });
  if (await findUser(email)) return res.status(409).json({ error: 'email already registered' });
  const passwordHash = await bcrypt.hash(password, 10);
  const u = await saveUser({ name, email, passwordHash });
  res.status(201).json({ ...u, token: sign(u) });
});

// basic login rate-limit: max 8 attempts / minute per IP
const attempts = new Map();
function rateLimit(req, res, next) {
  const key = req.ip; const now = Date.now();
  const arr = (attempts.get(key) || []).filter(t => now - t < 60000);
  if (arr.length >= 8) return res.status(429).json({ error: 'too many attempts, try again in a minute' });
  arr.push(now); attempts.set(key, arr); next();
}

app.post('/login', rateLimit, async (req, res) => {
  const { email, password } = req.body;
  const u = await findUser(email);
  if (!u || !(await bcrypt.compare(password, u.passwordHash))) return res.status(401).json({ error: 'invalid credentials' });
  const { passwordHash: _, ...safe } = u;
  res.json({ ...safe, token: sign(u) });
});

// Used by other services / gateway to validate a token
app.post('/verify', (req, res) => {
  const token = req.body.token || (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'no token' });
  try { res.json({ valid: true, user: jwt.verify(token, JWT_SECRET) }); }
  catch { res.status(401).json({ valid: false, error: 'invalid token' }); }
});

app.get('/health', (req, res) => res.json({ status: 'UP', service: SERVICE_NAME }));

// current user profile (requires token)
app.get('/me', (req, res) => {
  const t = (req.headers.authorization || '').replace('Bearer ', '');
  if (!t) return res.status(401).json({ error: 'no token' });
  try {
    const { user_id, email, name } = jwt.verify(t, JWT_SECRET);
    res.json({ user_id, email, name });
  } catch { res.status(401).json({ error: 'invalid token' }); }
});

// self-register to discovery + heartbeat (Eureka client equivalent)
const DISCOVERY = process.env.DISCOVERY_URL || 'http://localhost:8761';
let myId = null;
async function register() {
  try {
    const r = await fetch(`${DISCOVERY}/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: SERVICE_NAME, host: 'localhost', port: PORT }) });
    const j = await r.json(); myId = j.id;
  } catch {}
}
setInterval(async () => {
  if (!myId) return register();
  try { await fetch(`${DISCOVERY}/heartbeat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: SERVICE_NAME, id: myId }) }); }
  catch {}
}, 15000);

if (require.main === module) app.listen(PORT, async () => { console.log(`[auth] :${PORT}`); register(); });
module.exports = app;
