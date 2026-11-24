import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Field, FormStatus, Panel, PrimaryButton, inputCls } from '@/components/forms';
import { errorText } from '@/lib/api';
import { getBookingData, sendBookingData } from '@/lib/booking';

type Balance = { organizationId: string; name: string; points: number };
type Reward = { name: string; code: string; discountCents: number; redeemedAt: string | null };
type Program = { pointsPerVisit: number };

export function LoyaltyBalances() {
  const path = '/api/me/loyalty';
  const rewardPath = path + '/rewards';
  const client = useQueryClient();
  const [requestIds, setRequestIds] = useState<Record<string, string>>({});
  const rewards = useQuery({
    queryKey: [rewardPath], queryFn: ({ signal }) => getBookingData<Reward[]>(rewardPath, signal),
  });
  const redeem = useMutation({
    mutationFn: ({ organizationId, requestId }: { organizationId: string; requestId: string }) =>
      sendBookingData(rewardPath + '/' + organizationId, { requestId }),
    onSuccess: async (_, { organizationId }) => {
      await Promise.all([client.invalidateQueries({ queryKey: [path] }), client.invalidateQueries({ queryKey: [rewardPath] })]);
      setRequestIds((current) => ({ ...current, [organizationId]: crypto.randomUUID() }));
    },
  });
  const balances = useQuery({
    queryKey: [path], queryFn: ({ signal }) => getBookingData<Balance[]>(path, signal),
  });
  return <Panel title="Treuepunkte">
    {balances.isPending && <p role="status">Treuepunkte werden geladen …</p>}
    {balances.isError && <button type="button" className="underline" onClick={() => balances.refetch()}>Treuepunkte erneut laden</button>}
    {balances.data?.length === 0 && <p>Du hast noch keine Treuepunkte gesammelt.</p>}
    {!!balances.data?.length && <ul className="space-y-2">{balances.data.map(({ organizationId, name, points }) =>
      <li key={organizationId} className="space-y-2">
        <p>{name} · {points.toLocaleString('de-DE')} {points === 1 ? 'Punkt' : 'Punkte'}</p>
        {points >= 50 && <PrimaryButton type="button" testId={'exchange-points-' + organizationId} disabled={redeem.isPending}
          onClick={() => {
            const requestId = requestIds[organizationId] ?? crypto.randomUUID();
            setRequestIds((current) => ({ ...current, [organizationId]: requestId }));
            redeem.mutate({ organizationId, requestId });
          }}>50 Punkte gegen 5 € eintauschen</PrimaryButton>}
      </li>)}</ul>}
    <FormStatus error={redeem.error ? errorText(redeem.error) : null} />
    {!!rewards.data?.length && <div className="mt-4 space-y-2">
      <h3 className="font-semibold">Treuegutscheine</h3>
      <p className="text-sm">Zeige den Code beim Bezahlen deines Termins beim angegebenen Betrieb.</p>
      <ul className="space-y-2 text-sm">{rewards.data.map((reward) => <li key={reward.code}>
        {reward.name} · {(reward.discountCents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
        {' · '}{reward.redeemedAt ? 'Eingelöst' : <code className="break-all select-all">{reward.code}</code>}
      </li>)}</ul>
    </div>}
    {rewards.isError && <button type="button" className="underline" onClick={() => rewards.refetch()}>Treuegutscheine erneut laden</button>}
  </Panel>;
}

export function LoyaltySettings({ organizationId }: { organizationId: string }) {
  const client = useQueryClient();
  const [draft, setDraft] = useState<string>();
  const path = '/api/organizations/' + organizationId + '/loyalty';
  const query = useQuery({
    queryKey: [path], queryFn: ({ signal }) => getBookingData<Program>(path, signal),
  });
  const value = draft ?? query.data?.pointsPerVisit.toString() ?? '';
  const save = useMutation({
    mutationFn: () => sendBookingData<Program>(path, { pointsPerVisit: Number(value) }, 'PUT'),
    onSuccess: (program) => { client.setQueryData([path], program); setDraft(undefined); },
  });
  return <Panel title="Treueprogramm">
    {query.isPending && <p role="status">Treueprogramm wird geladen …</p>}
    {query.isError && <button type="button" className="underline" onClick={() => query.refetch()}>Treueprogramm erneut laden</button>}
    {query.data && <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
      <Field id="points-per-visit" label="Punkte pro abgeschlossenem Termin"
        hint="0 pausiert das Sammeln. Bereits gesammelte Punkte bleiben erhalten.">
        <input id="points-per-visit" className={inputCls} type="number" min={0} max={1000} step={1} required
          value={value} disabled={save.isPending} onChange={(event) => { save.reset(); setDraft(event.target.value); }} />
      </Field>
      <PrimaryButton testId="save-loyalty-program" pending={save.isPending}
        disabled={value === '' || Number(value) === query.data.pointsPerVisit}>Treueprogramm speichern</PrimaryButton>
      {save.isSuccess && <p role="status">Treueprogramm gespeichert.</p>}
      <FormStatus error={save.error ? errorText(save.error) : null} />
    </form>}
  </Panel>;
}
