# SpendWise — Corporate Financial Expense Analytics & Budget Reconciliation (MERN microservices)

Pure **MongoDB + Express + React + Node**, no Java/Spring. Implements your spec's task list with Node equivalents:

| Spec item | MERN implementation |
|---|---|
| Expense Service logs expenses | `services/expense` — `expense_id, user_id, amount, date, category_id` |
| Category Service manages categories | `services/category` — `category_id, name, budgetThreshold` |
| Report Service generates summaries | `services/report` — `report_id, user_id, total_expense` + live aggregation |
| JWT authentication | `services/auth` — register/login/verify, bcrypt + JWT |
| Eureka service discovery | `services/discovery` — registry + heartbeat (`:8761`) |
| API Gateway routing | `services/gateway` — single entry `:4000`, JWT guard |
| Load balancing | gateway round-robin across discovered instances |
| Inter-service comm | Expense→Category validation, Report→Expense+Category aggregation |
| Unit & Integration tests | `tests/` — `node --test` |
| Deploy | `docker-compose.yml` (mongo + 6 services) |

## Quick start (no DB needed — in-memory fallback)

Open 6 terminals (or use docker):
```bash
cp .env.example .env
npm run install:all
npm --prefix services/discovery start &
npm --prefix services/auth start &
npm --prefix services/category start &
npm --prefix services/expense start &
npm --prefix services/report start &
npm --prefix services/gateway start &
cd client && npm install && npm run dev   # React UI :5173
```

With MongoDB: set `MONGO_URI=mongodb://localhost:27017/spendwise` in `.env` — services auto-switch from memory to Mongoose models.

## API (via gateway :4000)

```bash
# register + login
curl -X POST localhost:4000/api/auth/register -H "Content-Type: application/json" -d '{"name":"A","email":"a@x.com","password":"pass123"}'
# -> { user_id, token }
TOKEN=...

# categories
curl localhost:4000/api/categories -H "Authorization: Bearer $TOKEN"
curl -X POST localhost:4000/api/categories -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"name":"Travel","budgetThreshold":20000}'

# expenses (category validated Expense->Category; threshold alert returned)
curl -X POST localhost:4000/api/expenses -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"amount":450,"date":"2026-10-06","categoryId":"c-food","note":"lunch"}'

# report summary (Report->Expense+Category)
curl "localhost:4000/api/reports/summary?month=2026-10" -H "Authorization: Bearer $TOKEN"
```

Direct ports: discovery 8761, auth 4001, category 4002, expense 4003, report 4004, gateway 4000.

## Tests
```bash
node --test tests/
```

## Deploy
```bash
docker compose up --build
```
React client: `cd client && npm run build` (serve `dist/` via nginx/Vercel; point `/api` to gateway URL).

## SQL alternative
`database/schema.sql` mirrors the Mongo shapes if you want MySQL/Postgres instead.
