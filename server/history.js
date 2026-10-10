// Historie per locatie voor de trendanalyse. Geen database: de metingen staan in
// het geheugen en worden periodiek als klein JSON-bestand weggeschreven.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { CONFIG } from './config.js';

const DAY = 86_400_000;
const MIN = 60_000;
// Zonder wijziging toch elke 5 minuten een punt, zodat we "gemeten en gelijk" kunnen
// onderscheiden van "niet gemeten" (gat in de lijn).
const HEARTBEAT_MS = 5 * MIN;
// Langer dan dit zonder meting = gat in de reeks.
const GAP_MS = 12 * MIN;

/** id -> [[tijd (ms), vrij], ...] oplopend in tijd */
const series = new Map();
let dirty = false;

export function record(id, t, free) {
  if (free == null) return;
  let s = series.get(id);
  if (!s) series.set(id, (s = []));
  const last = s.at(-1);
  if (last && t >= last[0] && last[1] === free && t - last[0] < HEARTBEAT_MS) return;
  s.push([t, free]);
  if (last && t < last[0]) s.sort((a, b) => a[0] - b[0]);
  dirty = true;
}

function prune() {
  const cutoff = Date.now() - CONFIG.historyDays * DAY;
  for (const [id, s] of series) {
    let i = 0;
    while (i < s.length && s[i][0] < cutoff) i++;
    if (i) s.splice(0, i);
    if (!s.length) series.delete(id);
  }
}

export async function load() {
  if (!CONFIG.historyFile) return;
  try {
    const json = JSON.parse(await readFile(CONFIG.historyFile, 'utf8'));
    for (const [id, s] of Object.entries(json.series ?? {})) if (Array.isArray(s)) series.set(id, s);
    prune();
    console.log(`[history] ${series.size} reeksen geladen uit ${CONFIG.historyFile}`);
  } catch (err) {
    if (err.code !== 'ENOENT') console.warn(`[history] laden mislukt: ${err.message}`);
  }
}

export async function save() {
  if (!CONFIG.historyFile || !dirty) return;
  prune();
  dirty = false;
  const tmp = `${CONFIG.historyFile}.tmp`;
  try {
    await mkdir(dirname(CONFIG.historyFile), { recursive: true });
    await writeFile(tmp, JSON.stringify({ version: 1, series: Object.fromEntries(series) }));
    await rename(tmp, CONFIG.historyFile);
  } catch (err) {
    dirty = true;
    console.warn(`[history] opslaan mislukt: ${err.message}`);
  }
}

/**
 * Uit de historie: sinds wanneer staat de laatst gemeten waarde er al?
 * { value, since, isFirst } of null. isFirst = de waarde is sinds de eerste meting niet veranderd.
 */
export function lastChange(id) {
  const s = series.get(id);
  if (!s?.length) return null;
  let i = s.length - 1;
  while (i > 0 && s[i - 1][1] === s[i][1]) i--;
  return { value: s.at(-1)[1], since: s[i][0], isFirst: i === 0 };
}

// Waarde op tijdstip t = laatste meting op of vóór t, mits niet in een gat.
function valueAt(s, t) {
  let lo = 0;
  let hi = s.length - 1;
  let idx = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (s[mid][0] <= t) {
      idx = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  if (idx < 0) return null;
  return t - s[idx][0] <= GAP_MS ? s[idx][1] : null;
}

// Helling (plaatsen per uur) via kleinste kwadraten over minuutwaarden.
function slopePerHour(s, from, to) {
  const xs = [];
  const ys = [];
  for (let t = from; t <= to; t += MIN) {
    const v = valueAt(s, t);
    if (v != null) {
      xs.push((t - from) / 3_600_000);
      ys.push(v);
    }
  }
  if (xs.length < 10) return null;
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  return den ? num / den : null;
}

const RANGES = { '3h': { span: 3 * 3_600_000, bucket: 2 * MIN }, '24h': { span: DAY, bucket: 10 * MIN }, '7d': { span: 7 * DAY, bucket: 60 * MIN } };

/**
 * Trendanalyse voor één locatie.
 * @param loc     actuele locatie (voor capaciteit)
 * @param reliable false als de data van deze locatie op dit moment niet actueel is
 */
export function analyse(loc, range, reliable) {
  const r = RANGES[range] ?? RANGES['24h'];
  const now = Date.now();
  const s = series.get(loc.id) ?? [];
  const from = now - r.span;

  // Punten per bucket (gemiddelde van de minuutwaarden); null = gat.
  const points = [];
  for (let t = Math.floor(from / r.bucket) * r.bucket; t <= now; t += r.bucket) {
    let sum = 0;
    let n = 0;
    const step = Math.max(MIN, r.bucket / 10);
    for (let u = t; u < t + r.bucket && u <= now; u += step) {
      const v = valueAt(s, u);
      if (v != null) {
        sum += v;
        n++;
      }
    }
    if (t + r.bucket > from) points.push([t, n ? Math.round(sum / n) : null]);
  }

  const inRange = s.filter(([t]) => t >= from);
  const values = inRange.map(([, v]) => v);
  const stats = values.length
    ? {
        min: Math.min(...values),
        max: Math.max(...values),
        avg: Math.round(values.reduce((a, b) => a + b, 0) / values.length),
      }
    : null;

  // Richting en tempo over het laatste halfuur.
  const current = valueAt(s, now);
  const rate = reliable ? slopePerHour(s, now - 30 * MIN, now) : null;
  const ago = (min) => valueAt(s, now - min * MIN);
  const change15 = reliable && current != null && ago(15) != null ? current - ago(15) : null;
  const change60 = reliable && current != null && ago(60) != null ? current - ago(60) : null;
  const threshold = Math.max(6, (loc.capacity ?? 0) * 0.02); // plaatsen per uur
  const direction = rate == null ? null : rate <= -threshold ? 'filling' : rate >= threshold ? 'emptying' : 'stable';

  // Schatting "vol rond": alleen bij duidelijk vollopen en binnen 3 uur.
  let fullAt = null;
  if (direction === 'filling' && current > 0) {
    const hours = current / -rate;
    if (hours <= 3) fullAt = new Date(now + hours * 3_600_000).toISOString();
  }

  // Gemiddeld rond dit tijdstip (±30 min) op eerdere dagen.
  const earlier = [];
  for (let d = 1; d <= CONFIG.historyDays; d++) {
    const vals = [];
    for (let m = -30; m <= 30; m += 5) {
      const v = valueAt(s, now - d * DAY + m * MIN);
      if (v != null) vals.push(v);
    }
    if (vals.length >= 6) earlier.push(vals.reduce((a, b) => a + b, 0) / vals.length);
  }
  const typical = earlier.length >= 2 ? { value: Math.round(earlier.reduce((a, b) => a + b, 0) / earlier.length), days: earlier.length } : null;

  return {
    id: loc.id,
    range,
    reliable,
    historySince: s.length ? new Date(s[0][0]).toISOString() : null,
    samples: inRange.length,
    capacity: loc.capacity ?? null,
    points: points.map(([t, v]) => [new Date(t).toISOString(), v]),
    stats,
    current,
    change15,
    change60,
    ratePerHour: rate == null ? null : Math.round(rate),
    direction,
    fullAt,
    typical,
  };
}
