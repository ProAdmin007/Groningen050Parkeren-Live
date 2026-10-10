// Catalogus van álle openbare parkeerlocaties in de gemeente Groningen, ook die
// zonder live bezetting. Bronnen: OpenStreetMap (Overpass) en de statische
// RDW-registraties. Wordt dagelijks ververst; bij problemen valt de server terug
// op het laatst opgeslagen bestand of op de meegeleverde momentopname.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG, USER_AGENT } from './config.js';

const SNAPSHOT = fileURLToPath(new URL('./catalog-snapshot.json', import.meta.url));
const REFRESH_MS = 24 * 3_600_000;

const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];
const OVERPASS_QUERY =
  '[out:json][timeout:90];area["boundary"="administrative"]["admin_level"="8"]["name"="Groningen"]->.g;nwr["amenity"="parking"](area.g);out geom;';
const RDW_LIST = 'https://npropendata.rdw.nl/parkingdata/v2/';
const PDOK_REVERSE = 'https://api.pdok.nl/bzk/locatieserver/search/v3_1/reverse';

let catalog = { fetchedAt: null, items: [] };
let refreshing = null;

async function get(url, { accept = 'application/json', timeoutMs = 30_000, ...init } = {}) {
  const res = await fetch(url, { ...init, headers: { 'User-Agent': USER_AGENT, Accept: accept, ...init.headers }, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`${new URL(url).host} gaf HTTP ${res.status}`);
  return res;
}

// ---------- OpenStreetMap ----------

const GARAGE_TYPES = new Set(['underground', 'multi-storey', 'rooftop']);
const NOT_PUBLIC = new Set(['private', 'no', 'permit', 'customers', 'delivery', 'emergency', 'agricultural', 'forestry']);
const NOT_A_LOT = new Set(['street_side', 'lane', 'carports', 'garage', 'garage_boxes', 'layby']);
const toXY = (lat, lon) => [((lon * Math.PI) / 180) * 6_371_000 * Math.cos((53.2 * Math.PI) / 180), ((lat * Math.PI) / 180) * 6_371_000];
function ringArea(g) {
  if (!g || g.length < 3) return 0;
  let a = 0;
  for (let i = 0; i < g.length; i++) {
    const [x1, y1] = toXY(g[i].lat, g[i].lon);
    const [x2, y2] = toXY(g[(i + 1) % g.length].lat, g[(i + 1) % g.length].lon);
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a / 2);
}
const areaOf = (x) =>
  x.type === 'way' ? ringArea(x.geometry) : x.type === 'relation' ? (x.members ?? []).filter((m) => m.role === 'outer').reduce((s, m) => s + ringArea(m.geometry), 0) : 0;
const centerOf = (x) => (x.type === 'node' ? [x.lat, x.lon] : [(x.bounds.minlat + x.bounds.maxlat) / 2, (x.bounds.minlon + x.bounds.maxlon) / 2]);

/**
 * Selectieregel (zie README): openbaar (geen private/klanten/vergunning), geen
 * parkeerstrook langs de weg, en dan: een garage, een P+R, expliciet openbaar
 * (access=yes/permissive) of betaald, of een terrein met een naam. Kleine
 * naamloze vlakjes (< 1500 m² en < 50 plaatsen) vallen af.
 */
// Labels die in OSM als naam zijn ingevuld maar geen naam van de locatie zijn.
const NOT_A_NAME = /^(tickets?|parkeren|parking|parkeerplaats(en)?|p)$/i;

export function selectOsm(elements) {
  const out = [];
  for (const x of elements) {
    const t = { ...x.tags };
    if (NOT_A_NAME.test(t.name ?? '')) delete t.name;
    if (NOT_PUBLIC.has(t.access) || NOT_A_LOT.has(t.parking)) continue;
    const garage = GARAGE_TYPES.has(t.parking);
    const pr = (t.park_ride && t.park_ride !== 'no') || /^P\s*\+\s*R\b/i.test(t.name ?? '');
    const capacity = Number.parseInt(t.capacity, 10);
    const m2 = Math.round(areaOf(x));
    const sizeable = garage || pr || t.name || capacity >= 50 || m2 >= 1500;
    const publicEnough = garage || pr || ['yes', 'permissive'].includes(t.access) || (t.fee && t.fee !== '') || (t.name && !t.access);
    if (!sizeable || !publicEnough) continue;
    const [lat, lng] = centerOf(x);
    out.push({
      id: `osm-${x.type[0]}${x.id}`,
      name: t.name ?? null,
      kind: garage ? 'garage' : pr ? 'pr' : 'lot',
      parkingType: t.parking ?? null,
      capacity: Number.isFinite(capacity) ? capacity : null,
      fee: t.fee ?? null,
      operator: t.operator ?? null,
      lat,
      lng,
      m2,
      url: `https://www.openstreetmap.org/${x.type}/${x.id}`,
      source: 'osm',
    });
  }
  // Dubbele objecten in OSM (bv. een punt én een vlak voor Forum) samenvoegen.
  return dedupe(out);
}

async function fetchOsm() {
  let lastErr;
  for (const url of OVERPASS) {
    try {
      const res = await get(url, {
        method: 'POST',
        timeoutMs: 120_000,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ data: OVERPASS_QUERY }),
      });
      const json = await res.json();
      if (!Array.isArray(json.elements) || json.elements.length < 50) throw new Error('onverwacht antwoord van Overpass');
      return selectOsm(json.elements);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

// ---------- RDW (statisch) ----------

async function fetchRdwStatic() {
  const list = (await (await get(RDW_LIST, { timeoutMs: 60_000 })).json()).ParkingFacilities ?? [];
  const candidates = list.filter((f) => /\(Groningen\)$|^GRONINGEN-/.test(f.name) && f.staticDataUrl);
  const out = [];
  for (const f of candidates) {
    try {
      const p = (await (await get(f.staticDataUrl.replace(/([^:])\/\//, '$1/'))).json()).parkingFacilityInformation;
      if (!p || p.validityEndOfPeriod) continue; // beëindigde registraties overslaan
      const loc = p.locationForDisplay ?? p.accessPoints?.[0]?.accessPointLocation?.[0];
      if (!loc?.latitude) continue;
      const spec = p.specifications?.at(-1) ?? {};
      const a = p.accessPoints?.[0]?.accessPointAddress;
      const usage = spec.usage ?? '';
      out.push({
        id: `rdw-${f.identifier}`,
        name: p.name.replace(/\s*\(Groningen\)$/, '').replace(/^GRONINGEN-/, ''),
        kind: /garage/i.test(usage) ? 'garage' : /P\+R/i.test(usage) ? 'pr' : 'lot',
        parkingType: null,
        capacity: Number.isFinite(spec.capacity) ? spec.capacity : null,
        fee: null,
        operator: p.operator?.name ?? null,
        lat: loc.latitude,
        lng: loc.longitude,
        address: a?.streetName ? `${[a.streetName, a.houseNumber].filter(Boolean).join(' ')}, ${a.zipcode?.replace(/^(\d{4})\s*([A-Z]{2})$/, '$1 $2') ?? ''} Groningen`.replace(' ,', ',') : null,
        url: f.staticDataUrl,
        source: 'rdw-static',
        registeredAt: f.staticDataLastUpdated ? new Date(f.staticDataLastUpdated * 1000).toISOString() : null,
      });
    } catch {
      // één kapotte registratie mag de rest niet tegenhouden
    }
  }
  return out;
}

// ---------- Ontdubbelen ----------

const STOP = new Set(['parkeergarage', 'garage', 'parkeerterrein', 'terrein', 'parking', 'parkeren', 'park', 'ride', 'qpark', 'groningen', 'centrum', 'station']);
export const tokens = (name) =>
  new Set(
    (name ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/p\s*\+\s*r/g, ' ')
      .replace(/q-park/g, ' ')
      .split(/[^a-z]+/)
      .filter((w) => w.length >= 4 && !STOP.has(w)),
  );
export function distance(a, b) {
  const [x1, y1] = toXY(a.lat, a.lng);
  const [x2, y2] = toXY(b.lat, b.lng);
  return Math.hypot(x1 - x2, y1 - y2);
}
const sameClass = (a, b) => a.kind === b.kind || a.kind === 'pr' || b.kind === 'pr';
const shareToken = (a, b) => {
  const ta = tokens(a.name);
  for (const t of tokens(b.name)) if (ta.has(t)) return true;
  return false;
};

/** Is `b` dezelfde locatie als `a`? Heel dichtbij, of dichtbij met een gedeelde naam en hetzelfde soort. */
export const isSame = (a, b) => {
  const d = distance(a, b);
  return d < 60 || (d < 150 && sameClass(a, b)) || (d < 400 && sameClass(a, b) && shareToken(a, b));
};

// Binnen OSM strenger: alleen heel dichtbij, of dezelfde naam (Sontplein I en II blijven apart).
const norm = (n) => (n ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const isOsmDuplicate = (a, b) => distance(a, b) < 40 || (a.name && norm(a.name) === norm(b.name) && distance(a, b) < 400) || (distance(a, b) < 100 && (!a.name || !b.name || shareToken(a, b)));

function dedupe(items) {
  const kept = [];
  for (const it of items) {
    const dup = kept.find((k) => isOsmDuplicate(k, it));
    if (!dup) kept.push(it);
    else {
      dup.name ??= it.name;
      dup.capacity ??= it.capacity;
      dup.operator ??= it.operator;
      dup.fee ??= it.fee;
      if (dup.kind === 'lot' && it.kind !== 'lot') dup.kind = it.kind;
    }
  }
  return kept;
}

// ---------- Adressen voor naamloze terreinen (PDOK Locatieserver) ----------

async function reverseGeocode(items, previous) {
  const prev = new Map(previous.map((p) => [p.id, p]));
  for (const it of items) {
    if (it.address) continue;
    const cached = prev.get(it.id);
    if (cached?.address && distance(cached, it) < 50) {
      it.address = cached.address;
      it.street = cached.street;
      continue;
    }
    try {
      const q = new URLSearchParams({ lat: it.lat, lon: it.lng, type: 'adres', rows: '1', fl: 'weergavenaam,straatnaam' });
      const doc = (await (await get(`${PDOK_REVERSE}?${q}`, { timeoutMs: 10_000 })).json()).response?.docs?.[0];
      if (doc) {
        it.address = doc.weergavenaam.replace(/(\d{4})([A-Z]{2})/, '$1 $2');
        it.street = doc.straatnaam;
      }
      await new Promise((r) => setTimeout(r, 150)); // vriendelijk voor de dienst
    } catch {
      // zonder adres is ook goed
    }
  }
}

// ---------- Laden, verversen, opslaan ----------

const catalogFile = () => (CONFIG.historyFile ? `${dirname(CONFIG.historyFile)}/catalog.json` : null);

export async function loadCatalog() {
  for (const file of [catalogFile(), SNAPSHOT].filter(Boolean)) {
    try {
      const json = JSON.parse(await readFile(file, 'utf8'));
      if (Array.isArray(json.items) && json.items.length) {
        catalog = json;
        console.log(`[catalog] ${json.items.length} locaties geladen uit ${file} (${json.fetchedAt})`);
        return;
      }
    } catch {
      // volgende proberen
    }
  }
}

export async function refreshCatalog({ force = false } = {}) {
  if (!force && catalog.fetchedAt && Date.now() - Date.parse(catalog.fetchedAt) < REFRESH_MS) return catalog;
  refreshing ??= (async () => {
    try {
      const [osm, rdw] = await Promise.allSettled([fetchOsm(), fetchRdwStatic()]);
      if (osm.status === 'rejected') throw osm.reason; // OSM is de basis; zonder OSM het oude bestand houden
      const items = osm.value;
      for (const r of rdw.status === 'fulfilled' ? rdw.value : []) {
        const dup = items.find((o) => isSame(o, r));
        if (dup) {
          dup.capacity ??= r.capacity;
          dup.operator ??= r.operator;
          dup.address ??= r.address;
        } else items.push(r);
      }
      await reverseGeocode(items, catalog.items);
      catalog = { fetchedAt: new Date().toISOString(), sources: { osm: true, rdw: rdw.status === 'fulfilled' }, items };
      const file = catalogFile();
      if (file) {
        await mkdir(dirname(file), { recursive: true });
        await writeFile(`${file}.tmp`, JSON.stringify(catalog));
        await rename(`${file}.tmp`, file);
      }
      console.log(`[catalog] ververst: ${items.length} locaties`);
    } catch (err) {
      console.warn(`[catalog] verversen mislukt, oude lijst blijft: ${err.message}`);
    } finally {
      refreshing = null;
    }
    return catalog;
  })();
  return refreshing;
}

const TYPE_LABEL = { underground: 'Ondergrondse garage', 'multi-storey': 'Parkeergebouw', rooftop: 'Parkeerdak', surface: 'Parkeerterrein' };

/**
 * Catalogus-locaties die niet al als live locatie op de kaart staan, plus
 * aanvullende gegevens (capaciteit, exploitant) voor de live locaties.
 */
export function catalogFor(liveLocations) {
  const extra = [];
  const enrich = new Map();
  for (const it of catalog.items) {
    let best = null;
    for (const l of liveLocations) if (isSame(l, it) && (!best || distance(l, it) < distance(best, it))) best = l;
    if (best) {
      if (!enrich.has(best.id)) enrich.set(best.id, { capacity: it.capacity, parkingType: it.parkingType });
      continue;
    }
    const typeLabel = (it.parkingType && TYPE_LABEL[it.parkingType]) || (it.kind === 'garage' ? 'Parkeergarage' : it.kind === 'pr' ? 'P+R-terrein' : 'Parkeerterrein');
    const name = it.name ?? (it.street ? `${typeLabel} ${it.street}` : typeLabel);
    extra.push({
      id: it.id,
      name,
      kind: it.kind,
      live: false,
      operator: it.operator,
      entrances: it.address ? [it.name ? it.address : `nabij ${it.address}`] : [],
      lat: it.lat,
      lng: it.lng,
      free: null,
      capacity: it.capacity,
      fee: it.fee,
      typeLabel,
      tariffs: [],
      openingHours: null,
      url: it.url,
      source: it.source,
      registeredAt: it.registeredAt ?? null,
      status: 'nodata',
    });
  }
  return { extra, enrich, fetchedAt: catalog.fetchedAt };
}
