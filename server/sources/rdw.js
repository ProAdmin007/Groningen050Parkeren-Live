// Landelijke open parkeerdata (SPDP v2): alle openbare live-feeds in Nederland.
import { CONFIG } from '../config.js';
import { spdpSource, titleCase } from './spdp.js';

export default spdpSource({
  id: 'rdw',
  // De bijsluiter bij deze open data (CC0) staat niet toe te vermelden dat de gegevens van de
  // RDW afkomstig zijn, dus in de app heet deze bron neutraal en zonder link.
  name: 'Landelijke open parkeerdata',
  listUrl: 'https://npropendata.rdw.nl/parkingdata/v2/',
  ttlMs: CONFIG.rdwPollSeconds * 1000,
  minFacilities: 50,
  // Bestaande id's behouden, zodat de historie doorloopt.
  aliases: { '751c1199-6ad2-4fc4-b879-8b9091c9d96c': 'pr-hoofdstation' },
  // "Garage Circus (Groningen)" -> "Garage Circus"; namen in hoofdletters netjes maken.
  cleanName(raw) {
    let n = raw.replace(/\s*\([^)]*\)\s*$/, '').trim();
    if (n && n === n.toUpperCase()) n = titleCase(n);
    return n.replace(/\bP\+r\b/g, 'P+R');
  },
});
