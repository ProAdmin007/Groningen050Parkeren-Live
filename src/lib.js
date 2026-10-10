export const REFRESH_MS = 60_000;
export const REQUEST_TIMEOUT_MS = 15_000;

const TZ = 'Europe/Amsterdam';
const timeFmt = new Intl.DateTimeFormat('nl-NL', { timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit' });
const dayFmt = new Intl.DateTimeFormat('nl-NL', { timeZone: TZ, day: 'numeric', month: 'short' });

/** Tijd in Europe/Amsterdam; met datum erbij als het niet vandaag is. */
export function formatTime(iso, now = Date.now()) {
  if (!iso) return null;
  const d = new Date(iso);
  const time = timeFmt.format(d);
  return dayFmt.format(d) === dayFmt.format(new Date(now)) ? time : `${dayFmt.format(d)} ${time}`;
}

/**
 * Verouderd als onze laatste controle te lang geleden is, als de bron zelf een oude update-tijd meldt,
 * of als in de groep van deze locatie (bron zonder eigen update-tijd) al lang geen enkele waarde is veranderd.
 */
export function isStale(loc, data, now) {
  if (!loc.lastCheckedAt) return true;
  if (groupOf(loc, data)?.frozen) return true;
  if (now - Date.parse(loc.lastCheckedAt) > data.staleAfterSeconds * 1000) return true;
  return !!loc.sourceUpdatedAt && now - Date.parse(loc.sourceUpdatedAt) > data.sourceStaleAfterSeconds * 1000;
}

/** 'green' | 'orange' | 'red' | 'gray' */
export function levelOf(loc, data, now) {
  if (loc.status === 'unknown' || loc.status === 'closed' || loc.free == null || isStale(loc, data, now)) return 'gray';
  if (loc.free <= 0) return 'red';
  if (loc.free <= data.thresholds.low) return 'orange';
  return 'green';
}

export function markerLabel(loc) {
  if (loc.status === 'closed') return 'Dicht';
  if (loc.free == null) return '–';
  if (loc.free <= 0) return 'Vol';
  return String(loc.free);
}

export const sourceOf = (loc, data) => data.sources.find((s) => s.id === loc.source);
export const groupOf = (loc, data) => data.groups?.find((g) => g.id === loc.group);

export const navigateUrl = (l) => `https://www.google.com/maps/dir/?api=1&destination=${l.lat},${l.lng}&travelmode=driving`;
