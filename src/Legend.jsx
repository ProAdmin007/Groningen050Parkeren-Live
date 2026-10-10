export default function Legend({ low }) {
  const items = [
    ['bg-[var(--pg-green)]', `> ${low} vrij`],
    ['bg-[var(--pg-orange)]', `1–${low} vrij`],
    ['bg-[var(--pg-red)]', 'Vol'],
    ['bg-[var(--pg-gray)]', 'Geen actuele data'],
  ];
  return (
    <div className="pointer-events-none absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-4 z-[900] flex max-w-[calc(100%-5.5rem)] flex-wrap gap-x-3 gap-y-1 rounded-xl bg-white/85 px-3 py-2 text-[11px] text-slate-600 shadow-[0_4px_20px_-8px_rgba(15,23,42,0.3)] backdrop-blur-xl">
      {items.map(([color, label]) => (
        <span key={label} className="flex items-center gap-1.5">
          <span className={`size-2 rounded-full ${color}`} />
          {label}
        </span>
      ))}
    </div>
  );
}
