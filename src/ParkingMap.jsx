import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { isStale, levelOf, markerLabel } from './lib.js';

const TILE_URL = import.meta.env.VITE_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION =
  import.meta.env.VITE_TILE_ATTRIBUTION ||
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-bijdragers';

const CENTER = [52.2, 5.3]; // midden van Nederland
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

// setIcon vervangt het element: titel en aria-label daarna opnieuw zetten.
function applyTitle(marker) {
  const el = marker.getElement();
  if (el && marker.pgTitle) {
    el.setAttribute('title', marker.pgTitle);
    el.setAttribute('aria-label', marker.pgTitle);
  }
}

// Onder dit zoomniveau toont de kaart één bundelmarker per stad.
const CITY_BELOW = 10.5;

function cityIcon(c) {
  const big = c.count >= 3;
  return L.divIcon({
    className: 'pg-icon',
    iconSize: [0, 0],
    html: `<div class="pg-city${big ? '' : ' pg-city-small'}"><span class="pg-city-count">${c.count}</span>${big ? `<span class="pg-city-name">${esc(c.name)}</span>` : ''}</div>`,
  });
}

const padding = () =>
  window.innerWidth < 640 ? { paddingTopLeft: [24, 100], paddingBottomRight: [24, 60] } : { paddingTopLeft: [40, 110], paddingBottomRight: [40, 60] };

export default function ParkingMap({ data, now, selectedId, onSelect, citySlug, onSelectCity }) {
  const container = useRef(null);
  const map = useRef(null);
  const layers = useRef(null);
  const markers = useRef(new Map());
  const cityMarkers = useRef(new Map());
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onSelectCityRef = useRef(onSelectCity);
  onSelectCityRef.current = onSelectCity;
  const fittedFor = useRef(undefined);

  useEffect(() => {
    const m = L.map(container.current, { zoomControl: false, center: CENTER, zoom: 8, zoomSnap: 0.25 });
    L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 19 }).addTo(m);
    L.control.zoom({ position: 'bottomright' }).addTo(m);
    // AGPL-3.0 (art. 13): gebruikers van de website moeten de broncode kunnen vinden.
    m.attributionControl.setPrefix(
      '<a href="https://github.com/ProAdmin007/Groningen050Parkeren-Live" target="_blank" rel="noopener noreferrer">Broncode (AGPL)</a>',
    );
    m.on('click', () => onSelectRef.current(null));
    const locLayer = L.layerGroup();
    const cityLayer = L.layerGroup();
    layers.current = { locLayer, cityLayer };
    const onZoom = () => {
      const z = m.getZoom();
      container.current?.classList.toggle('pg-compact', z < COMPACT_BELOW);
      const showCities = z < CITY_BELOW;
      if (showCities && !m.hasLayer(cityLayer)) {
        m.removeLayer(locLayer);
        m.addLayer(cityLayer);
      } else if (!showCities && !m.hasLayer(locLayer)) {
        m.removeLayer(cityLayer);
        m.addLayer(locLayer);
      }
    };
    m.on('zoomend', onZoom);
    onZoom();
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
      markers.current.clear();
      cityMarkers.current.clear();
      fittedFor.current = undefined;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m || !data) return;
    const { locLayer, cityLayer } = layers.current;
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
          // De laag kan nog verborgen zijn (ver uitgezoomd): titel zetten zodra de marker verschijnt.
          .on('add', (e) => applyTitle(e.target))
          .addTo(locLayer);
        markers.current.set(loc.id, marker);
      } else {
        marker.setLatLng([loc.lat, loc.lng]);
        marker.setIcon(icon);
      }
      // Garages boven P+R; geselecteerde marker altijd bovenop.
      marker.setZIndexOffset(selected ? 2000 : loc.kind === 'pr' ? 0 : 500);
      marker.pgTitle = titleFor(loc, data, now);
      applyTitle(marker);
    }
    const ids = new Set(data.locations.map((l) => l.id));
    for (const [id, marker] of markers.current) {
      if (!ids.has(id)) {
        marker.remove();
        markers.current.delete(id);
      }
    }

    // Bundelmarkers per stad (alleen zichtbaar bij ver uitzoomen).
    const slugs = new Set();
    for (const c of data.cities) {
      slugs.add(c.slug);
      let marker = cityMarkers.current.get(c.slug);
      if (!marker) {
        marker = L.marker([c.lat, c.lng], { icon: cityIcon(c), keyboard: true, title: `${c.name}: ${c.count} locaties met live bezetting` })
          .on('click', (e) => {
            L.DomEvent.stopPropagation(e);
            onSelectCityRef.current(c.slug);
          })
          .addTo(cityLayer);
        cityMarkers.current.set(c.slug, marker);
      } else {
        marker.setLatLng([c.lat, c.lng]);
        marker.setIcon(cityIcon(c));
      }
      marker.setZIndexOffset(c.count * 10);
    }
    for (const [slug, marker] of cityMarkers.current) {
      if (!slugs.has(slug)) {
        marker.remove();
        cityMarkers.current.delete(slug);
      }
    }
  }, [data, now, selectedId]);

  // Inzoomen op de gekozen stad (of heel Nederland) bij het laden en bij een andere keuze.
  useEffect(() => {
    const m = map.current;
    if (!m || !data?.locations.length) return;
    const key = citySlug ?? '';
    if (fittedFor.current === key) return;
    fittedFor.current = key;
    if (citySlug) {
      const inCity = data.locations.filter((l) => l.citySlug === citySlug);
      // Start op de garages in het centrum; P+R-terreinen aan de rand zie je door uit te zoomen.
      const garages = inCity.filter((l) => l.kind === 'garage');
      const focus = garages.length >= 2 ? garages : inCity;
      m.fitBounds(L.latLngBounds(focus.map((l) => [l.lat, l.lng])), { ...padding(), maxZoom: 15 });
    } else {
      m.fitBounds(L.latLngBounds(data.locations.map((l) => [l.lat, l.lng])), { ...padding(), maxZoom: 15 });
    }
  }, [data, citySlug]);

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

  return <div ref={container} className="absolute inset-0 z-0" role="application" aria-label="Kaart met parkeerlocaties met live bezetting" />;
}
