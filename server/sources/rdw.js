// Landelijke open parkeerdata (RDW / SPDP v2). In Groningen levert alleen
// P+R Hoofdstation hier openbaar live data, mét een update-tijd van de bron.
import { fetchSource } from '../config.js';

const BASE = 'https://npropendata.rdw.nl/parkingdata/v2/dynamic/';

// Locatie en adres uit de statische RDW-/Groningen Bereikbaar-gegevens.
const FACILITIES = [
  {
    id: 'pr-hoofdstation',
    rdwId: '751c1199-6ad2-4fc4-b879-8b9091c9d96c',
    name: 'P+R Hoofdstation',
    kind: 'pr',
    operator: 'Gemeente Groningen',
    entrances: ['Cascade, 9726 AD Groningen'],
    lat: 53.211582,
    lng: 6.560898,
  },
];

export default {
  id: 'rdw',
  providesUpdateTime: true,
  name: 'RDW open parkeerdata',
  url: 'https://npropendata.rdw.nl/parkingdata/v2/',
  initial: FACILITIES.map(({ rdwId, ...f }) => f),
  async fetch() {
    const results = await Promise.allSettled(
      FACILITIES.map(async ({ rdwId, ...f }) => {
        const json = await (await fetchSource(BASE + rdwId, 'application/json')).json();
        const s = json?.parkingFacilityDynamicInformation?.facilityActualStatus;
        if (!s) throw new Error('onverwacht formaat');
        return {
          ...f,
          free: s.open === false ? null : Number.isFinite(s.vacantSpaces) ? Math.max(0, s.vacantSpaces) : null,
          closed: s.open === false,
          capacity: Number.isFinite(s.parkingCapacity) ? s.parkingCapacity : null,
          tariffs: [],
          openingHours: null,
          url: BASE + rdwId,
          sourceUpdatedAt: s.lastUpdated ? new Date(s.lastUpdated * 1000).toISOString() : null,
        };
      }),
    );
    const ok = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
    if (!ok.length) throw results[0].reason;
    return ok;
  },
};
