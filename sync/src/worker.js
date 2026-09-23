/**
 * Litery sync.
 *
 * One JSON blob per family, stored under an unguessable key that doubles as
 * the credential — there is no login, because a four-year-old is the user and
 * the payload is letter scores.
 *
 * The important part is that it MERGES rather than overwrites. Two devices
 * both post their whole history; the server replays both and hands back the
 * combination, so neither device is authoritative and neither can erase the
 * other by being opened at the wrong moment.
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Max-Age': '86400',
};

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...CORS },
  });

const rowKey = r => `${r.t}|${r.k}|${r.x === undefined ? '' : r.x}`;
const isAttempt = r => r.k === 'L' || r.k === 'N';

/** Exactly the rules the client applies in record(), replayed over a log. */
function rebuildMastery(log) {
  const M = {};
  log.filter(isAttempt).sort((a, b) => a.t - b.t).forEach(r => {
    const id = `${r.l}:${r.k}:${r.x}`;
    const m = M[id] || { n: 0, ft: 0, box: 1, streak: 0, last: 0, ms: [] };
    m.n++;
    if (!r.w) { m.ft++; m.streak++; m.box = Math.min(5, m.box + 1); }
    else { m.streak = 0; m.box = 1; }
    m.last = r.t;
    if (typeof r.ms === 'number') { m.ms.push(r.ms); if (m.ms.length > 10) m.ms.shift(); }
    M[id] = m;
  });
  return M;
}

function mergeLogs(a = [], b = []) {
  const seen = new Set(), out = [];
  for (const r of [...a, ...b]) {
    if (!r || typeof r.t !== 'number') continue;
    const k = rowKey(r);
    if (seen.has(k)) continue;
    seen.add(k); out.push(r);
  }
  return out.sort((x, y) => x.t - y.t);
}

/** Prizes won before prize rows were logged; kept as a leading run. */
function prefixOf(prizes = [], log = []) {
  const logged = log.filter(r => r.k === 'P').length;
  return prizes.slice(0, Math.max(0, prizes.length - logged));
}

function derive(state) {
  return {
    prizes: [...state.prefix, ...state.log.filter(r => r.k === 'P').map(r => r.x)],
    log: state.log,
    mastery: rebuildMastery(state.log),
    settings: state.settings || {},
    name: state.name || '',
    updated: state.updated || 0,
  };
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    const path = new URL(request.url).pathname.split('/').filter(Boolean);
    if (path[0] !== 's' || !path[1] || path[1].length < 16) {
      return json({ error: 'bad key' }, 404);
    }
    const key = path[1];

    const stored = await env.LITERY.get(key, 'json');
    const state = stored || { prefix: [], log: [], settings: {}, name: '', updated: 0 };

    if (request.method === 'GET') return json(derive(state));

    if (request.method !== 'POST') return json({ error: 'method' }, 405);

    let body;
    try { body = await request.json(); }
    catch { return json({ error: 'not json' }, 400); }
    if (!body || typeof body !== 'object') return json({ error: 'not a payload' }, 400);

    const incomingLog = Array.isArray(body.log) ? body.log : [];
    const incomingPrefix = prefixOf(body.prizes, incomingLog);

    const next = {
      // the longer prefix wins: a device that never saw the old prizes must
      // not be able to shorten the collection
      prefix: incomingPrefix.length > state.prefix.length ? incomingPrefix : state.prefix,
      log: mergeLogs(state.log, incomingLog),
      settings: body.settings && Object.keys(body.settings).length ? body.settings : state.settings,
      name: state.name || body.name || '',
      updated: Date.now(),
    };

    await env.LITERY.put(key, JSON.stringify(next));

    const out = derive(next);
    out.added = next.log.length - state.log.length;
    return json(out);
  },
};
