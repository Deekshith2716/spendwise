// API client — talks to the API Gateway.
// Dev: same-origin via vite proxy. Prod: set VITE_GATEWAY_URL to the deployed gateway.
const GW = (import.meta.env.VITE_GATEWAY_URL || '').replace(/\/$/, '');
export const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem('token') || ''}` });

export async function api(path, opts = {}) {
  const tries = opts._tries || 1;
  const { _tries, ...fetchOpts } = opts;
  const r = await fetch(`${GW}${path}`, {
    ...fetchOpts,
    headers: { 'Content-Type': 'application/json', ...authHeader(), ...(opts.headers || {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { j = t; }
  if (!r.ok) {
    // Free-tier backends sleep when idle (~40s cold start) — retry automatically
    if (r.status === 502 && tries < 3) {
      await new Promise((res) => setTimeout(res, 25000));
      return api(path, { ...opts, _tries: tries + 1 });
    }
    throw new Error((j && j.error) || `Request failed (${r.status})`);
  }
  return j;
}

// Download endpoint (CSV export) — saves file in browser
export async function apiDownload(path, filename) {
  const r = await fetch(`${GW}${path}`, { headers: { ...authHeader() } });
  if (!r.ok) throw new Error(`Download failed (${r.status})`);
  const blob = await r.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

export const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
