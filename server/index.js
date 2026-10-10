// Productieserver: levert /api/parking en de gebouwde frontend uit ./dist.
// Geen externe dependencies nodig.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { apiHandler, historyHandler, startBackground } from './parking.js';

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
}).listen(PORT, () => console.log(`Parkeren Groningen draait op http://localhost:${PORT}`));

startBackground();
