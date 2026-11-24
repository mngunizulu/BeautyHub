import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Field, FormStatus, Panel, PrimaryButton, inputCls } from '@/components/forms';
import { getBookingData, sendBookingData } from '@/lib/booking';
import { errorText } from '@/lib/api';

type Review = { id: string; rating: number; comment: string; reply: string; date: string; location: string };
type ReviewPage = { reviews: Review[]; hasMore: boolean };
const dates = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeZone: 'Europe/Berlin' });

export function BusinessReviews({ organizationId }: { organizationId: string }) {
  const [offset, setOffset] = useState(0);
  const path = '/api/organizations/' + organizationId + '/reviews';
  const query = useQuery({
    queryKey: [path, offset],
    queryFn: ({ signal }) => getBookingData<ReviewPage>(path + '?offset=' + offset, signal),
  });
  return <Panel title="Öffentliche Bewertungen">
    {query.isPending && <p role="status">Bewertungen werden geladen …</p>}
    {query.isError && <button type="button" className="underline" onClick={() => query.refetch()}>Bewertungen erneut laden</button>}
    {query.data?.reviews.length === 0 && <p>Keine veröffentlichten Bewertungen.</p>}
    <ul className="divide-y divide-border">
      {query.data?.reviews.map((review) => <li key={review.id} className="space-y-2 py-3">
        <p className="font-medium">{review.location} · {review.rating}/5 · {dates.format(new Date(review.date))}</p>
        {review.comment && <p className="whitespace-pre-wrap break-words">{review.comment}</p>}
        <ReviewReply review={review} path={path} />
      </li>)}
    </ul>
    <div className="flex gap-4 text-sm">
      {offset > 0 && <button type="button" className="underline" onClick={() => setOffset(offset - 20)}>Vorherige Bewertungen</button>}
      {query.data?.hasMore && <button type="button" className="underline" onClick={() => setOffset(offset + 20)}>Weitere Bewertungen</button>}
    </div>
  </Panel>;
}

function ReviewReply({ review, path }: { review: Review; path: string }) {
  const client = useQueryClient();
  const [draft, setDraft] = useState<string>();
  const reply = draft ?? review.reply;
  const save = useMutation({
    mutationFn: () => sendBookingData(path + '/' + review.id + '/reply', { reply }, 'PUT'),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: [path] });
      setDraft(undefined);
    },
  });
  return <form className="space-y-2" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
    <Field id={'reply-' + review.id} label="Öffentliche Antwort">
      <textarea id={'reply-' + review.id} className={inputCls} maxLength={2000}
        value={reply} disabled={save.isPending} onChange={(event) => { save.reset(); setDraft(event.target.value); }} />
    </Field>
    <PrimaryButton type="submit" testId={'save-reply-' + review.id}
      disabled={reply.trim() === review.reply} pending={save.isPending}>Antwort speichern</PrimaryButton>
    {save.isSuccess && <p role="status">Antwort gespeichert.</p>}
    <FormStatus error={save.error ? errorText(save.error) : null} />
  </form>;
}
