// Discovery Server — Eureka equivalent for MERN (service registry + heartbeat + round-robin data)
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const app = express();
app.use(cors()); app.use(express.json());

// registry: { serviceName: [ { id, host, port, url, lastHeartbeat } ] }
const registry = {};
const TTL_MS = 30000;

function cleanup() {
  const now = Date.now();
  for (const name of Object.keys(registry)) {
    registry[name] = registry[name].filter(i => now - i.lastHeartbeat < TTL_MS);
    if (!registry[name].length) delete registry[name];
  }
}
setInterval(cleanup, 10000);

app.post('/register', (req, res) => {
  const { name, host, port, url: publicUrl } = req.body;
  if (!name || !port) return res.status(400).json({ error: 'name and port required' });
  const h = host || 'localhost';
  const id = `${name}-${h}-${port}-${Date.now()}`;
  const url = publicUrl || `http://${h}:${port}`;
  registry[name] = registry[name] || [];
  registry[name] = registry[name].filter(i => i.url !== url);
  registry[name].push({ id, name, host: h, port, url, lastHeartbeat: Date.now() });
  res.json({ id, name, url });
});

app.post('/heartbeat', (req, res) => {
  const { name, id, url } = req.body;
  const list = registry[name] || [];
  const inst = list.find(i => i.id === id || i.url === url);
  if (!inst) return res.status(404).json({ error: 'instance not found, re-register' });
  inst.lastHeartbeat = Date.now();
  res.json({ ok: true });
});

app.get('/services', (req, res) => { cleanup(); res.json(registry); });
app.get('/services/:name', (req, res) => {
  cleanup();
  const list = registry[req.params.name] || [];
  if (!list.length) return res.status(404).json({ error: 'no instances' });
  res.json(list);
});

app.get('/health', (req, res) => res.json({ status: 'UP', services: Object.keys(registry) }));

const PORT = process.env.PORT || 8761;
if (require.main === module) app.listen(PORT, () => console.log(`[discovery] :${PORT}`));
module.exports = app;
