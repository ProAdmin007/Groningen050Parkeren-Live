import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { isStale, levelOf, markerLabel } from './lib.js';

const TILE_URL = import.meta.env.VITE_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION =
  import.meta.env.VITE_TILE_ATTRIBUTION ||
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-bijdragers';

const CENTER = [53.2165, 6.5745];
// Onder dit zoomniveau worden markers compacter, zodat ze minder overlappen.
const COMPACT_BELOW = 14;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function iconFor(loc, data, now, selected) {
  const level = levelOf(loc, data, now);
  const stale = loc.free != null && isStale(loc, data, now);
  const classes = ['pg-marker', `pg-${level}`, loc.kind === 'pr' && 'pg-pr', stale && 'pg-stale', selected && 'pg-selected']
    .filter(Boolean)
    .join(' ');
  return L.divIcon({
    className: 'pg-icon',
    iconSize: [0, 0],
    html: `<div class="${classes}"><span class="pg-pill"><span class="pg-p">${loc.kind === 'pr' ? 'P+R' : 'P'}</span><span class="pg-num">${esc(
      markerLabel(loc),
    )}</span>${stale ? '<span class="pg-clock" aria-hidden="true"></span>' : ''}</span><span class="pg-tip"></span></div>`,
  });
}

function titleFor(loc, data, now) {
  const value =
    loc.status === 'closed'
      ? 'gesloten'
      : loc.free == null
        ? 'geen actuele gegevens'
        : loc.free === 0
          ? 'vol'
          : `${loc.free} plaatsen vrij`;
  return `${loc.name}: ${value}${loc.free != null && isStale(loc, data, now) ? ' (verouderd)' : ''}`;
}

export default function ParkingMap({ data, now, selectedId, onSelect }) {
  const container = useRef(null);
  const map = useRef(null);
  const markers = useRef(new Map());
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const fitted = useRef(false);

  useEffect(() => {
    const m = L.map(container.current, { zoomControl: false, center: CENTER, zoom: 14, zoomSnap: 0.25 });
    L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 19 }).addTo(m);
    L.control.zoom({ position: 'bottomright' }).addTo(m);
    m.attributionControl.setPrefix(false);
    m.on('click', () => onSelectRef.current(null));
    const setCompact = () => container.current?.classList.toggle('pg-compact', m.getZoom() < COMPACT_BELOW);
    m.on('zoomend', setCompact);
    setCompact();
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
      markers.current.clear();
      fitted.current = false;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m || !data) return;
    for (const loc of data.locations) {
      const selected = loc.id === selectedId;
      let marker = markers.current.get(loc.id);
      const icon = iconFor(loc, data, now, selected);
      if (!marker) {
        marker = L.marker([loc.lat, loc.lng], { icon, keyboard: true, riseOnHover: true })
          .on('click', (e) => {
            L.DomEvent.stopPropagation(e);
            onSelectRef.current(loc.id);
          })
          .addTo(m);
        markers.current.set(loc.id, marker);
      } else {
        marker.setLatLng([loc.lat, loc.lng]);
        marker.setIcon(icon);
      }
      // Garages boven P+R; geselecteerde marker altijd bovenop.
      marker.setZIndexOffset(selected ? 2000 : loc.kind === 'pr' ? 0 : 500);
      const el = marker.getElement();
      if (el) {
        el.setAttribute('title', titleFor(loc, data, now));
        el.setAttribute('aria-label', titleFor(loc, data, now));
      }
    }
    const ids = new Set(data.locations.map((l) => l.id));
    for (const [id, marker] of markers.current) {
      if (!ids.has(id)) {
        marker.remove();
        markers.current.delete(id);
      }
    }
    if (!fitted.current) {
      fitted.current = true;
      // Start op de binnenstad (de garages); P+R-terreinen aan de rand zie je door uit te zoomen.
      const centre = data.locations.filter((l) => l.kind === 'garage');
      const mobile = window.innerWidth < 640;
      m.fitBounds(L.latLngBounds((centre.length ? centre : data.locations).map((l) => [l.lat, l.lng])), {
        paddingTopLeft: mobile ? [24, 100] : [40, 110],
        paddingBottomRight: mobile ? [24, 60] : [40, 60],
        maxZoom: 15,
      });
    }
  }, [data, now, selectedId]);

  // Geselecteerde locatie in beeld houden boven het informatievenster.
  useEffect(() => {
    const m = map.current;
    const loc = data?.locations.find((x) => x.id === selectedId);
    if (!m || !loc) return;
    const mobile = window.innerWidth < 640;
    m.panInside([loc.lat, loc.lng], {
      paddingTopLeft: [mobile ? 40 : 420, 120],
      paddingBottomRight: [40, mobile ? 380 : 60],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  return <div ref={container} className="absolute inset-0 z-0" role="application" aria-label="Kaart van Groningen met parkeerlocaties" />;
}
