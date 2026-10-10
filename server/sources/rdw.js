// Landelijke open parkeerdata van de RDW (SPDP v2). Alle locaties met een openbare
// live-feed in heel Nederland, inclusief een update-tijd van de bron.
//
// - De facilitylijst en de vaste gegevens (naam, plek, capaciteit, exploitant) worden
//   dagelijks ververst en in data/rdw-facilities.json bewaard.
// - De gemeente per locatie komt van PDOK (zo valt "Almere Buiten" onder Almere).
// - Afgeschermde feeds (HTTP 401, o.a. Q-Park) worden 24 uur overgeslagen.
// - Feeds waarvan de bron al meer dan 24 uur niets heeft bijgewerkt, worden niet getoond.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { CONFIG, USER_AGENT } from '../config.js';

const LIST = 'https://npropendata.rdw.nl/parkingdata/v2/';
const PDOK_REVERSE = 'https://api.pdok.nl/bzk/locatieserver/search/v3_1/reverse';
const DAY = 86_400_000;
const DEAD_AFTER_MS = DAY;
const CONCURRENCY = 10;

// Bestaande id's behouden, zodat de historie doorloopt.
const ALIASES = { '751c1199-6ad2-4fc4-b879-8b9091c9d96c': 'pr-hoofdstation' };

let facilities = new Map(); // rdw-uuid -> vaste gegevens
let staticFetchedAt = null;
let staticRefresh = null;
const skipUntil = new Map(); // rdw-uuid -> tijdstip (ms) na een 401

const cacheFile = () => (CONFIG.historyFile ? `${dirname(CONFIG.historyFile)}/rdw-facilities.json` : null);
const fixUrl = (u) => u.replace(/([^:])\/\//, '$1/');

async function get(url, timeoutMs = 15_000) {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs) });
  return res;
}

async function pool(items, fn) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
      while (i < items.length) await fn(items[i++]);
    }),
  );
}

const CITY_FIX = { "'s-gravenhage": 'Den Haag', "'s-hertogenbosch": "'s-Hertogenbosch", 'súdwest-fryslân': 'Súdwest-Fryslân' };
const titleCase = (s) => s.toLowerCase().replace(/(^|[\s\-/(])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());

function cleanName(name) {
  let n = (name ?? '').replace(/\s*\([^)]*\)\s*$/, '').trim();
  if (n && n === n.toUpperCase()) n = titleCase(n);
  return n.replace(/\bP\+r\b/g, 'P+R');
}

// De RDW noemt als exploitant soms de gemeente zelf ("Amsterdam", "'s-Gravenhage").
function operatorName(op, gemeente, city) {
  if (!op) return null;
  const l = op.toLowerCase();
  if (CITY_FIX[l] || l === gemeente?.toLowerCase() || l === city?.toLowerCase()) return `Gemeente ${CITY_FIX[l] ?? op}`;
  return op;
}

function kindOf(usage) {
  if (/P\s*\+\s*R/i.test(usage)) return 'pr';
  if (/garage/i.test(usage)) return 'garage';
  return 'lot';
}

async function gemeenteFor(lat, lng) {
  try {
    const q = new URLSearchParams({ lat, lon: lng, type: 'adres', rows: '1', fl: 'gemeentenaam' });
    const doc = (await (await get(`${PDOK_REVERSE}?${q}`, 10_000)).json()).response?.docs?.[0];
    return doc?.gemeentenaam ?? null;
  } catch {
    return null;
  }
}

async function loadStaticCache() {
  const file = cacheFile();
  if (!file) return;
  try {
    const json = JSON.parse(await readFile(file, 'utf8'));
    facilities = new Map(Object.entries(json.facilities ?? {}));
    staticFetchedAt = json.fetchedAt ?? null;
    console.log(`[rdw] ${facilities.size} locaties geladen uit ${file}`);
  } catch {
    // nog geen cache
  }
}

