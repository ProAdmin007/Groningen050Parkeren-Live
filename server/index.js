// Productieserver: levert /api/parking en de gebouwde frontend uit ./dist.
// Geen externe dependencies nodig.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { apiHandler, historyHandler, knownCities, startBackground } from './parking.js';

const PORT = Number(process.env.PORT) || 3000;
const DIST = resolve(fileURLToPath(new URL('../dist', import.meta.url)));

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
};

// Titel en beschrijving per stad al in de HTML zetten (/amsterdam), voor zoekmachines en
// voorvertoningen van gedeelde links. Onbekende paden krijgen de landelijke tekst.
const escHtml = (s) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
function forCity(html, pathname) {
  const slug = pathname.replace(/^\/+|\/+$/g, '').toLowerCase();
  const city = slug && knownCities().find((c) => c.slug === slug);
  const place = city ? city.name : 'Nederland';
  const title = `Parkeren ${place}: live vrije parkeerplaatsen op de kaart`;
  const desc = city
    ? `Zie live hoeveel plaatsen er vrij zijn in ${city.count} parkeergarages en P+R-terreinen in ${city.name}. Met trendanalyse per locatie.`
    : 'Zie live hoeveel parkeerplaatsen er vrij zijn in parkeergarages en op P+R-terreinen in heel Nederland. Met trendanalyse per locatie.';
  return html
    .replace(/<title>[^<]*<\/title>/, `<title>${escHtml(title)}</title>`)
    .replace(/(<meta\s+name="description"\s+content=")[^"]*(")/, `$1${escHtml(desc)}$2`)
    .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${escHtml(title)}$2`)
    .replace(/(<meta\s+property="og:description"\s+content=")[^"]*(")/, `$1${escHtml(desc)}$2`);
}

async function serveStatic(req, res) {
  const pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = resolve(join(DIST, pathname));
  if (file !== DIST && !file.startsWith(DIST + sep)) file = join(DIST, 'index.html');

  let body;
  try {
    body = await readFile(file);
  } catch {
    file = join(DIST, 'index.html');
    try {
      body = await readFile(file);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Niet gevonden. Draai eerst "npm run build".');
    }
  }
  if (file.endsWith('index.html')) body = forCity(body.toString('utf8'), pathname);
  const immutable = file.includes(`${sep}assets${sep}`);
  res.writeHead(200, {
    'Content-Type': TYPES[extname(file)] || 'application/octet-stream',
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  res.end(body);
}

createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405);
    return res.end();
  }
  if (req.url === '/api/parking' || req.url.startsWith('/api/parking?')) return apiHandler(req, res);
  if (req.url.startsWith('/api/history?')) return historyHandler(req, res);
  if (req.url === '/healthz') return res.end('ok');
  return serveStatic(req, res);
}).listen(PORT, () => console.log(`Parkeren Live draait op http://localhost:${PORT}`));

startBackground();
