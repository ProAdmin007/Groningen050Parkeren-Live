// P+R-terreinen via de open GeoJSON-API achter kaart.groningenbereikbaar.nl
// (de "Slimme Kaart" van Groningen Bereikbaar). Deze bron geeft per locatie
// capaciteit en beschikbare plekken, maar geen update-tijd.
//
// De Q-Park-garages in deze bron worden bewust overgeslagen: hun waarden bleven bij
// metingen urenlang gelijk en weken af van de echte live-feed, dus ze zijn niet live.
import { fetchSource } from '../config.js';

const URL_ = 'https://kaart.groningenbereikbaar.nl/api/maps/1.json';

// P+R Hoofdstation komt via de RDW, die er ook een update-tijd bij geeft.
const SKIP = new Set(['pr-hoofdstation']);

const slug = (s) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\+/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const metaValue = (props, key) => {
  const v = props.meta?.find?.((m) => m?.key === key)?.value;
  const n = Number(v);
  return v != null && v !== '' && Number.isFinite(n) ? n : null;
};

export function toLocations(geojson) {
  if (!Array.isArray(geojson?.features)) throw new Error('onverwacht formaat');
  const out = [];
  for (const f of geojson.features) {
    const p = f?.properties ?? {};
    if (f?.geometry?.type !== 'Point' || typeof p.title !== 'string') continue;
    if (!/^P\+R-terreinen/.test(p.category ?? '')) continue;

    const id = slug(p.title.replace(/^P\+R/, 'pr'));
    if (SKIP.has(id)) continue;

    const [lng, lat] = f.geometry.coordinates;
    const street = [p.street, p.street_number].filter(Boolean).join(' ');
    const zip = p.zip?.replace(/^(\d{4})\s*([A-Z]{2})$/, '$1 $2');
    const address = [street, [zip, p.city || 'Groningen'].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    const free = metaValue(p, 'vacant-spaces');
    const capacity = metaValue(p, 'parking-capacity');
    out.push({
      id,
      name: p.title,
      kind: 'pr',
      operator: 'Gemeente Groningen', city: 'Groningen',
      entrances: p.street ? [address] : [],
      lat,
      lng,
      free: free == null ? null : Math.max(0, capacity != null ? Math.min(free, capacity) : free),
      capacity,
      tariffs: [],
      openingHours: null,
      url: typeof p.link === 'string' ? p.link : 'https://kaart.groningenbereikbaar.nl',
      sourceUpdatedAt: null, // bron publiceert geen update-tijd
    });
  }
  if (!out.length) throw new Error('geen P+R-terreinen gevonden in de bron');
  return out;
}

export default {
  id: 'groningen-bereikbaar',
  name: 'Groningen Bereikbaar',
  url: 'https://kaart.groningenbereikbaar.nl',
  initial: [],
  async fetch() {
    return toLocations(await (await fetchSource(URL_, 'application/json')).json());
  },
};