async function refreshStatic() {
  const list = (await (await get(LIST, 90_000)).json()).ParkingFacilities ?? [];
  const live = list.filter((f) => f.dynamicDataUrl && f.staticDataUrl);
  const next = new Map();
  await pool(live, async (f) => {
    const prev = facilities.get(f.identifier);
    // Vaste gegevens alleen opnieuw ophalen als de RDW ze heeft gewijzigd.
    if (prev && prev.staticDataLastUpdated === f.staticDataLastUpdated && prev.gemeente) {
      next.set(f.identifier, prev);
      return;
    }
    try {
      const res = await get(fixUrl(f.staticDataUrl));
      if (!res.ok) return;
      const p = (await res.json()).parkingFacilityInformation;
      const loc = p?.locationForDisplay ?? p?.accessPoints?.find((a) => a.accessPointLocation?.[0])?.accessPointLocation?.[0];
      if (!loc?.latitude || !loc?.longitude) return; // zonder plek niet op de kaart te zetten
      const spec = p.specifications?.at(-1) ?? {};
      const a = p.accessPoints?.find((x) => x.accessPointAddress?.streetName)?.accessPointAddress;
      const zip = a?.zipcode?.replace(/^(\d{4})\s*([A-Z]{2})$/, '$1 $2');
      const gemeente = prev?.gemeente ?? (await gemeenteFor(loc.latitude, loc.longitude));
      const rawCity = gemeente ?? a?.city ?? p.name?.match(/\(([^)]+)\)\s*$/)?.[1] ?? null;
      const city = rawCity ? (CITY_FIX[rawCity.toLowerCase()] ?? titleCase(rawCity)) : null;
      next.set(f.identifier, {
        name: cleanName(p.name ?? f.name),
        kind: kindOf(spec.usage ?? ''),
        operator: operatorName(p.operator?.name, gemeente, a?.city),
        city,
        gemeente,
        address: a?.streetName ? `${[a.streetName, a.houseNumber && a.houseNumber !== '0' ? a.houseNumber : null].filter(Boolean).join(' ')}, ${[zip, a.city].filter(Boolean).join(' ')}` : null,
        lat: loc.latitude,
        lng: loc.longitude,
        capacity: Number.isFinite(spec.capacity) ? spec.capacity : null,
        dynamicDataUrl: fixUrl(f.dynamicDataUrl),
        staticDataLastUpdated: f.staticDataLastUpdated,
      });
    } catch {
      // één kapotte registratie mag de rest niet tegenhouden
    }
  });
  if (next.size < 50) throw new Error(`te weinig RDW-locaties (${next.size})`);
  facilities = next;
  staticFetchedAt = new Date().toISOString();
  const file = cacheFile();
  if (file) {
    await mkdir(dirname(file), { recursive: true });
    await writeFile(`${file}.tmp`, JSON.stringify({ fetchedAt: staticFetchedAt, facilities: Object.fromEntries(facilities) }));
    await rename(`${file}.tmp`, file);
  }
  console.log(`[rdw] vaste gegevens ververst: ${facilities.size} locaties met live-feed`);
}

function ensureStatic() {
  const old = !staticFetchedAt || Date.now() - Date.parse(staticFetchedAt) > DAY;
  if (old && !staticRefresh) {
    staticRefresh = refreshStatic()
      .catch((err) => console.warn(`[rdw] vaste gegevens verversen mislukt: ${err.message}`))
      .finally(() => (staticRefresh = null));
  }
}

let loaded = null;

export default {
  id: 'rdw',
  name: 'RDW open parkeerdata',
  url: LIST,
  providesUpdateTime: true,
  ttlMs: CONFIG.rdwPollSeconds * 1000,
  initial: [],
  async fetch() {
    loaded ??= loadStaticCache();
    await loaded;
    ensureStatic();
    // Eerste start zonder cache: wachten op de vaste gegevens.
    if (!facilities.size && staticRefresh) await staticRefresh;

    const now = Date.now();
    const out = [];
    let ok = 0;
    let failed = 0;
    await pool([...facilities.entries()], async ([uuid, f]) => {
      if ((skipUntil.get(uuid) ?? 0) > now) return;
      try {
        const res = await get(f.dynamicDataUrl, 10_000);
        if (res.status === 401 || res.status === 403) {
          skipUntil.set(uuid, now + DAY);
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        if (!text) throw new Error('leeg antwoord');
        const s = JSON.parse(text)?.parkingFacilityDynamicInformation?.facilityActualStatus;
        ok++;
        if (!s || !Number.isFinite(s.vacantSpaces)) return;
        const updated = s.lastUpdated ? s.lastUpdated * 1000 : null;
        if (!updated || now - updated > DEAD_AFTER_MS) return; // dode feed: niet tonen
        const capacity = Number.isFinite(s.parkingCapacity) && s.parkingCapacity > 0 ? s.parkingCapacity : f.capacity;
        out.push({
          id: ALIASES[uuid] ?? `rdw-${uuid}`,
          name: f.name,
          kind: f.kind,
          operator: f.operator,
          city: f.city,
          entrances: f.address ? [f.address] : [],
          lat: f.lat,
          lng: f.lng,
          free: s.open === false ? null : Math.max(0, capacity != null ? Math.min(s.vacantSpaces, capacity) : s.vacantSpaces),
          closed: s.open === false,
          capacity,
          tariffs: [],
          openingHours: null,
          url: f.dynamicDataUrl,
          sourceUpdatedAt: new Date(updated).toISOString(),
        });
      } catch {
        failed++;
      }
    });
    if (!ok && failed) throw new Error('RDW-feeds niet bereikbaar');
    return out;
  },
};
