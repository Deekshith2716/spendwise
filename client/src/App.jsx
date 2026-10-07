import React, { useEffect, useState } from 'react';
import { api } from './api.js';

const input = { padding: 8, margin: 4, border: '1px solid #ccc', borderRadius: 6 };
const btn = { padding: '8px 14px', margin: 4, border: 0, borderRadius: 6, background: '#111827', color: '#fff', cursor: 'pointer' };

export default function App() {
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('user') || 'null'));
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [expenses, setExpenses] = useState([]);
  const [cats, setCats] = useState([]);
  const [summary, setSummary] = useState(null);
  const [exp, setExp] = useState({ amount: '', date: new Date().toISOString().slice(0, 10), categoryId: '', note: '' });
  const [cat, setCat] = useState({ name: '', budgetThreshold: '' });
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));

  const load = async () => {
    try {
      setCats(await api('/api/categories'));
      setExpenses(await api('/api/expenses'));
      setSummary(await api(`/api/reports/summary?month=${month}`));
    } catch (e) { console.warn(e.message); }
  };
  useEffect(() => { if (user) load(); }, [user]);

  const login = async (path) => {
    const j = await api(`/api/auth/${path}`, { method: 'POST', body: path === 'login' ? { email: form.email, password: form.password } : form });
    localStorage.setItem('token', j.token); localStorage.setItem('user', JSON.stringify(j)); setUser(j); load();
  };
  const logout = () => { localStorage.clear(); setUser(null); };

  const addExpense = async () => {
    const j = await api('/api/expenses', { method: 'POST', body: { amount: Number(exp.amount), date: exp.date, categoryId: exp.categoryId || undefined, note: exp.note } });
    if (j.thresholdAlert) alert('⚠ ' + j.thresholdAlert);
    setExp({ ...exp, amount: '', note: '' }); load();
  };
  const addCat = async () => { await api('/api/categories', { method: 'POST', body: { name: cat.name, budgetThreshold: Number(cat.budgetThreshold) || 0 } }); setCat({ name: '', budgetThreshold: '' }); load(); };

  if (!user) return (
    <div style={{ maxWidth: 420, margin: '60px auto', fontFamily: 'sans-serif' }}>
      <h1>SpendWise 💰</h1><p>Expense Analytics & Budget Reconciliation (MERN microservices)</p>
      <input style={input} placeholder="Name (register only)" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /><br />
      <input style={input} placeholder="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /><br />
      <input style={input} type="password" placeholder="Password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} /><br />
      <button style={btn} onClick={() => login('login')}>Login</button>
      <button style={btn} onClick={() => login('register')}>Register</button>
    </div>
  );

  return (
    <div style={{ maxWidth: 900, margin: '20px auto', fontFamily: 'sans-serif', padding: 12 }}>
      <h1>SpendWise Dashboard</h1>
      <p>Hi {user.name} <button style={btn} onClick={logout}>Logout</button></p>

      <h2>Report — {month} <input style={input} value={month} onChange={e => setMonth(e.target.value)} placeholder="YYYY-MM" /> <button style={btn} onClick={load}>Refresh</button></h2>
      {summary && <div style={{ background: '#f3f4f6', padding: 12, borderRadius: 8 }}>
        <b>Total: ₹{summary.total_expense}</b> across {summary.count} expenses
        {summary.alerts?.map((a, i) => <div key={i} style={{ color: 'red' }}>⚠ {a}</div>)}
        <ul>{summary.byCategory?.map(c => <li key={c.categoryId}>{c.name}: ₹{c.total} ({c.count}) {c.budget ? `[budget ${c.budget}]` : ''}</li>)}</ul>
      </div>}

      <h2>Add expense</h2>
      <input style={input} type="number" placeholder="Amount" value={exp.amount} onChange={e => setExp({ ...exp, amount: e.target.value })} />
      <input style={input} type="date" value={exp.date} onChange={e => setExp({ ...exp, date: e.target.value })} />
      <select style={input} value={exp.categoryId} onChange={e => setExp({ ...exp, categoryId: e.target.value })}>
        <option value="">-- category --</option>{cats.map(c => <option key={c.category_id} value={c.category_id}>{c.name}</option>)}
      </select>
      <input style={input} placeholder="Note" value={exp.note} onChange={e => setExp({ ...exp, note: e.target.value })} />
      <button style={btn} onClick={addExpense}>Add</button>

      <h2>Expenses ({expenses.length})</h2>
      <ul>{expenses.map(e => <li key={e.expense_id}>₹{e.amount} · {e.date} · {(cats.find(c => c.category_id === (e.categoryId || e.category_id)) || {}).name || 'uncategorized'} · {e.note}</li>)}</ul>

      <h2>Categories</h2>
      <input style={input} placeholder="Name" value={cat.name} onChange={e => setCat({ ...cat, name: e.target.value })} />
      <input style={input} type="number" placeholder="Monthly budget" value={cat.budgetThreshold} onChange={e => setCat({ ...cat, budgetThreshold: e.target.value })} />
      <button style={btn} onClick={addCat}>Add category</button>
      <ul>{cats.map(c => <li key={c.category_id}>{c.name} — budget ₹{c.budgetThreshold}</li>)}</ul>
    </div>
  );
}
