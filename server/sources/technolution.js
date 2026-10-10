// Open parkeerdata van Technolution, leverancier van parkeerverwijssystemen voor o.a.
// Groningen, Utrecht, Rotterdam, Leeuwarden en Deventer. Zelfde formaat (SPDP) als de
// landelijke feed, met update-tijd van de bron. Een deel van deze locaties staat ook in de
// landelijke feed; dubbele locaties worden in parking.js samengevoegd.
import { CONFIG } from '../config.js';
import { spdpSource } from './spdp.js';

export default spdpSource({
  id: 'technolution',
  // Gemeentelijke data via Technolution, gepubliceerd onder CC BY 4.0: naamsvermelding verplicht.
  name: 'Parkeerverwijssystemen gemeenten (Technolution, CC BY 4.0)',
  url: 'https://opendata.technolution.nl/opendata/parkingdata/v1',
  listUrl: 'https://opendata.technolution.nl/opendata/parkingdata/v1',
  ttlMs: CONFIG.rdwPollSeconds * 1000,
  // Namen zijn "<code of naam> - <omschrijving>", bv. "P+R Kardinge - P+R Kardinge",
  // "Hoog Catharijne P6 - Hoog Catharijne P6 (Rijnkade)", "P22 - P+R_Kralingse Zoom".
  cleanName(raw) {
    const [a, b] = raw.split(/\s+-\s+/, 2).map((s) => s.replace(/_/g, ' ').replace(/\s+/g, ' ').trim());
    if (!b) return a;
    if (b.toLowerCase().startsWith(a.toLowerCase())) return b; // "Forum - Forum", "HC P6 - HC P6 (Rijnkade)"
    if (/^[A-Z]{0,4}\s?\d+[A-Z-]*$/i.test(a) || /^[A-Z]+\s?P\d+$/i.test(a)) return b.replace(/^P\s(?=[A-Z])/, ''); // "P11 - Gasthuisvelden", "P28 - P Veranda"
    return `${b} (${a})`; // "Tesselschadestraat - De Revius" -> "De Revius (Tesselschadestraat)"
  },
});
