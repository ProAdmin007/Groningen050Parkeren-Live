// Ververst de meegeleverde momentopname van de catalogus (server/catalog-snapshot.json).
// Gebruik: npm run update-catalog
import { copyFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = await mkdtemp(join(tmpdir(), 'parkeren-catalog-'));
process.env.HISTORY_FILE = join(dir, 'history.json');
const { refreshCatalog } = await import('./catalog.js');

const cat = await refreshCatalog({ force: true });
if (!cat.fetchedAt || Date.now() - Date.parse(cat.fetchedAt) > 60_000) {
  console.error('Verversen mislukt; momentopname niet gewijzigd.');
  process.exit(1);
}
await copyFile(join(dir, 'catalog.json'), fileURLToPath(new URL('./catalog-snapshot.json', import.meta.url)));
const count = (k) => cat.items.filter((i) => i.kind === k).length;
console.log(`Momentopname bijgewerkt: ${cat.items.length} locaties (${count('garage')} garages, ${count('pr')} P+R, ${count('lot')} terreinen).`);
