// Unit tests — run with: npm test  (from spendwise/)
process.env.MONGO_URI = ''; // force in-memory store for tests
const { describe, it } = require('node:test');
const assert = require('node:assert');
const { buildSummary } = require('../services/report/server.js');

describe('Report.buildSummary', () => {
  it('totals expenses and groups by category', () => {
    const expenses = [
      { amount: 100, date: '2026-10-01', categoryId: 'c-food' },
      { amount: 200, date: '2026-10-02', categoryId: 'c-food' },
      { amount: 500, date: '2026-10-03', categoryId: 'c-travel' },
    ];
    const cats = [
      { category_id: 'c-food', name: 'Food & Dining', budgetThreshold: 250 },
      { category_id: 'c-travel', name: 'Travel', budgetThreshold: 1000 },
    ];
    const s = buildSummary(expenses, cats, '2026-10');
    assert.strictEqual(s.total_expense, 800);
    assert.strictEqual(s.byCategory.length, 2);
    assert.strictEqual(s.alerts.length, 1); // food 300 > budget 250
  });

  it('filters by month', () => {
    const expenses = [
      { amount: 100, date: '2026-09-01', categoryId: 'c-food' },
      { amount: 400, date: '2026-10-01', categoryId: 'c-food' },
    ];
    const s = buildSummary(expenses, [], '2026-10');
    assert.strictEqual(s.total_expense, 400);
  });
});
