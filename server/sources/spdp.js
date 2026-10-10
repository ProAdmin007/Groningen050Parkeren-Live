// Gedeelde bron voor parkeerdata volgens de landelijke standaard SPDP (Standaard voor
// Publicatie Dynamische Parkeerdata). Gebruikt door de RDW-feed en de Technolution-feed.
//
// - De facilitylijst en de vaste gegevens (naam, plek, capaciteit, exploitant) worden
//   dagelijks ververst en in data/<id>-facilities.json bewaard.
// - De gemeente per locatie komt van PDOK (zo valt "Almere Buiten" onder Almere).
// - Afgeschermde feeds (HTTP 401/403) worden 24 uur overgeslagen.
// - Feeds waarvan de bron al meer dan 24 uur niets heeft bijgewerkt, worden niet getoond.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { CONFIG, USER_AGENT } from '../config.js';

const PDOK_REVERSE = 'https://api.pdok.nl/bzk/locatieserver/search/v3_1/reverse';
const DAY = 86_400_000;
const DEAD_AFTER_MS = DAY;
// Ophogen als de afleiding van vaste gegevens verandert: dan wordt de cache opnieuw opgebouwd.
const GEO_VERSION = 2;
const CONCURRENCY = 10;

const fixUrl = (u) => u.replace(/([^:])\/\//, '$1/');

async function get(url, timeoutMs = 15_000) {
  return fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs) });
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
export const titleCase = (s) => s.toLowerCase().replace(/(^|[\s\-/(])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());

// Exploitanten noemen soms de gemeente zelf ("Amsterdam", "'s-Gravenhage", "Leeuwarden").
function operatorName(op, gemeente, city) {
  if (!op) return null;
  const l = op.toLowerCase();
  if (CITY_FIX[l] || l === gemeente?.toLowerCase() || l === city?.toLowerCase()) return `Gemeente ${CITY_FIX[l] ?? op}`;
  return op;
}

function kindOf(usage, name) {
  if (/P\s*\+\s*R/i.test(usage) || /\bP\s*\+\s*R\b/i.test(name)) return 'pr';
  if (/garage/i.test(usage)) return 'garage';
  return 'lot';
}

async function gemeenteFor(lat, lng) {
  try {
    // type=gemeente: de gemeente waarin het punt ligt (op basis van de grenzen), niet die van
    // het dichtstbijzijnde adres; dat gaat mis bij terreinen op een gemeentegrens.
    const q = new URLSearchParams({ lat, lon: lng, type: 'gemeente', rows: '1', fl: 'gemeentenaam' });
    const doc = (await (await get(`${PDOK_REVERSE}?${q}`, 10_000)).json()).response?.docs?.[0];
    return doc?.gemeentenaam ?? null;
  } catch {
    return null;
  }
}

/**
 * @param {object} o
 * @param {string} o.id            bron-id (ook prefix van locatie-id's)
 * @param {string} o.name          naam in de app
 * @param {string|null} [o.url]    link bij de bronvermelding (null = geen link)
 * @param {string} o.listUrl       SPDP-index met alle faciliteiten
 * @param {number} o.ttlMs         hoe vaak de live stand wordt opgehaald
 * @param {(name: string) => string} o.cleanName
 * @param {Record<string, string>} [o.aliases]  uuid -> bestaand locatie-id (historie behouden)
 * @param {number} [o.minFacilities]            ondergrens voor een geldige lijst
 */
export function spdpSource({ id, name, url = null, listUrl, ttlMs, cleanName, aliases = {}, minFacilities = 10 }) {
  let facilities = new Map(); // uuid -> vaste gegevens
  let staticFetchedAt = null;
  let staticRefresh = null;
  let loaded = null;
  const skipUntil = new Map(); // uuid -> tijdstip (ms) na een 401/403
  const cacheFile = () => (CONFIG.historyFile ? `${dirname(CONFIG.historyFile)}/${id}-facilities.json` : null);

  async function loadStaticCache() {
    const file = cacheFile();
    if (!file) return;
    try {
      const json = JSON.parse(await readFile(file, 'utf8'));
      facilities = new Map(Object.entries(json.facilities ?? {}));
      staticFetchedAt = json.fetchedAt ?? null;
      console.log(`[${id}] ${facilities.size} locaties geladen uit ${file}`);
    } catch {
      // nog geen cache
    }
  }

  async function refreshStatic() {
    const index = await (await get(listUrl, 90_000)).json();
    const list = index.ParkingFacilities ?? index.parkingFacilities ?? [];
    const live = list.filter((f) => f.dynamicDataUrl && f.identifier);
    const next = new Map();
    await pool(live, async (f) => {
      const prev = facilities.get(f.identifier);
      // Vaste gegevens alleen opnieuw ophalen als de bron ze heeft gewijzigd.
      if (prev && prev.staticDataLastUpdated === f.staticDataLastUpdated && prev.gemeente && prev.geoVersion === GEO_VERSION) {
        next.set(f.identifier, prev);
        return;
      }
      try {
        let p = null;
        if (f.staticDataUrl) {
          const res = await get(fixUrl(f.staticDataUrl));
          if (res.ok) p = (await res.json())?.parkingFacilityInformation ?? null;
        }
        // Sommige bronnen geven geen vaste gegevens; dan de index gebruiken.
        const loc =
          p?.locationForDisplay ?? p?.accessPoints?.find((a) => a.accessPointLocation?.[0])?.accessPointLocation?.[0] ?? f.locationForDisplay;
        if (!loc?.latitude || !loc?.longitude) return; // zonder plek niet op de kaart te zetten
        const spec = p?.specifications?.at(-1) ?? {};
        const a = p?.accessPoints?.find((x) => x.accessPointAddress?.streetName)?.accessPointAddress;
        const zip = a?.zipcode?.replace(/^(\d{4})\s*([A-Z]{2})$/, '$1 $2');
        const gemeente = (prev?.geoVersion === GEO_VERSION && prev.gemeente) || (await gemeenteFor(loc.latitude, loc.longitude));
        const rawName = p?.name ?? f.name ?? '';
        const rawCity = gemeente ?? a?.city ?? rawName.match(/\(([^)]+)\)\s*$/)?.[1] ?? null;
        const city = rawCity ? (CITY_FIX[rawCity.toLowerCase()] ?? titleCase(rawCity)) : null;
        const cleaned = cleanName(rawName);
        next.set(f.identifier, {
          name: cleaned,
          kind: kindOf(spec.usage ?? '', cleaned),
          operator: operatorName(p?.operator?.name, gemeente, a?.city),
          city,
          gemeente,
          address: a?.streetName
            ? `${[a.streetName, a.houseNumber && a.houseNumber !== '0' ? a.houseNumber : null].filter(Boolean).join(' ')}, ${[zip, a.city].filter(Boolean).join(' ')}`
            : null,
          lat: loc.latitude,
          lng: loc.longitude,
          capacity: Number.isFinite(spec.capacity) ? spec.capacity : null,
          dynamicDataUrl: fixUrl(f.dynamicDataUrl),
          staticDataLastUpdated: f.staticDataLastUpdated ?? null,
          geoVersion: GEO_VERSION,
        });
      } catch {
        // één kapotte registratie mag de rest niet tegenhouden
      }
    });
    if (next.size < minFacilities) throw new Error(`te weinig locaties (${next.size})`);
    facilities = next;
    staticFetchedAt = new Date().toISOString();
    const file = cacheFile();
    if (file) {
      await mkdir(dirname(file), { recursive: true });
      await writeFile(`${file}.tmp`, JSON.stringify({ fetchedAt: staticFetchedAt, facilities: Object.fromEntries(facilities) }));
      await rename(`${file}.tmp`, file);
    }
    console.log(`[${id}] vaste gegevens ververst: ${facilities.size} locaties met live-feed`);
  }

  function ensureStatic() {
    const old =
      !staticFetchedAt || Date.now() - Date.parse(staticFetchedAt) > DAY || [...facilities.values()].some((f) => f.geoVersion !== GEO_VERSION);
    if (old && !staticRefresh) {
      staticRefresh = refreshStatic()
        .catch((err) => console.warn(`[${id}] vaste gegevens verversen mislukt: ${err.message}`))
        .finally(() => (staticRefresh = null));
    }
  }

  return {
    id,
    name,
    url,
    providesUpdateTime: true,
    ttlMs,
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
            id: aliases[uuid] ?? `${id}-${uuid}`,
            extId: uuid, // zelfde uuid in meerdere SPDP-bronnen = zelfde locatie
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
            url: null,
            sourceUpdatedAt: new Date(updated).toISOString(),
          });
        } catch {
          failed++;
        }
      });
      if (!ok && failed) throw new Error(`${name}: feeds niet bereikbaar`);
      return out;
    },
  };
}
