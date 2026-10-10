import { formatTime } from './lib.js';

const isOld = (iso, data, now) => !iso || now - Date.parse(iso) > data.staleAfterSeconds * 1000;
// Vroegste succesvolle controle over alle bronnen: zo oud is de oudste getoonde stand hooguit.
const oldestSuccess = (sources) =>
  sources.every((s) => s.lastSuccessAt) ? sources.map((s) => s.lastSuccessAt).sort()[0] : null;

function status({ data, clientError, lastClientSuccess, refreshing, now }) {
  if (!data && refreshing) return { tone: 'busy', text: 'Gegevens ophalen…' };
  if (!data && clientError) return { tone: 'error', text: `Ophalen mislukt (${clientError}) · nieuwe poging volgt` };
  if (clientError)
    return { tone: 'error', text: `Verbinding mislukt · laatst gelukt ${formatTime(lastClientSuccess, now)}` };
  if (!data) return { tone: 'busy', text: 'Gegevens ophalen…' };

  const failed = data.sources.filter((s) => s.error);
  if (failed.length === data.sources.length) return { tone: 'error', text: 'Bronnen niet bereikbaar · nieuwe poging volgt' };
  if (failed.length)
    return {
      tone: 'warn',
      text: `${failed.map((s) => s.name).join(', ')} niet bereikbaar`,
    };
  const frozen = data.groups.filter((g) => g.frozen);
  if (frozen.length)
    return { tone: 'warn', text: `${frozen.map((g) => g.label).join(', ')}: geen wijzigingen sinds ${formatTime(frozen[0].lastChangeAt, now)}` };
  const oldest = oldestSuccess(data.sources);
  if (isOld(oldest, data, now)) return { tone: 'warn', text: `Gegevens verouderd · gecontroleerd ${formatTime(oldest, now) ?? '–'}` };
  return { tone: 'ok', text: `Gecontroleerd om ${formatTime(oldest, now)}` };
}

const DOT = {
  ok: 'bg-emerald-500',
  warn: 'bg-amber-500',
  error: 'bg-rose-500',
  busy: 'bg-slate-400 animate-pulse',
};

// "Parkeren <stad>" met een onzichtbare native keuzelijst over de stadsnaam: werkt
// overal (ook op mobiel) en de breedte volgt de getoonde naam.
function CityPicker({ data, place, citySlug, onSelectCity }) {
  return (
    <span className="relative inline-flex min-w-0 items-center gap-0.5 rounded-md hover:bg-slate-900/5 focus-within:ring-2 focus-within:ring-slate-400">
      <span className="truncate">{place ?? '…'}</span>
      <svg viewBox="0 0 20 20" className="size-4 shrink-0 text-slate-400" fill="currentColor" aria-hidden="true">
        <path d="M5.5 7.5 10 12l4.5-4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <select
        aria-label="Kies een stad"
        value={citySlug ?? ''}
        onChange={(e) => onSelectCity(e.target.value || null)}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        <option value="">Heel Nederland{data ? ` (${data.locations.length})` : ''}</option>
        {data?.cities.map((c) => (
          <option key={c.slug} value={c.slug}>
            {c.name} ({c.count})
          </option>
        ))}
      </select>
    </span>
  );
}

export default function Header(props) {
  const { refreshing, onRefresh } = props;
  const s = status(props);
  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-[1000] flex justify-center px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
      <div className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl border border-white/60 bg-white/85 py-2.5 pr-2 pl-4 shadow-[0_8px_30px_-12px_rgba(15,23,42,0.35)] backdrop-blur-xl">
        <div className="min-w-0 flex-1">
          <h1 className="flex min-w-0 items-center gap-1 text-[15px] leading-tight font-semibold tracking-tight text-slate-900">
            <span className="shrink-0">Parkeren</span>
            <CityPicker {...props} />
          </h1>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500" role="status" aria-live="polite">
            <span className={`size-1.5 shrink-0 rounded-full ${DOT[s.tone]}`} />
            <span className="truncate">{s.text}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          aria-label="Nu verversen"
          title="Nu verversen (automatisch elke 60 seconden)"
          className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-xl text-slate-500 transition hover:bg-slate-900/5 hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:outline-none disabled:cursor-default"
        >
          <svg
            viewBox="0 0 24 24"
            className={`size-[18px] ${refreshing ? 'animate-spin' : ''}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 12a9 9 0 1 1-2.64-6.36" />
            <path d="M21 3v6h-6" />
          </svg>
        </button>
      </div>
    </header>
  );
}
