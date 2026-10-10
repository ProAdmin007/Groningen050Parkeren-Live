import { useEffect, useRef, useState } from 'react';
import { REQUEST_TIMEOUT_MS } from './lib.js';

const RANGES = [
  ['3h', '3 uur'],
  ['24h', '24 uur'],
  ['7d', '7 dagen'],
];

const TZ = 'Europe/Amsterdam';
const hm = new Intl.DateTimeFormat('nl-NL', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
const dayHm = new Intl.DateTimeFormat('nl-NL', { timeZone: TZ, weekday: 'short', hour: '2-digit', minute: '2-digit' });
const day = new Intl.DateTimeFormat('nl-NL', { timeZone: TZ, weekday: 'short', day: 'numeric' });
const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');

const H = 120; // hoogte plotgebied
const PAD = { top: 8, right: 8, bottom: 20, left: 32 };

function Chart({ trend }) {
  const wrap = useRef(null);
  const [width, setWidth] = useState(320);
  const [hover, setHover] = useState(null);

  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(200, e.contentRect.width)));
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);

  const pts = trend.points.map(([t, v]) => [Date.parse(t), v]);
  const t0 = pts[0]?.[0] ?? 0;
  const t1 = pts.at(-1)?.[0] ?? 1;
  const values = pts.map(([, v]) => v).filter((v) => v != null);
  const yMax = Math.max(trend.capacity ?? 0, ...values, 10);
  const niceMax = Math.ceil(yMax / 50) * 50;
  const W = width - PAD.left - PAD.right;
  const x = (t) => PAD.left + ((t - t0) / (t1 - t0 || 1)) * W;
  const y = (v) => PAD.top + H - (v / niceMax) * H;

  // Lijn en vlak, onderbroken bij gaten.
  const segments = [];
  let cur = [];
  for (const [t, v] of pts) {
    if (v == null) {
      if (cur.length) segments.push(cur);
      cur = [];
    } else cur.push([x(t), y(v)]);
  }
  if (cur.length) segments.push(cur);
  const line = segments.map((s) => 'M' + s.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join('L')).join('');
  const area = segments
    .map((s) => `M${s[0][0].toFixed(1)},${y(0)}L` + s.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join('L') + `L${s.at(-1)[0].toFixed(1)},${y(0)}Z`)
    .join('');

  const fmtTick = trend.range === '7d' ? day : hm;
  const ticks = trend.range === '7d' ? [0, 2, 4, 6].map((d) => t0 + d * 86_400_000 + 3_600_000) : [t0, (t0 + t1) / 2, t1];

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const t = t0 + ((px - PAD.left) / W) * (t1 - t0);
    let best = null;
    for (const p of pts) if (p[1] != null && (!best || Math.abs(p[0] - t) < Math.abs(best[0] - t))) best = p;
    setHover(best);
  };

  const summary = values.length
    ? `Vrije plaatsen afgelopen ${RANGES.find((r) => r[0] === trend.range)[1]}: minimaal ${trend.stats?.min}, maximaal ${trend.stats?.max}, nu ${trend.current ?? 'onbekend'}.`
    : 'Nog geen metingen in deze periode.';

  return (
    <div ref={wrap} className="relative">
      <svg
        width={width}
        height={H + PAD.top + PAD.bottom}
        role="img"
        aria-label={summary}
        className="block touch-none select-none"
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={PAD.left} x2={PAD.left + W} y1={y(niceMax * f)} y2={y(niceMax * f)} className="stroke-slate-200" strokeWidth="1" />
            <text x={PAD.left - 6} y={y(niceMax * f) + 3.5} textAnchor="end" className="fill-slate-400 text-[10px] tabular-nums">
              {Math.round(niceMax * f)}
            </text>
          </g>
        ))}
        {trend.capacity != null && trend.capacity < niceMax && (
          <line x1={PAD.left} x2={PAD.left + W} y1={y(trend.capacity)} y2={y(trend.capacity)} className="stroke-slate-300" strokeDasharray="3 3" />
        )}
        <path d={area} className="fill-slate-900/[0.06]" />
        <path d={line} fill="none" className="stroke-slate-700" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {ticks.map((t, i) => (
          <text
            key={t}
            x={x(t)}
            y={H + PAD.top + 15}
            textAnchor={trend.range === '7d' ? 'middle' : i === 0 ? 'start' : i === ticks.length - 1 ? 'end' : 'middle'}
            className="fill-slate-400 text-[10px] tabular-nums"
          >
            {fmtTick.format(new Date(t))}
          </text>
        ))}
        {hover && (
          <g>
            <line x1={x(hover[0])} x2={x(hover[0])} y1={PAD.top} y2={PAD.top + H} className="stroke-slate-400" strokeWidth="1" />
            <circle cx={x(hover[0])} cy={y(hover[1])} r="4.5" className="fill-slate-800 stroke-white" strokeWidth="2" />
          </g>
        )}
      </svg>
      {hover && (
        <div
          className="pointer-events-none absolute top-0 rounded-lg bg-slate-900 px-2 py-1 text-[11px] whitespace-nowrap text-white shadow-lg"
          style={{ left: Math.min(Math.max(x(hover[0]) - 50, 0), width - 110) }}
        >
          <span className="text-slate-300">{(trend.range === '3h' ? hm : dayHm).format(new Date(hover[0]))}</span>{' '}
          <span className="font-semibold tabular-nums">{hover[1]} vrij</span>
        </div>
      )}
      <table className="sr-only">
        <caption>Vrije plaatsen per tijdvak</caption>
        <tbody>
          {pts
            .filter(([, v]) => v != null)
            .map(([t, v]) => (
              <tr key={t}>
                <th scope="row">{dayHm.format(new Date(t))}</th>
                <td>{v}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

const DIRECTION = {
  filling: { label: 'Loopt vol', arrow: 'M12 5v14m0 0l-6-6m6 6l6-6' },
  emptying: { label: 'Loopt leeg', arrow: 'M12 19V5m0 0l-6 6m6-6l6 6' },
  stable: { label: 'Stabiel', arrow: 'M5 12h14m0 0l-5-5m5 5l-5 5' },
};

export default function TrendPanel({ id, refreshKey, now }) {
  const [range, setRange] = useState('3h');
  const [trend, setTrend] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
    fetch(`/api/history?id=${encodeURIComponent(id)}&range=${range}`, { signal: ctrl.signal, cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((t) => {
        setTrend(t);
        setError(null);
      })
      .catch((err) => err.name !== 'AbortError' && setError('Trend kon niet worden geladen'))
      .finally(() => clearTimeout(timeout));
    return () => {
      clearTimeout(timeout);
      ctrl.abort();
    };
  }, [id, range, refreshKey]);

  const t = trend?.id === id && trend.range === range ? trend : null;
  const dir = t?.direction && DIRECTION[t.direction];

  return (
    <div className="mt-3 border-t border-slate-100 pt-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-800">Trend</h3>
        <div className="flex rounded-lg bg-slate-100 p-0.5 text-[11px] font-medium" role="group" aria-label="Periode">
          {RANGES.map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setRange(key)}
              aria-pressed={range === key}
              className={`cursor-pointer rounded-md px-2 py-1 transition ${range === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && !t && <p className="mt-2 text-xs text-slate-500">{error}.</p>}
      {!t && !error && <div className="mt-2 h-[148px] animate-pulse rounded-xl bg-slate-50" />}

      {t && (
        <>
          {t.reliable && (dir || t.change60 != null || t.typical) && (
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
              {dir && (
                <div className="rounded-xl bg-slate-50 px-3 py-2">
                  <p className="flex items-center gap-1 font-semibold text-slate-800">
                    <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d={dir.arrow} />
                    </svg>
                    {dir.label}
                  </p>
                  <p className="mt-0.5 text-slate-500 tabular-nums">{signed(t.ratePerHour)} per uur</p>
                </div>
              )}
              {t.fullAt ? (
                <div className="rounded-xl bg-slate-50 px-3 py-2">
                  <p className="font-semibold text-slate-800 tabular-nums">Vol rond {hm.format(new Date(t.fullAt))}</p>
                  <p className="mt-0.5 text-slate-500">schatting bij dit tempo</p>
                </div>
              ) : (
                t.change60 != null && (
                  <div className="rounded-xl bg-slate-50 px-3 py-2">
                    <p className="font-semibold text-slate-800 tabular-nums">{signed(t.change60)}</p>
                    <p className="mt-0.5 text-slate-500">afgelopen uur</p>
                  </div>
                )
              )}
              {t.typical && (
                <div className="col-span-2 rounded-xl bg-slate-50 px-3 py-2 text-slate-600">
                  Normaal rond dit tijdstip: <span className="font-semibold text-slate-800 tabular-nums">{t.typical.value} vrij</span>{' '}
                  <span className="text-slate-400">(gemiddelde van {t.typical.days} dagen)</span>
                </div>
              )}
            </div>
          )}

          {!t.reliable && t.samples > 0 && (
            <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Geen trendanalyse: de huidige stand is niet actueel. De grafiek toont de waarden zoals de bron ze meldde.
            </p>
          )}

          <div className="mt-2">
            {t.samples > 0 ? (
              <Chart trend={t} />
            ) : (
              <p className="rounded-xl bg-slate-50 px-3 py-6 text-center text-xs text-slate-500">Nog geen metingen in deze periode.</p>
            )}
          </div>

          <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
            {t.stats && (
              <>
                Min {t.stats.min} · gem. {t.stats.avg} · max {t.stats.max}
                {' · '}
              </>
            )}
            {t.historySince
              ? `eigen metingen sinds ${(now - Date.parse(t.historySince) > 86_400_000 ? dayHm : hm).format(new Date(t.historySince))}`
              : 'nog geen eigen metingen'}
            {t.reliable && !dir && t.samples > 0 && ' · te weinig recente metingen voor een richting'}
          </p>
        </>
      )}
    </div>
  );
}
