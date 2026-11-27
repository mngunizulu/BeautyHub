import { BusinessCategoryPicker } from '@/components/business-category-picker';
import { useState, type FormEvent } from 'react';
import { Link, useLocation, useSearch } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, Building2, MapPin, Plus } from 'lucide-react';
import {
  useListMyOrganizations, getListMyOrganizationsQueryKey, useCreateOrganization,
  getGetOrganizationWorkspaceQueryKey,
} from '@workspace/api-client-react';
import { EmptyNote, Field, FormStatus, Panel, PrimaryButton, inputCls } from '@/components/forms';
import { ErrorState } from '@/components/site';
import { errorText, roleLabel, statusLabel } from '@/lib/api';

export default function OrganizationsPage() {
  const search = useSearch();
  const [creating, setCreating] = useState(() => new URLSearchParams(search).has('neu'));
  const orgs = useListMyOrganizations({ query: { queryKey: getListMyOrganizationsQueryKey() } });
  return (
    <div className="mx-auto max-w-6xl px-5 pt-10">
      <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground rise">Betriebsverwaltung</p>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="mt-2 font-display text-5xl sm:text-6xl rise">Meine <span className="italic text-primary">Betriebe</span></h1>
        {!creating && <PrimaryButton type="button" onClick={() => setCreating(true)} testId="button-new-organization"><Plus className="h-4 w-4" />Betrieb anlegen</PrimaryButton>}
      </div>
      {creating && <div className="mt-8 rise"><CreateOrganization onCancel={() => setCreating(false)} /></div>}
      <div className="mt-8">
        {orgs.isLoading ? (
          <div className="grid gap-4 md:grid-cols-2">{Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-36 animate-pulse rounded-[1.4rem] bg-muted" />)}</div>
        ) : orgs.isError ? <ErrorState onRetry={() => orgs.refetch()} /> : !orgs.data?.length ? (
          !creating && <EmptyNote title="Noch kein Betrieb." action={<PrimaryButton type="button" onClick={() => setCreating(true)} testId="button-empty-create">Ersten Betrieb anlegen</PrimaryButton>}>Lege deinen Salon, dein Studio oder deine Praxis an. Bis zur Veröffentlichung bleibt alles ein privater Entwurf.</EmptyNote>
        ) : (
          <ul className="grid gap-4 md:grid-cols-2">
            {orgs.data.map((o, i) => (
              <li key={o.id} className="rise" style={{ animationDelay: `${i * 60}ms` }}>
                <Link href={`/unternehmen/${o.id}`} className="group block rounded-[1.4rem] border border-card-border bg-card p-6 transition-all hover:-translate-y-0.5 hover:shadow-[0_24px_50px_-28px_hsl(332_45%_26%/.5)]" data-testid={`card-organization-${o.id}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{roleLabel[o.role] ?? o.role}</p>
                      <h2 className="mt-1 font-display text-3xl" data-testid={`text-organization-name-${o.id}`}>{o.name}</h2>
                    </div>
                    <ArrowUpRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                  </div>
                  <div className="mt-5 flex flex-wrap gap-2 text-xs">
                    <span className={`rounded-full px-2.5 py-1 ${o.published ? 'bg-primary text-primary-foreground' : 'border border-border'}`}>{o.published ? 'veröffentlicht' : 'Entwurf'}</span>
                    <span className="rounded-full border border-border px-2.5 py-1">{statusLabel[o.status] ?? o.status}</span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1"><MapPin className="h-3 w-3" />{o.locationCount} {o.locationCount === 1 ? 'Standort' : 'Standorte'}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function CreateOrganization({ onCancel }: { onCancel: () => void }) {
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const create = useCreateOrganization();
  const [name, setName] = useState('');
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [touched, setTouched] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const nameErr = name.trim().length < 2 ? 'Mindestens 2 Zeichen.' : name.length > 120 ? 'Höchstens 120 Zeichen.' : null;
  const catErr = !categoryIds.length ? 'Bitte eine Kategorie wählen.' : null;
  const submit = (e: FormEvent) => {
    e.preventDefault(); setTouched(true); setErr(null);
    const [categoryId] = categoryIds;
    if (nameErr || !categoryId) return;
    create.mutate({ data: { name: name.trim(), categoryId, categoryIds } }, {
      onSuccess: (ws) => {
        qc.setQueryData(getGetOrganizationWorkspaceQueryKey(ws.id), ws);
        qc.invalidateQueries({ queryKey: getListMyOrganizationsQueryKey() });
        navigate(`/unternehmen/${ws.id}`);
      },
      onError: (e2) => setErr(errorText(e2)),
    });
  };
  return (
    <Panel title="Neuen Betrieb anlegen" kicker="Schritt 0 von 6">
      <form onSubmit={submit} noValidate className="grid gap-4">
        <Field id="org-name" label="Name des Betriebs" error={touched ? nameErr : null}>
          <input id="org-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="z. B. Studio Lindgrün" className={inputCls} data-testid="input-organization-name" autoFocus />
        </Field>
        <BusinessCategoryPicker value={categoryIds} onChange={setCategoryIds} error={touched ? catErr : null} />
        <div className="flex gap-2">
          <PrimaryButton pending={create.isPending} testId="button-create-organization"><Building2 className="h-4 w-4" />Anlegen</PrimaryButton>
          <PrimaryButton type="button" variant="ghost" onClick={onCancel} testId="button-cancel-create">Abbrechen</PrimaryButton>
        </div>
        <FormStatus error={err} />
      </form>
    </Panel>
  );
}
