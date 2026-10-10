import { useEffect } from 'react';
import TrendPanel from './TrendPanel.jsx';
import { formatTime, groupOf, isStale, levelOf, navigateUrl, sourceOf } from './lib.js';

const TEXT = {
  green: 'text-[var(--pg-green)]',
  orange: 'text-[var(--pg-orange)]',
  red: 'text-[var(--pg-red)]',
  gray: 'text-slate-400',
};

export default function GarageCard({ location: l, data, now, onClose }) {
  const level = levelOf(l, data, now);
  const stale = isStale(l, data, now);
  const hasValue = l.free != null;
  const source = sourceOf(l, data);
  const group = groupOf(l, data);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <section
      aria-label={l.name}
      className="pg-card absolute inset-x-2 bottom-[max(0.5rem,env(safe-area-inset-bottom))] z-[1000] max-h-[70dvh] overflow-y-auto rounded-3xl border border-white/60 bg-white/95 p-5 shadow-[0_20px_50px_-15px_rgba(15,23,42,0.45)] backdrop-blur-xl sm:inset-x-auto sm:bottom-4 sm:left-4 sm:w-[380px]"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium tracking-wider text-slate-400 uppercase">
            {l.kind === 'pr' ? 'P+R-terrein' : 'Parkeergarage'}
            {l.operator && ` · ${l.operator}`}
          </p>
          <h2 className="text-xl leading-tight font-semibold tracking-tight text-slate-900">{l.name}</h2>
          {l.entrances.map((e) => (
            <p key={e} className="mt-0.5 text-sm text-slate-500">
              {e}
            </p>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Sluiten"
          className="-mt-1 -mr-1 grid size-9 shrink-0 cursor-pointer place-items-center rounded-full text-slate-400 transition hover:bg-slate-900/5 hover:text-slate-700"
        >
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <div className="mt-4 flex items-end gap-2">
        {l.status === 'closed' ? (
          <span className="text-base font-medium text-slate-500">Gesloten volgens de bron</span>
        ) : hasValue ? (
          <>
            <span className={`text-4xl leading-none font-bold tracking-tight tabular-nums ${TEXT[level]}`}>
              {l.free === 0 ? 'Vol' : l.free}
            </span>
            {l.free > 0 && (
              <span className="pb-0.5 text-sm text-slate-500">
                vrije plaatsen{l.capacity ? ` van ${l.capacity}` : ''}
              </span>
            )}
          </>
        ) : (
          <span className="text-base font-medium text-slate-500">Geen actuele bezetting beschikbaar</span>
        )}
        {hasValue && stale && (
          <span className="mb-0.5 ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
            Verouderd
          </span>
        )}
      </div>

      {(stale || source?.error) && (
        <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
          {stale && hasValue && !group?.frozen && 'Dit is mogelijk niet de actuele stand; de situatie kan afwijken. '}
          {stale && !l.lastCheckedAt && 'Er zijn nog geen gegevens van deze locatie opgehaald. '}
          {group?.frozen &&
            `Geen enkele waarde van de ${group.label} is veranderd sinds ${formatTime(group.lastChangeAt, now)}; deze data is mogelijk niet actueel. `}
          {source?.error && `Laatste ophaalpoging bij ${source.name} mislukt: ${source.error}.`}
        </p>
      )}

      <dl className="mt-4 space-y-1 border-t border-slate-100 pt-3 text-xs text-slate-500">
        <div className="flex justify-between gap-3">
          <dt>Laatst gecontroleerd</dt>
          <dd className="font-medium text-slate-700 tabular-nums">{formatTime(l.lastCheckedAt, now) ?? 'nog niet gelukt'}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Update-tijd bron</dt>
          <dd className={`text-right ${l.sourceUpdatedAt ? 'font-medium text-slate-700 tabular-nums' : 'text-slate-500'}`}>
            {l.sourceUpdatedAt ? formatTime(l.sourceUpdatedAt, now) : 'niet gepubliceerd door bron'}
          </dd>
        </div>
        {l.valueSince && hasValue && (
          <div className="flex justify-between gap-3">
            <dt>Waarde ongewijzigd sinds</dt>
            <dd className="text-right text-slate-500 tabular-nums">
              {formatTime(l.valueSince, now)}
              {l.valueSinceIsUpperBound && ' of eerder'}
            </dd>
          </div>
        )}
        {source && (
          <div className="flex justify-between gap-3">
            <dt>Bron</dt>
            <dd className="text-right">
              <a href={l.url || source.url} target="_blank" rel="noopener noreferrer" className="underline decoration-slate-300 underline-offset-2 hover:text-slate-800">
                {source.name}
              </a>
            </dd>
          </div>
        )}
      </dl>

      <TrendPanel id={l.id} refreshKey={data.serverTime} now={now} />

      {(l.tariffs.length > 0 || l.openingHours) && (
        <div className="mt-3 border-t border-slate-100 pt-3 text-sm">
          {l.tariffs.map((t) => (
            <div key={t.label} className="flex justify-between gap-3 py-0.5">
              <span className="text-slate-500">{t.label}</span>
              <span className="font-medium whitespace-nowrap text-slate-800 tabular-nums">{t.price}</span>
            </div>
          ))}
          {l.openingHours && <p className="mt-1 text-xs text-slate-400">{l.openingHours}</p>}
        </div>
      )}

      <a
        href={navigateUrl(l)}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 active:scale-[0.99]"
      >
        <svg viewBox="0 0 24 24" className="size-4" fill="currentColor">
          <path d="M21.7 11.3l-9-9a1 1 0 0 0-1.4 0l-9 9a1 1 0 0 0 0 1.4l9 9a1 1 0 0 0 1.4 0l9-9a1 1 0 0 0 0-1.4zM14 14.5V12h-4v3H8v-4a1 1 0 0 1 1-1h5V7.5l3.5 3.5z" />
        </svg>
        Navigeer met Google Maps
      </a>
    </section>
  );
}
