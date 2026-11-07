// GET /api/stats  — private. Requires "Authorization: Bearer <STATS_TOKEN>".
async function sha256(s) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
}
async function tokenOk(given, expected) {
  if (!expected || !given) return false;
  const a = await sha256(given), b = await sha256(expected);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
function daysAgo(n) {
  const d = new Date(); d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

export async function onRequestGet({ request, env }) {
  if (!env.DB) return new Response('DB binding missing', { status: 500 });
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!(await tokenOk(token, env.STATS_TOKEN))) return new Response('Unauthorized', { status: 401 });

  const d30 = daysAgo(29), d7 = daysAgo(6), today = daysAgo(0);
  const one = async (sql, ...b) => (await env.DB.prepare(sql).bind(...b).first());
  const all = async (sql, ...b) => (await env.DB.prepare(sql).bind(...b).all()).results || [];

  const total = (await one('SELECT COUNT(*) AS n FROM users')).n;
  const installed = (await one('SELECT COUNT(*) AS n FROM users WHERE standalone = 1')).n;
  const dauToday = (await one("SELECT COUNT(DISTINCT id) AS n FROM daily WHERE event='open' AND day = ?", today)).n;
  const wau = (await one("SELECT COUNT(DISTINCT id) AS n FROM daily WHERE event='open' AND day >= ?", d7)).n;
  const mau = (await one("SELECT COUNT(DISTINCT id) AS n FROM daily WHERE event='open' AND day >= ?", d30)).n;
  const returning = (await one("SELECT COUNT(*) AS n FROM (SELECT id FROM daily WHERE event='open' GROUP BY id HAVING COUNT(DISTINCT day) >= 2)")).n;

  const dau = await all("SELECT day, COUNT(DISTINCT id) AS n FROM daily WHERE event='open' AND day >= ? GROUP BY day ORDER BY day", d30);
  const newUsers = await all('SELECT first_seen AS day, COUNT(*) AS n FROM users WHERE first_seen >= ? GROUP BY first_seen ORDER BY first_seen', d30);
  const versions = await all('SELECT version, COUNT(*) AS n FROM users GROUP BY version ORDER BY n DESC LIMIT 10');
  const countries = await all("SELECT CASE WHEN country='' THEN '??' ELSE country END AS country, COUNT(*) AS n FROM users GROUP BY country ORDER BY n DESC LIMIT 10");
  const events = await all('SELECT event, SUM(n) AS total, COUNT(DISTINCT id) AS users FROM daily WHERE day >= ? GROUP BY event ORDER BY total DESC', d30);

  return new Response(JSON.stringify({
    generatedAt: new Date().toISOString(),
    totals: { users: total, installed, dauToday, wau, mau, returning },
    dau, newUsers, versions, countries, events
  }), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}
