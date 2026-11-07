// POST /api/ping  — anonymous, opt-in usage counts. Stores no trip content.
const EVENTS = new Set([
  'open', 'trip_created', 'import_added', 'import_irctc', 'import_pdf',
  'card_shared', 'card_saved', 'text_shared', 'checkin_ics', 'ics_export', 'shortcut_guide'
]);

function isoDay(d) { return d.toISOString().slice(0, 10); }

export async function onRequestPost({ request, env }) {
  if (!env.DB) return new Response('DB binding missing', { status: 500 });
  let body;
  try { body = await request.json(); } catch (e) { return new Response(null, { status: 400 }); }

  const id = String(body.id || '');
  if (!/^[a-f0-9]{16,32}$/.test(id)) return new Response(null, { status: 400 });
  const version = String(body.v || '').slice(0, 12);
  if (!/^[\w.\-]{1,12}$/.test(version)) return new Response(null, { status: 400 });
  const standalone = body.sa === 1 ? 1 : 0;
  const country = String((request.cf && request.cf.country) || '').slice(0, 2).toUpperCase();

  const now = new Date();
  const today = isoDay(now);
  const events = (Array.isArray(body.events) ? body.events : []).slice(0, 50);

  const stmts = [
    env.DB.prepare(
      `INSERT INTO users (id, first_seen, last_seen, version, standalone, country)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         last_seen = excluded.last_seen,
         version = excluded.version,
         standalone = MAX(users.standalone, excluded.standalone),
         country = CASE WHEN excluded.country <> '' THEN excluded.country ELSE users.country END`
    ).bind(id, today, today, version, standalone, country)
  ];

  for (const ev of events) {
    const name = ev && ev.e;
    const day = ev && ev.d;
    if (!EVENTS.has(name)) continue;
    if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    const diff = Math.abs(new Date(day + 'T00:00:00Z') - new Date(today + 'T00:00:00Z')) / 86400000;
    if (!(diff <= 14)) continue; // allow queued offline events, reject wild dates
    stmts.push(
      env.DB.prepare(
        `INSERT INTO daily (day, id, event, n) VALUES (?, ?, ?, 1)
         ON CONFLICT(day, id, event) DO UPDATE SET n = n + 1`
      ).bind(day, id, name)
    );
  }

  await env.DB.batch(stmts);
  return new Response(null, { status: 204 });
}
