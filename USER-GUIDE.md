# SpendWise — User Guide & How It Works

SpendWise is a personal and small-team **expense tracker and budget reconciliation** app:
track daily spending, cap it with monthly category budgets, and reconcile every month
with a one-click report.

---

## 1. Starting the app

**Option A — one click (recommended):** double-click **`start-all.bat`** in the
`spendwise` folder. It opens one window per service. Wait ~30 seconds, then open:

👉 **http://localhost:5173**

**Option B — manually:** in 7 terminals run `node server.js` inside each of
`services/discovery`, `services/auth`, `services/category`, `services/expense`,
`services/report`, `services/gateway`, plus `npm run dev -- --host` inside `client`.

If a link ever stops opening, your PC likely slept and stopped the background
processes — just run `start-all.bat` again.

### The addresses

| What | Address |
|---|---|
| The website (React UI) | http://localhost:5173 |
| API entry point (gateway) | http://localhost:4000 |
| Auth service | http://localhost:4001 |
| Category service | http://localhost:4002 |
| Expense service | http://localhost:4003 |
| Report service | http://localhost:4004 |
| Service registry (discovery) | http://localhost:8761 |

> You only ever use the website address. The rest are the internal
> microservices talking to each other.

---

## 2. Your account

1. Open http://localhost:5173 — first visit shows the welcome screen.
2. **Register tab:** enter name, email, password (min. 6 characters) → **Create account**.
   You are signed in immediately.
3. Later visits: **Sign in tab** with email + password.
4. **Sign out** from the top-right button. Your session token expires after 12 hours.

Five starter categories (Food & Dining, Travel, Utilities, Shopping, Health)
are available to every account from the beginning.

---

## 3. Daily use

### Overview (home)
- **Month picker** (top bar) switches the whole dashboard to any month.
- **Stat cards:** total spent, daily average, top category, budgets breached.
- **14-day chart:** daily spending bars for the last two weeks.
- **Split by category:** donut showing where the money went.
- **Budgets vs actual:** progress bar per capped category (green → amber → red).
- **Recent transactions:** latest 5 entries, with a shortcut to the full list.
- Red **⚠ budget banners** appear automatically when a category exceeds its cap.

### Expenses
- **+ Add expense:** amount, date, payment method (Cash/Card/UPI/Netbanking/Other),
  category, note. If the month's spend for that category crosses its budget,
  you get an instant alert.
- **Search** notes, **filter** by category, move between **pages** (12 per page).
- **Edit** any entry (e.g. fix the amount or move it to another category),
  **Delete** with confirmation.

### Categories
- **+ New category:** name + optional monthly budget (0 = no limit).
- Each card shows this month's spend against the cap with a status badge:
  **On track / Nearing limit / Over budget**.
- **Edit** the name or budget, **Delete** a category (its old expenses simply
  become "Uncategorized").

### Reports
- Pick the month → totals, transaction count, categories used.
- **Reconciliation table:** per category — transactions, budget, actual, status
  (Within budget / Over budget / No cap).
- **Download CSV** saves `spendwise-YYYY-MM.csv`, ready for Excel/Sheets.

---

## 4. How it functions (under the hood)

### Architecture — MERN microservices

```
            ┌──────────── React UI (:5173) ────────────┐
            │  Overview · Expenses · Categories · Reports│
            └──────────────────┬────────────────────────┘
                               │  /api/*  (single entry point)
                    ┌──────────▼──────────┐
                    │   API GATEWAY :4000  │  JWT check · routing ·
                    │                      │  round-robin load balancing
                    └──┬───┬───┬──────┬────┘
                       │   │   │      │
        ┌──────────────┘   │   │      └─────────┐
        ▼                  ▼   ▼                ▼
   AUTH :4001        CATEGORY EXPENSE       REPORT :4004
   register/login    :4002   :4003          summary + CSV
   JWT issue/verify  taxonomy log expenses   ▲ ▲
    (bcrypt hashes)  +budgets  │ validates   │ │
                              └──category────┘ └─── reads both
   ┌──────────────────────────────────────────────┐
   │ DISCOVERY :8761 — service registry +         │
   │ heartbeats (Eureka equivalent). Every        │
   │ service registers on boot and re-checks in.  │
   └──────────────────────────────────────────────┘
```

