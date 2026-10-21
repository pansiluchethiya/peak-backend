interface Props {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  actions?: React.ReactNode;
}

export function PageHeader({ title, subtitle, eyebrow, actions }: Props) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && (
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-indigo-300/60">
            {eyebrow}
          </p>
        )}
        <h1 className="text-[26px] font-bold tracking-[-0.025em] text-white sm:text-[30px]">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-white/45">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="mb-5 rounded-[10px] border border-red-400/20 bg-red-400/[0.07] px-4 py-3 text-[12.5px] text-red-200">
      {message}
    </div>
  );
}

export function LoadingBlock({ rows = 3 }: { rows?: number }) {
  return (
    <div className="card space-y-3 p-5">
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="skeleton h-4"
          style={{ width: `${88 - index * 12}%`, animationDelay: `${index * 90}ms` }}
        />
      ))}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: 'indigo' | 'emerald' | 'amber' | 'red';
}) {
  const dot: Record<string, string> = {
    indigo: 'bg-indigo-400',
    emerald: 'bg-emerald-400',
    amber: 'bg-amber-400',
    red: 'bg-red-400',
  };
  return (
    <div className="card card-hover p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className={`h-1.5 w-1.5 rounded-full ${dot[accent ?? 'indigo']}`} />
        <span className="text-[10.5px] font-bold uppercase tracking-[0.13em] text-white/40">{label}</span>
      </div>
      <p className="text-[30px] font-bold leading-none tracking-[-0.03em] text-white">{value}</p>
      {hint && <p className="mt-2 text-[11.5px] text-white/35">{hint}</p>}
    </div>
  );
}
