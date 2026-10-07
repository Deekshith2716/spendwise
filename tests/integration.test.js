// Integration test — boots discovery + category + expense + report in-process, exercises JWT flow.
// Run: npm test  (from spendwise/)
process.env.MONGO_URI = ''; // force in-memory store for tests
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');

const JWT = require('jsonwebtoken');
const SECRET = 'spendwise_super_secret_change_me';
process.env.JWT_SECRET = SECRET;

const discovery = require('../services/discovery/server.js');
const categoryApp = require('../services/category/server.js');
const expenseApp = require('../services/expense/server.js');
const reportApp = require('../services/report/server.js');

function listen(app) {
  return new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
}
const addr = (s) => `http://localhost:${s.address().port}`;

describe('microservices integration (Expense -> Category -> Report)', () => {
  let servers = [], urls = {};
  let token, catId;

  before(async () => {
    for (const a of [discovery, categoryApp, expenseApp, reportApp]) servers.push(await listen(a));
    urls = { category: addr(servers[1]), expense: addr(servers[2]), report: addr(servers[3]) };
    process.env.CATEGORY_SERVICE_URL = urls.category;
    process.env.EXPENSE_SERVICE_URL = urls.expense;
    token = JWT.sign({ user_id: 'u-test', email: 't@t.com', name: 'Test' }, SECRET);
  });
  after(() => servers.forEach((s) => s.close()));

  it('creates a category, logs an expense, builds a summary', async () => {
    const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
    let r = await fetch(`${urls.category}/`, { method: 'POST', headers: H, body: JSON.stringify({ name: 'TestCat', budgetThreshold: 1000 }) });
    assert.strictEqual(r.status, 201);
    catId = (await r.json()).category_id;

    r = await fetch(`${urls.expense}/`, { method: 'POST', headers: H, body: JSON.stringify({ amount: 250, date: '2026-10-05', categoryId: catId, note: 'lunch' }) });
    assert.strictEqual(r.status, 201);

    r = await fetch(`${urls.report}/summary?month=2026-10`, { headers: H });
    assert.strictEqual(r.status, 200);
    const s = await r.json();
    assert.strictEqual(s.total_expense, 250);
  });

  it('rejects expense with invalid category', async () => {
    const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
    const r = await fetch(`${urls.expense}/`, { method: 'POST', headers: H, body: JSON.stringify({ amount: 50, date: '2026-10-06', categoryId: 'nope' }) });
    assert.strictEqual(r.status, 400);
  });
});
