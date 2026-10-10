import { useCallback, useEffect, useRef, useState } from 'react';
import ParkingMap from './ParkingMap.jsx';
import Header from './Header.jsx';
import GarageCard from './GarageCard.jsx';
import Legend from './Legend.jsx';
import { REFRESH_MS, REQUEST_TIMEOUT_MS } from './lib.js';

export default function App() {
  const [data, setData] = useState(null);
  const [clientError, setClientError] = useState(null);
  const [lastClientSuccess, setLastClientSuccess] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [clockOffset, setClockOffset] = useState(0); // serverklok - clientklok
  const [now, setNow] = useState(Date.now());
  const timer = useRef(null);
  const busy = useRef(false);

  const load = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    clearTimeout(timer.current);
    setRefreshing(true);
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch('/api/parking', { signal: ctrl.signal, cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setClockOffset(Date.parse(json.serverTime) - Date.now());
      setClientError(null);
      setLastClientSuccess(new Date().toISOString());
    } catch (err) {
      setClientError(err.name === 'AbortError' ? 'Time-out' : 'Server niet bereikbaar');
    } finally {
      clearTimeout(timeout);
      busy.current = false;
      setRefreshing(false);
      setNow(Date.now());
      timer.current = setTimeout(load, REFRESH_MS);
    }
  }, []);

  useEffect(() => {
    load();
    // Klok voor het herberekenen van 'verouderd'.
    const tick = setInterval(() => setNow(Date.now()), 10_000);
    // Na terugkeer naar het tabblad direct verversen als de data oud is.
    const onVisible = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(timer.current);
      clearInterval(tick);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  const serverNow = now + clockOffset;
  const selected = data?.locations.find((l) => l.id === selectedId) ?? null;

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-slate-100">
      <ParkingMap data={data} now={serverNow} selectedId={selectedId} onSelect={setSelectedId} />
      <Header
        data={data}
        clientError={clientError}
        lastClientSuccess={lastClientSuccess}
        refreshing={refreshing}
        onRefresh={load}
        now={serverNow}
      />
      {data && !selected && <Legend low={data.thresholds.low} />}
      {selected && (
        <GarageCard location={selected} data={data} now={serverNow} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
}