- **MERN:** MongoDB (data) + Express (each service) + React (UI) + Node (runtime).
- Each service is an **independent process** with its own database collections —
  it can be restarted, scaled, or replaced without touching the others.
- The UI **never calls services directly**; everything goes through the gateway,
  which verifies your login token and forwards the request to a healthy instance.

### What each service does

| Service | Owns | Key rules |
|---|---|---|
| **Auth** | Users, passwords, login tokens | Passwords stored as bcrypt hashes (never plain text); login issues a JWT valid 12h; login rate-limited (8/min per IP) |
| **Category** | Spending taxonomy + monthly caps | `category_id, name, budgetThreshold`; seeded defaults for everyone; personal categories per user |
| **Expense** | Daily transaction log | `expense_id, user_id, amount, date, category_id, note, paymentMethod`; amount must be > 0; category is validated live against the Category service; overspend returns a `thresholdAlert` |
| **Report** | Summaries + exports | Pulls the month's expenses + category names/budgets, then totals, groups by category, builds the daily series, flags breaches; can snapshot a report or export CSV |
| **Gateway** | Entry, security, balancing | Public only for login/register + health; all other routes need a valid JWT; resolves service addresses from discovery with round-robin across instances |
| **Discovery** | Live directory | `POST /register`, `POST /heartbeat`, `GET /services/:name`; entries expire after 30s without a heartbeat |

### A request's journey (examples)

**Sign in:** UI → gateway (`/api/auth/*` is public) → auth checks bcrypt hash →
returns JWT → browser stores it and attaches it to every later call.

**Add expense:** UI → gateway (JWT verified) → expense service → asks category
service "does this category exist?" → saves → compares month-to-date total
against the cap → returns the expense plus any `thresholdAlert`.

**Monthly summary:** UI → gateway → report service → fetches expenses *and*
categories in parallel → aggregates in memory (total, per-category, daily
series, breach list) → returns one JSON the dashboard renders.

### Data model

MongoDB collections (same shape as `database/schema.sql` for SQL users):

- **users:** `_id, name, email (unique), passwordHash`
- **categories:** `_id, userId (null = global default), name, budgetThreshold`
- **expenses:** `_id, userId, categoryId, amount (>0), date (YYYY-MM-DD), note, paymentMethod`
- **reports:** `_id, userId, totalExpense, month (YYYY-MM), breakdown`
- Hot paths are indexed: `(userId, date)`, `(userId, categoryId, date)`.

**Two storage modes:** if `MONGO_URI` is set in `.env`, services persist to
MongoDB; otherwise they run on a built-in in-memory store (great for demos —
data resets on restart). Nothing in the UI changes between modes.

### Quality & operations

- **Tests:** `npm test` in `spendwise/` runs unit tests (report math) plus an
  integration test that boots real service instances and walks
  category → expense → summary. Currently 4/4 passing.
- **Deploy:** `docker compose up --build` launches MongoDB + all six services
  with the same wiring; `client/dist` (via `npm run build`) is deployable to
  any static host.
- **History:** the project is a git repo — every change set is a commit, so any
  iteration can be reviewed or rolled back.

### Troubleshooting

| Symptom | Fix |
|---|---|
| localhost:5173 won't open | PC slept → run `start-all.bat`, wait 30s, retry |
| "missing/invalid token" in UI | Session expired → sign out and sign in again |
| Empty dashboard after restart | In-memory mode loses data on restart → set `MONGO_URI` for persistence |
| A service crashes | Restart just that window (`node server.js`); discovery re-registers it automatically |
