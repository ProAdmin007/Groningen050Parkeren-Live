// Combineert de parkeerbronnen. Elke bron heeft een eigen cache, foutstatus en
// controletijd, zodat het uitvallen van één bron de rest niet raakt en niet
// iedere bezoeker apart de bronnen belast.
import { CONFIG } from './config.js';
import * as history from './history.js';
import parkeren050 from './sources/parkeren050.js';
import rdw from './sources/rdw.js';
import groningenBereikbaar from './sources/groningenBereikbaar.js';

const SOURCES = [parkeren050, rdw, groningenBereikbaar];

// Laatst bekende stand per locatie; blijft behouden als een volgende poging mislukt.
const locations = new Map();
const blank = { free: null, capacity: null, closed: false, tariffs: [], openingHours: null, url: null, sourceUpdatedAt: null, lastCheckedAt: null };
for (const s of SOURCES) for (const l of s.initial) locations.set(l.id, { ...blank, ...l, source: s.id });

const state = new Map(SOURCES.map((s) => [s.id, { lastAttemptAt: 0, lastSuccessAt: null, error: null, inflight: null }]));

// Stilstand-detectie per groep (bron + soort + exploitant), want binnen één bron kan
// het ene deel actueel zijn en het andere niet. Alleen voor bronnen zonder eigen update-tijd.
const groups = new Map();
const groupOf = (source, l) => {
  const id = `${source.id}:${l.kind}:${l.operator}`;
  if (!groups.has(id)) {
    const what = l.kind === 'pr' ? 'P+R-terreinen' : l.operator === 'Q-Park' ? 'Q-Park-garages' : 'Gemeentelijke garages';
    groups.set(id, { id, label: `${what} (${source.name})`, source: source.id, tracked: !source.providesUpdateTime, lastChangeAt: null });
  }
  return groups.get(id);
};

function isFrozen(g, counted = [...locations.values()].filter((l) => l.group === g.id && l.free != null).length) {
  return g.tracked && counted >= 2 && !!g.lastChangeAt && Date.now() - Date.parse(g.lastChangeAt) > CONFIG.frozenAfterSeconds * 1000;
}

// Is de huidige stand van deze locatie betrouwbaar genoeg voor een trend?
function isReliable(l) {
  const now = Date.now();
  if (l.free == null || !l.lastCheckedAt) return false;
  if (now - Date.parse(l.lastCheckedAt) > CONFIG.staleAfterSeconds * 1000) return false;
  if (l.sourceUpdatedAt && now - Date.parse(l.sourceUpdatedAt) > CONFIG.sourceStaleAfterSeconds * 1000) return false;
  const g = groups.get(l.group);
  return !(g && isFrozen(g));
}

async function refresh(source) {
  const st = state.get(source.id);
  st.lastAttemptAt = Date.now();
  try {
    const fresh = await source.fetch();
    const checkedAt = new Date().toISOString();
    const changedGroups = new Set();
    const seenGroups = new Set();
    for (const l of fresh) {
      const prev = locations.get(l.id);
      if (prev?.source && prev.source !== source.id) continue; // eerste bron die een locatie levert, wint
      // Sinds wanneer zien wij deze waarde? Bij de eerste waarneming is dat "nu of eerder".
      const group = groupOf(source, l);
      seenGroups.add(group);
      let since = { valueSince: prev?.valueSince ?? null, valueSinceIsUpperBound: prev?.valueSinceIsUpperBound ?? true };
      if (!prev?.lastCheckedAt) since = { valueSince: checkedAt, valueSinceIsUpperBound: true };
      else if (prev.free !== l.free || prev.closed !== !!l.closed) {
        since = { valueSince: checkedAt, valueSinceIsUpperBound: false };
        changedGroups.add(group);
      }
      locations.set(l.id, { ...blank, ...prev, ...l, ...since, source: source.id, group: group.id, lastCheckedAt: checkedAt });
      history.record(l.id, Date.parse(checkedAt), l.closed ? null : l.free);
    }
    for (const g of seenGroups) if (changedGroups.has(g) || !g.lastChangeAt) g.lastChangeAt = checkedAt;
    st.lastSuccessAt = checkedAt;
    st.error = null;
  } catch (err) {
    st.error =
      err.name === 'TimeoutError'
        ? 'time-out bij ophalen van de bron'
        : err.message === 'fetch failed'
          ? 'bron niet bereikbaar'
          : err.message || String(err);
    console.warn(`[${source.id}] ophalen mislukt: ${st.error}`);
  }
}

export async function getParking() {
  await Promise.all(
    SOURCES.map((s) => {
      const st = state.get(s.id);
      if (Date.now() - st.lastAttemptAt >= CONFIG.cacheTtlMs) {
        st.inflight ??= refresh(s).finally(() => (st.inflight = null));
      }
      return st.inflight;
    }),
  );

  return {
    serverTime: new Date().toISOString(),
    staleAfterSeconds: CONFIG.staleAfterSeconds,
    sourceStaleAfterSeconds: CONFIG.sourceStaleAfterSeconds,
    thresholds: { low: CONFIG.thresholdLow },
    sources: SOURCES.map((s) => {
      const st = state.get(s.id);
      return {
        id: s.id,
        name: s.name,
        url: s.url,
        lastAttemptAt: st.lastAttemptAt ? new Date(st.lastAttemptAt).toISOString() : null,
        lastSuccessAt: st.lastSuccessAt,
        error: st.error,
      };
    }),
    // Een groep "staat stil" als geen enkele waarde erin al FROZEN_AFTER_SECONDS verandert.
    // Pas zinvol vanaf twee locaties met een telling; één locatie kan echt lang gelijk blijven.
    groups: [...groups.values()].map((g) => {
      const counted = [...locations.values()].filter((l) => l.group === g.id && l.free != null).length;
      return {
        id: g.id,
        label: g.label,
        source: g.source,
        lastChangeAt: g.lastChangeAt,
        frozen: isFrozen(g, counted),
      };
    }),
    locations: [...locations.values()].map((l) => ({
      ...l,
      status: l.closed ? 'closed' : l.free == null ? 'unknown' : l.free > 0 ? 'available' : 'full',
    })),
  };
}

// De server meet zelf periodiek, zodat de historie doorloopt zonder bezoekers.
let started = false;
export async function startBackground() {
  if (started) return;
  started = true;
  await history.load();
  const poll = () => getParking().catch((err) => console.warn(`[poll] ${err.message}`));
  poll();
  setInterval(poll, Math.max(CONFIG.pollSeconds * 1000, CONFIG.cacheTtlMs)).unref();
  setInterval(() => history.save(), 5 * 60_000).unref();
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.once(sig, async () => {
      await history.save();
      process.exit(0);
    });
  }
}

// GET /api/history?id=<locatie>&range=3h|24h|7d
export async function historyHandler(req, res) {
  const q = new URL(req.originalUrl ?? req.url, 'http://x').searchParams; // originalUrl: Vite/connect
  const loc = locations.get(q.get('id'));
  if (!loc) {
    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ error: 'Onbekende locatie' }));
  }
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(history.analyse(loc, q.get('range') || '24h', isReliable(loc))));
}

// Node-style middleware, bruikbaar in zowel de productieserver als de Vite dev-server.
export async function apiHandler(req, res) {
  try {
    const body = JSON.stringify(await getParking());
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Interne fout' }));
  }
}
