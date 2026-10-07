import React, { useEffect, useMemo, useState } from 'react';
import { api, apiDownload, inr } from './api.js';

const PALETTE = ['#0e9f6e', '#0ea5e9', '#8b5cf6', '#f59e0b', '#ef4444', '#14b8a6', '#f97316', '#64748b'];
const todayMonth = () => new Date().toISOString().slice(0, 7);
const todayDay = () => new Date().toISOString().slice(0, 10);

/* ---------------- login ---------------- */
function Login({ onDone }) {
  const [tab, setTab] = useState('login');
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async () => {
    setErr(''); setBusy(true);
    try {
      const j = await api(`/api/auth/${tab === 'login' ? 'login' : 'register'}`, {
        method: 'POST',
        body: tab === 'login' ? { email: f.email, password: f.password } : f,
      });
      localStorage.setItem('token', j.token);
      localStorage.setItem('user', JSON.stringify({ user_id: j.user_id, name: j.name, email: j.email }));
      onDone();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="login-wrap">
      <div className="login-brand">
        <div className="brand"><span className="brand-mark">S</span> SpendWise</div>
        <h1>Know where every rupee goes.</h1>
        <p>SpendWise is your team's expense analytics workspace — log daily spending, cap it with category budgets, and reconcile the month in one click.</p>
        <ul>
          <li>Log expenses in seconds, from any device</li>
          <li>Monthly budgets per category with over-spend alerts</li>
          <li>One-click month-end reports with CSV export</li>
        </ul>
      </div>
      <div className="login-form">
        <div className="login-card">
          <h2>{tab === 'login' ? 'Welcome back' : 'Create your account'}</h2>
          <p className="sub">{tab === 'login' ? 'Sign in to your SpendWise workspace.' : 'Start tracking in under a minute.'}</p>
          <div className="tabs">
            <button className={tab === 'login' ? 'on' : ''} onClick={() => setTab('login')}>Sign in</button>
            <button className={tab === 'register' ? 'on' : ''} onClick={() => setTab('register')}>Register</button>
          </div>
          {err && <div className="err">{err}</div>}
          {tab === 'register' && <div className="field"><label>Full name</label><input className="input" value={f.name} onChange={set('name')} placeholder="Aarav Sharma" /></div>}
          <div className="field"><label>Email</label><input className="input" value={f.email} onChange={set('email')} placeholder="you@company.com" /></div>
          <div className="field"><label>Password</label><input className="input" type="password" value={f.password} onChange={set('password')} placeholder="••••••••" onKeyDown={(e) => e.key === 'Enter' && submit()} /></div>
          <button className="btn btn-primary" style={{ width: '100%' }} onClick={submit} disabled={busy}>{busy ? 'Please wait…' : tab === 'login' ? 'Sign in' : 'Create account'}</button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- charts ---------------- */
function Trend({ daily }) {
  const days = useMemo(() => {
    const out = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      out.push({ key, label: d.getDate(), value: (daily || {})[key] || 0 });
    }
    return out;
  }, [daily]);
  const max = Math.max(1, ...days.map((d) => d.value));
  return (
    <div className="trend">
      {days.map((d) => (
        <div key={d.key} title={`${d.key}: ${inr(d.value)}`}>
          <i style={{ height: `${Math.max(4, (d.value / max) * 120)}px`, opacity: d.value ? 1 : 0.25 }} />
          <span>{d.label}</span>
        </div>
      ))}
    </div>
  );
}

function Donut({ rows }) {
  const total = rows.reduce((s, r) => s + r.total, 0) || 1;
  let acc = 0;
  const R = 54, C = 2 * Math.PI * R;
  return (
    <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
      <svg width="140" height="140" viewBox="0 0 140 140">
        <circle cx="70" cy="70" r={R} fill="none" stroke="#edf1f6" strokeWidth="18" />
        {rows.map((r, i) => {
          const frac = r.total / total;
          const el = <circle key={i} cx="70" cy="70" r={R} fill="none" stroke={PALETTE[i % PALETTE.length]} strokeWidth="18"
            strokeDasharray={`${frac * C} ${C}`} strokeDashoffset={-acc * C} transform="rotate(-90 70 70)" strokeLinecap="butt" />;
          acc += frac; return el;
        })}
        <text x="70" y="66" textAnchor="middle" fontWeight="800" fontSize="17">{inr(total)}</text>
        <text x="70" y="84" textAnchor="middle" fontSize="11" fill="#64748b">total</text>
      </svg>
      <div className="legend">
        {rows.slice(0, 6).map((r, i) => (
          <div className="row" key={r.categoryId}><span className="dot" style={{ background: PALETTE[i % PALETTE.length] }} />{r.name} · <b>{inr(r.total)}</b></div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- modals ---------------- */
function ExpenseModal({ cats, initial, onClose, onSave }) {
  const [f, setF] = useState(initial || { amount: '', date: todayDay(), categoryId: '', note: '', paymentMethod: 'cash' });
  const [err, setErr] = useState('');
  const save = async () => {
    if (!f.amount || Number(f.amount) <= 0) return setErr('Enter an amount greater than zero.');
    try {
      const j = await onSave({ amount: Number(f.amount), date: f.date, categoryId: f.categoryId || undefined, note: f.note, paymentMethod: f.paymentMethod });
      if (j && j.thresholdAlert) alert('Budget alert: ' + j.thresholdAlert);
      onClose(true);
    } catch (e) { setErr(e.message); }
  };
  return (
    <div className="modal-back" onClick={() => onClose(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial?.expense_id ? 'Edit expense' : 'Add expense'}</h3>
        {err && <div className="err">{err}</div>}
        <div className="field"><label>Amount (₹)</label><input className="input" type="number" min="1" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} placeholder="500" /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="field"><label>Date</label><input className="input" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
          <div className="field"><label>Paid via</label>
            <select className="input" value={f.paymentMethod} onChange={(e) => setF({ ...f, paymentMethod: e.target.value })}>
              <option value="cash">Cash</option><option value="card">Card</option><option value="upi">UPI</option><option value="netbanking">Netbanking</option><option value="other">Other</option>
            </select>
          </div>
        </div>
        <div className="field"><label>Category</label>
          <select className="input" value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })}>
            <option value="">Uncategorized</option>
            {cats.map((c) => <option key={c.category_id} value={c.category_id}>{c.name}</option>)}
          </select>
        </div>
        <div className="field"><label>Note</label><input className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="e.g. Team lunch" /></div>
        <div className="actions"><button className="btn btn-ghost" onClick={() => onClose(false)}>Cancel</button><button className="btn btn-primary" onClick={save}>Save expense</button></div>
      </div>
    </div>
  );
}

function CategoryModal({ initial, onClose, onSave }) {
  const [f, setF] = useState(initial || { name: '', budgetThreshold: '' });
  const [err, setErr] = useState('');
  const save = async () => {
    if (!f.name.trim()) return setErr('Category name is required.');
    try { await onSave({ name: f.name.trim(), budgetThreshold: Number(f.budgetThreshold) || 0 }); onClose(true); }
    catch (e) { setErr(e.message); }
  };
  return (
    <div className="modal-back" onClick={() => onClose(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial?.category_id ? 'Edit category' : 'New category'}</h3>
        {err && <div className="err">{err}</div>}
        <div className="field"><label>Name</label><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Travel" /></div>
        <div className="field"><label>Monthly budget (₹, 0 = no limit)</label><input className="input" type="number" min="0" value={f.budgetThreshold} onChange={(e) => setF({ ...f, budgetThreshold: e.target.value })} placeholder="20000" /></div>
        <div className="actions"><button className="btn btn-ghost" onClick={() => onClose(false)}>Cancel</button><button className="btn btn-primary" onClick={save}>Save category</button></div>
      </div>
    </div>
  );
}

/* ---------------- main app ---------------- */
export default function App() {
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('user') || 'null'));
  const [view, setView] = useState('overview');
  const [month, setMonth] = useState(todayMonth());
  const [cats, setCats] = useState([]);
  const [exp, setExp] = useState({ data: [], total: 0, page: 1, pages: 1 });
  const [summary, setSummary] = useState(null);
  const [q, setQ] = useState('');
  const [fCat, setFCat] = useState('');
  const [page, setPage] = useState(1);
  const [expModal, setExpModal] = useState(null); // null | {} | expense
  const [catModal, setCatModal] = useState(null);
  const [err, setErr] = useState('');

  const catName = (id) => (cats.find((c) => c.category_id === id) || {}).name || 'Uncategorized';

  const load = async (p = page) => {
    try {
      setErr('');
      const [c, e, s] = await Promise.all([
        api('/api/categories'),
        api(`/api/expenses?month=${month}&page=${p}&limit=12${fCat ? `&categoryId=${fCat}` : ''}${q ? `&q=${encodeURIComponent(q)}` : ''}`),
        api(`/api/reports/summary?month=${month}`),
      ]);
      setCats(c); setExp(e); setSummary(s);
    } catch (e2) {
      if (/401|token/i.test(e2.message)) { localStorage.clear(); setUser(null); }
      else setErr(e2.message);
    }
  };
  useEffect(() => { if (user) { setPage(1); load(1); } }, [user, month]); // eslint-disable-line
  useEffect(() => { if (user) load(page); }, [page]); // eslint-disable-line

  const logout = () => { localStorage.clear(); setUser(null); };
  if (!user) return <Login onDone={() => setUser(JSON.parse(localStorage.getItem('user')))} />;

  const daysElapsed = Math.min(new Date().getDate(), 28);
  const avg = summary ? summary.total_expense / Math.max(1, month === todayMonth() ? daysElapsed : 30) : 0;
  const top = (summary?.byCategory || []).slice().sort((a, b) => b.total - a.total)[0];

  const delExpense = async (id) => {
    if (!confirm('Delete this expense?')) return;
    await api(`/api/expenses/${id}`, { method: 'DELETE' }); load();
  };
  const delCat = async (id) => {
    if (!confirm('Delete this category? Its expenses become Uncategorized.')) return;
    await api(`/api/categories/${id}`, { method: 'DELETE' }); load();
  };

  const titles = { overview: ['Overview', 'Your money at a glance.'], expenses: ['Expenses', 'Every transaction, searchable.'], categories: ['Categories', 'Budgets that keep spending honest.'], reports: ['Reports', 'Month-end reconciliation, ready to share.'] };

  return (
    <div className="app">
      <aside className="side">
        <div className="brand"><span className="brand-mark">S</span> SpendWise</div>
        <div className="nav-label">Workspace</div>
        <nav className="nav">
          <a className={view === 'overview' ? 'active' : ''} onClick={() => setView('overview')}>◧ Overview</a>
          <a className={view === 'expenses' ? 'active' : ''} onClick={() => setView('expenses')}>◨ Expenses</a>
          <a className={view === 'categories' ? 'active' : ''} onClick={() => setView('categories')}>◩ Categories</a>
          <a className={view === 'reports' ? 'active' : ''} onClick={() => setView('reports')}>◪ Reports</a>
        </nav>
        <div className="side-foot">SpendWise v1.0<br />Microservices · MERN</div>
      </aside>

      <main className="main">
        <div className="topbar">
          <div><h1>{titles[view][0]}</h1><p className="sub">{titles[view][1]}</p></div>
          <div className="sp" />
          <input className="input" type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={{ width: 170 }} />
          <div className="avatar" title={user.email}>{(user.name || 'U')[0].toUpperCase()}</div>
          <button className="btn sm" onClick={logout}>Sign out</button>
        </div>

        {err && <div className="alert">{err}</div>}
        {summary?.alerts?.map((a, i) => <div className="alert" key={i}>⚠ {a}</div>)}

        {view === 'overview' && summary && (
          <>
            <div className="grid-stats">
              <div className="panel stat"><div className="k">Spent · {month}</div><div className="v">{inr(summary.total_expense)}</div><div className="d">{summary.count} transactions</div></div>
              <div className="panel stat"><div className="k">Daily average</div><div className="v">{inr(avg)}</div><div className="d">across {month === todayMonth() ? daysElapsed : 30} days</div></div>
              <div className="panel stat"><div className="k">Top category</div><div className="v" style={{ fontSize: 20 }}>{top ? top.name : '—'}</div><div className="d">{top ? inr(top.total) : 'no spending yet'}</div></div>
              <div className="panel stat"><div className="k">Budgets breached</div><div className="v" style={{ color: summary.alerts?.length ? 'var(--red)' : 'var(--brand-dark)' }}>{summary.alerts?.length || 0}</div><div className="d">of {summary.byCategory.filter((c) => c.budget).length} capped categories</div></div>
            </div>
            <div className="grid-2">
              <div className="panel">
                <div className="panel-h"><h3>Spending — last 14 days</h3></div>
                <Trend daily={summary.daily} />
              </div>
              <div className="panel">
                <div className="panel-h"><h3>Split by category</h3></div>
                {summary.byCategory.length ? <Donut rows={summary.byCategory} /> : <p style={{ color: 'var(--muted)' }}>No expenses this month yet.</p>}
              </div>
            </div>
            <div className="grid-2">
              <div className="panel">
                <div className="panel-h"><h3>Budgets vs actual</h3><div className="sp" /><button className="btn sm" onClick={() => setView('categories')}>Manage</button></div>
                {cats.filter((c) => c.budgetThreshold > 0).map((c) => {
                  const spent = (summary.byCategory.find((b) => b.categoryId === c.category_id) || {}).total || 0;
                  const pct = Math.min(100, (spent / c.budgetThreshold) * 100);
                  return (
                    <div key={c.category_id} style={{ marginBottom: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, marginBottom: 5 }}>
                        <b>{c.name}</b><span style={{ color: 'var(--muted)' }}>{inr(spent)} / {inr(c.budgetThreshold)}</span>
                      </div>
                      <div className="bar"><i className={pct >= 100 ? 'hot' : pct >= 80 ? 'warm' : ''} style={{ width: `${pct}%` }} /></div>
                    </div>
                  );
                })}
                {!cats.some((c) => c.budgetThreshold > 0) && <p style={{ color: 'var(--muted)' }}>No budgets set — add one from Categories.</p>}
              </div>
              <div className="panel">
                <div className="panel-h"><h3>Recent transactions</h3><div className="sp" /><button className="btn sm" onClick={() => setView('expenses')}>View all</button></div>
                {exp.data.slice(0, 5).map((e) => (
                  <div key={e.expense_id} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid var(--line)', fontSize: 14 }}>
                    <span><b>{catName(e.categoryId || e.category_id)}</b> <span style={{ color: 'var(--muted)' }}>· {e.note || e.date}</span></span>
                    <b>{inr(e.amount)}</b>
                  </div>
                ))}
                {!exp.data.length && <p style={{ color: 'var(--muted)' }}>Nothing here yet — add your first expense.</p>}
              </div>
            </div>
          </>
        )}

        {view === 'expenses' && (
          <div className="panel">
            <div className="panel-h"><h3>All transactions</h3><div className="sp" /><button className="btn btn-primary sm" onClick={() => setExpModal({})}>+ Add expense</button></div>
            <div className="toolbar">
              <input className="input" placeholder="Search notes…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 200 }} />
              <select className="input" value={fCat} onChange={(e) => setFCat(e.target.value)}>
                <option value="">All categories</option>
                {cats.map((c) => <option key={c.category_id} value={c.category_id}>{c.name}</option>)}
              </select>
              <button className="btn sm" onClick={() => { setPage(1); load(1); }}>Apply</button>
            </div>
            <table className="table">
              <thead><tr><th>Date</th><th>Category</th><th>Note</th><th>Paid via</th><th style={{ textAlign: 'right' }}>Amount</th><th /></tr></thead>
              <tbody>
                {exp.data.map((e) => (
                  <tr key={e.expense_id}>
                    <td>{e.date}</td>
                    <td><span className="badge">{catName(e.categoryId || e.category_id)}</span></td>
                    <td>{e.note || '—'}</td><td style={{ color: 'var(--muted)' }}>{e.paymentMethod}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{inr(e.amount)}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button className="btn sm" onClick={() => setExpModal(e)}>Edit</button>{' '}
                      <button className="btn sm btn-danger" onClick={() => delExpense(e.expense_id)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!exp.data.length && <p style={{ color: 'var(--muted)' }}>No transactions match.</p>}
            <div className="pager">
              <button className="btn sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Prev</button>
              <span>Page {exp.page} of {exp.pages} · {exp.total} total</span>
              <button className="btn sm" disabled={page >= exp.pages} onClick={() => setPage(page + 1)}>Next →</button>
            </div>
          </div>
        )}

        {view === 'categories' && (
          <>
            <div className="toolbar"><button className="btn btn-primary sm" onClick={() => setCatModal({})}>+ New category</button></div>
            <div className="cat-cards">
              {cats.map((c) => {
                const spent = (summary?.byCategory.find((b) => b.categoryId === c.category_id) || {}).total || 0;
                const pct = c.budgetThreshold ? Math.min(100, (spent / c.budgetThreshold) * 100) : 0;
                return (
                  <div className="panel" key={c.category_id}>
                    <div className="panel-h"><h3>{c.name}</h3><div className="sp" />
                      <button className="btn sm" onClick={() => setCatModal(c)}>Edit</button>{' '}
                      <button className="btn sm btn-danger" onClick={() => delCat(c.category_id)}>Delete</button>
                    </div>
                    {c.budgetThreshold > 0 ? (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}>
                          <span style={{ color: 'var(--muted)' }}>{month} spend</span><b>{inr(spent)} / {inr(c.budgetThreshold)}</b>
                        </div>
                        <div className="bar"><i className={pct >= 100 ? 'hot' : pct >= 80 ? 'warm' : ''} style={{ width: `${pct}%` }} /></div>
                        <div style={{ marginTop: 8 }}>{pct >= 100 ? <span className="badge over">Over budget</span> : pct >= 80 ? <span className="badge">Nearing limit</span> : <span className="badge ok">On track</span>}</div>
                      </>
                    ) : <span className="badge">No monthly cap</span>}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {view === 'reports' && summary && (
          <>
            <div className="grid-stats">
              <div className="panel stat"><div className="k">Total · {month}</div><div className="v">{inr(summary.total_expense)}</div></div>
              <div className="panel stat"><div className="k">Transactions</div><div className="v">{summary.count}</div></div>
              <div className="panel stat"><div className="k">Categories used</div><div className="v">{summary.byCategory.length}</div></div>
              <div className="panel stat"><div className="k">Export</div><div style={{ marginTop: 8 }}><button className="btn btn-primary sm" onClick={() => apiDownload(`/api/reports/export?month=${month}`, `spendwise-${month}.csv`)}>Download CSV</button></div></div>
            </div>
            <div className="panel">
              <div className="panel-h"><h3>Reconciliation — {month}</h3></div>
              <table className="table">
                <thead><tr><th>Category</th><th>Transactions</th><th style={{ textAlign: 'right' }}>Budget</th><th style={{ textAlign: 'right' }}>Actual</th><th>Status</th></tr></thead>
                <tbody>
                  {summary.byCategory.map((c) => (
                    <tr key={c.categoryId}>
                      <td><b>{c.name}</b></td><td>{c.count}</td>
                      <td style={{ textAlign: 'right' }}>{c.budget ? inr(c.budget) : '—'}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{inr(c.total)}</td>
                      <td>{c.budget ? (c.total > c.budget ? <span className="badge over">Over budget</span> : <span className="badge ok">Within budget</span>) : <span className="badge">No cap</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>

      {expModal && <ExpenseModal cats={cats} initial={expModal.expense_id ? {
        ...expModal, amount: expModal.amount, categoryId: expModal.categoryId || expModal.category_id || '',
      } : undefined}
        onClose={(r) => { setExpModal(null); if (r) load(); }}
        onSave={(b) => expModal.expense_id
          ? api(`/api/expenses/${expModal.expense_id}`, { method: 'PUT', body: b })
          : api('/api/expenses', { method: 'POST', body: b })} />}

      {catModal && <CategoryModal initial={catModal.category_id ? catModal : undefined}
        onClose={(r) => { setCatModal(null); if (r) load(); }}
        onSave={(b) => catModal.category_id
          ? api(`/api/categories/${catModal.category_id}`, { method: 'PUT', body: b })
          : api('/api/categories', { method: 'POST', body: b })} />}
    </div>
  );
}
