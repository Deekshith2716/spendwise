// Tiny fetch wrapper targeting the API Gateway
export const GW = ''; // same-origin in dev via vite proxy, set to http://localhost:4000 in prod if needed
export const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem('token') || ''}` });
export async function api(path, opts = {}) {
  const r = await fetch(`${GW}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...authHeader(), ...(opts.headers || {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { j = t; }
  if (!r.ok) throw new Error((j && j.error) || `HTTP ${r.status}`);
  return j;
}
