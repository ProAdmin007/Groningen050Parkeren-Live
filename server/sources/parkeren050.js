// De zes gemeentelijke parkeergarages via parkeren050.nl.
// De site heeft geen API: de bezetting staat server-side in de HTML,
// dus we lezen de overzichtspagina uit.
import { fetchSource } from '../config.js';

const URL_ = process.env.SOURCE_URL || 'https://www.parkeren050.nl/parkeren-groningen';

// Coördinaten komen van de detailpagina's op parkeren050.nl (first_marker_lat/lng).
// Naam en adressen worden live overgenomen; deze waarden zijn een terugval.
const GARAGES = [
  { id: 'forum', name: 'Forum', entrances: ['Schoolstraat 16, 9712 JS Groningen'], lat: 53.219192, lng: 6.570766 },
  { id: 'damsterdiep', name: 'Damsterdiep', entrances: ['Damsterplein 5, 9711 SX Groningen'], lat: 53.218019, lng: 6.577161 },
  { id: 'boterdiep', name: 'Boterdiep', entrances: ['Boterdiep 45, 9712 LL Groningen', 'Bloemsingel 160a, 9712 KZ Groningen'], lat: 53.223885, lng: 6.565069 },
  { id: 'circus', name: 'Circus', entrances: ['Korreweg 9, 9714 AA Groningen'], lat: 53.227108, lng: 6.562181 },
  { id: 'euroborg', name: 'Euroborg', entrances: ['Boumaboulevard 115, 9723 ZS Groningen'], lat: 53.206966, lng: 6.592262 },
  { id: 'station-europapark', name: 'Station Europapark', entrances: ['Verlengde Lodewijkstraat 300, 9723 AK Groningen'], lat: 53.205624, lng: 6.585823 },
];

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', euro: '€' };
const decode = (s) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
const text = (html) =>
  decode(html.replace(/<br\s*\/?>/gi, ', ').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .replace(/\s+,/g, ',')
    .trim();

export function parse(html) {
  const blocks = html.split(/<article[^>]*app-component-garage[^>]*>/).slice(1);
  return blocks.map((block) => {
    block = block.split('</article>')[0];
    const href = block.match(/href="\/parkeren-groningen\/parkeergarage-([a-z0-9-]+)"/);
    const name = block.match(/<h3[^>]*>([\s\S]*?)<\/h3>/);
    const entrances = [...block.matchAll(/class="entrance"[^>]*>([\s\S]*?)<\/div>/g)].map((m) => text(m[1])).filter(Boolean);
    const opening = block.match(/class="availability-status[^"]*"[^>]*>([\s\S]*?)<\/p>/);
    const spaces = block.match(/class="available-spaces[^"]*"[^>]*>([\s\S]*?)<\/p>/);
    const specs = block.match(/class="garage-specs"[^>]*>([\s\S]*?)<\/table>/);
    const tariffs = specs
      ? [...specs[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)]
          .map((row) => [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => text(c[1])))
          .filter((cells) => cells.length >= 2)
          .map(([label, price]) => ({ label, price }))
      : [];

    let free = null;
    const availabilityText = spaces ? text(spaces[1]) : null;
    if (availabilityText) {
      const count = availabilityText.match(/(\d+)\s*plaats/i);
      if (count) free = Number(count[1]);
      else if (/^vol$/i.test(availabilityText)) free = 0;
    }

    return {
      id: href?.[1] ?? null,
      name: name ? text(name[1]) : null,
      entrances,
      openingHours: opening ? text(opening[1]) : null,
      free,
      tariffs,
      url: href ? new URL(`/parkeren-groningen/parkeergarage-${href[1]}`, URL_).href : null,
    };
  });
}

export default {
  id: 'parkeren050',
  name: 'parkeren050.nl',
  url: URL_,
  // Vaste lijst: deze garages staan altijd op de kaart, ook als de bron faalt.
  initial: GARAGES.map((g) => ({ ...g, kind: 'garage', operator: 'Gemeente Groningen', city: 'Groningen' })),
  async fetch() {
    const html = await (await fetchSource(URL_, 'text/html')).text();
    const known = new Map(GARAGES.map((g) => [g.id, g]));
    return parse(html)
      .filter((p) => p.id && known.has(p.id))
      .map((p) => ({
        ...known.get(p.id),
        kind: 'garage',
        operator: 'Gemeente Groningen', city: 'Groningen',
        name: p.name || known.get(p.id).name,
        entrances: p.entrances.length ? p.entrances : known.get(p.id).entrances,
        free: p.free,
        capacity: null,
        openingHours: p.openingHours,
        tariffs: p.tariffs,
        url: p.url,
        sourceUpdatedAt: null, // bron publiceert geen update-tijd
      }));
  },
};
