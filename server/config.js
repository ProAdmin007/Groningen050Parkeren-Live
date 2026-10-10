const env = (key, fallback) => {
  const n = Number(process.env[key]);
  return Number.isFinite(n) && process.env[key] !== '' ? n : fallback;
};

export const CONFIG = {
  cacheTtlMs: env('CACHE_TTL_SECONDS', 30) * 1000,
  timeoutMs: env('FETCH_TIMEOUT_SECONDS', 10) * 1000,
  // Na deze tijd zonder succesvolle controle heet een stand "verouderd".
  staleAfterSeconds: env('STALE_AFTER_SECONDS', 300),
  // Als de bron zelf een update-tijd geeft en die ouder is dan dit, heet de stand ook "verouderd".
  sourceStaleAfterSeconds: env('SOURCE_STALE_AFTER_SECONDS', 1800),
  // Groen boven LOW, oranje van 1 t/m LOW, rood bij 0 / VOL.
  thresholdLow: env('THRESHOLD_LOW', 50),
  // Bron zonder eigen update-tijd waarvan geen enkele waarde zo lang verandert, heet "mogelijk stilgevallen".
  frozenAfterSeconds: env('FROZEN_AFTER_SECONDS', 1800),
  // Historie voor de trendanalyse: de server meet zelf elke POLL_SECONDS, ook zonder bezoekers.
  pollSeconds: env('POLL_SECONDS', 60),
  historyDays: env('HISTORY_DAYS', 7),
  // Leeg = niet opslaan (historie alleen in het geheugen).
  historyFile: process.env.HISTORY_FILE ?? 'data/history.json',
};

export const USER_AGENT = 'ParkerenGroningen/1.0 (kaartweergave parkeerbezetting)';

export async function fetchSource(url, accept) {
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: accept },
    signal: AbortSignal.timeout(CONFIG.timeoutMs),
  });
  if (!res.ok) throw new Error(`bron gaf HTTP ${res.status}`);
  return res;
}
