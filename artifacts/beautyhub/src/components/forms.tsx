import { type ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import type { HourInput } from '@workspace/api-client-react';
import { WEEKDAYS } from '@/lib/api';

export const inputCls = 'w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-primary focus:ring-2 focus:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-60';

export function Field({ id, label, hint, error, children, className = '' }: { id: string; label: string; hint?: string; error?: string | null; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">{label}</label>
      {children}
      {error ? <p id={`${id}-error`} className="mt-1 text-xs text-destructive" role="alert">{error}</p> : hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function Panel({ title, kicker, children, actions, className = '' }: { title: string; kicker?: string; children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <section className={`rounded-[1.4rem] border border-card-border bg-card p-6 sm:p-7 ${className}`}>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          {kicker && <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{kicker}</p>}
          <h2 className="font-display text-2xl sm:text-3xl">{title}</h2>
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function Check({ id, label, checked, onChange, disabled, hint }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; hint?: string }) {
  return (
    <label htmlFor={id} className={`flex items-start gap-3 rounded-xl border border-border px-3.5 py-3 ${disabled ? 'opacity-60' : 'cursor-pointer hover:bg-secondary/50'}`}>
      <input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))]" data-testid={`checkbox-${id}`} />
      <span><span className="text-sm">{label}</span>{hint && <span className="block text-xs text-muted-foreground">{hint}</span>}</span>
    </label>
  );
}

export function FormStatus({ error, success }: { error?: string | null; success?: string | null }) {
  if (error) return <p role="alert" className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3.5 py-2.5 text-sm text-destructive" data-testid="text-form-error"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</p>;
  if (success) return <p role="status" className="flex items-center gap-2 rounded-xl bg-[hsl(150_25%_40%/.12)] px-3.5 py-2.5 text-sm text-[hsl(150_30%_25%)]" data-testid="text-form-success"><CheckCircle2 className="h-4 w-4" />{success}</p>;
  return null;
}

export function PrimaryButton({ children, pending, type = 'submit', onClick, disabled, testId, variant = 'primary' }: { children: ReactNode; pending?: boolean; type?: 'submit' | 'button'; onClick?: () => void; disabled?: boolean; testId: string; variant?: 'primary' | 'ghost' | 'danger' }) {
  const v = variant === 'primary' ? 'bg-primary text-primary-foreground hover:bg-primary/90' : variant === 'danger' ? 'border border-destructive/40 text-destructive hover:bg-destructive/10' : 'border border-border hover:bg-secondary';
  return (
    <button type={type} onClick={onClick} disabled={pending || disabled} data-testid={testId}
      className={`inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm transition-all active:scale-[.97] disabled:cursor-not-allowed disabled:opacity-60 ${v}`}>
      {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}{children}
    </button>
  );
}

export function ReadOnlyNote({ children }: { children: ReactNode }) {
  return <p className="mb-4 rounded-xl border border-dashed border-border bg-secondary/60 px-4 py-3 text-sm text-muted-foreground" data-testid="text-readonly">{children}</p>;
}

/** Weekly hours editor: one row per weekday, closed days are omitted from the value. */
export function HoursEditor({ idPrefix, value, onChange, disabled }: { idPrefix: string; value: HourInput[]; onChange: (h: HourInput[]) => void; disabled?: boolean }) {
  const byDay = new Map(value.map((h) => [h.weekday, h]));
  const set = (wd: number, next: HourInput | null) => {
    const rest = value.filter((h) => h.weekday !== wd);
    onChange((next ? [...rest, next] : rest).sort((a, b) => a.weekday - b.weekday));
  };
  return (
    <fieldset disabled={disabled} className="divide-y divide-dashed divide-border rounded-xl border border-border">
      <legend className="sr-only">Wochenzeiten</legend>
      {WEEKDAYS.map((name, i) => {
        const wd = i + 1; const h = byDay.get(wd);
        return (
          <div key={wd} className="flex flex-wrap items-center gap-3 px-3.5 py-2.5">
            <label className="flex w-36 items-center gap-2 text-sm">
              <input type="checkbox" checked={!!h} onChange={(e) => set(wd, e.target.checked ? { weekday: wd, opens: '09:00', closes: '18:00' } : null)} className="h-4 w-4 accent-[hsl(var(--primary))]" data-testid={`checkbox-${idPrefix}-day-${wd}`} />
              {name}
            </label>
            {h ? (
              <div className="flex items-center gap-2 text-sm">
                <label className="sr-only" htmlFor={`${idPrefix}-opens-${wd}`}>{name} öffnet</label>
                <input id={`${idPrefix}-opens-${wd}`} type="time" value={h.opens} onChange={(e) => set(wd, { ...h, opens: e.target.value })} className={`${inputCls} w-32 py-1.5`} data-testid={`input-${idPrefix}-opens-${wd}`} />
                <span className="text-muted-foreground">bis</span>
                <label className="sr-only" htmlFor={`${idPrefix}-closes-${wd}`}>{name} schließt</label>
                <input id={`${idPrefix}-closes-${wd}`} type="time" value={h.closes} onChange={(e) => set(wd, { ...h, closes: e.target.value })} className={`${inputCls} w-32 py-1.5`} data-testid={`input-${idPrefix}-closes-${wd}`} />
              </div>
            ) : <span className="font-mono text-xs text-muted-foreground">geschlossen</span>}
          </div>
        );
      })}
    </fieldset>
  );
}

export function EmptyNote({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-[1.2rem] border border-dashed border-border bg-background/60 px-6 py-10 text-center" data-testid="state-empty">
      <p className="font-display text-2xl">{title}</p>
      {children && <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
