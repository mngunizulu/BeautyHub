import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormStatus, Panel, PrimaryButton } from '@/components/forms';
import { getBookingData, sendBookingData } from '@/lib/booking';
import { errorText } from '@/lib/api';

type Report = { reason: keyof typeof reasons; details: string; pendingCount: number };
type Review = { id: string; comment: string; reply: string; rating: number; hidden: boolean; location: string; report: Report | null };
type Action = 'dismiss' | 'hide' | 'restore';
const reasons = { spam: 'Spam', abuse: 'Beleidigung oder Belästigung', personal_information: 'Personenbezogene Daten', other: 'Sonstiges' };
const path = '/api/admin/review-moderation';

export default function ReviewModerationPage() {
  const client = useQueryClient();
  const [offset, setOffset] = useState(0);
  const queue = useQuery({
    queryKey: [path, offset],
    queryFn: ({ signal }) => getBookingData<{ reviews: Review[]; hasMore: boolean }>(path + '?offset=' + offset, signal),
  });
  const save = useMutation({
    mutationFn: ({ id, action }: { id: string; action: Action }) => sendBookingData(path + '/' + id, { action }, 'PUT'),
    onSuccess: async () => { setOffset(0); await client.invalidateQueries({ queryKey: [path] }); },
  });
  return <div className="mx-auto max-w-3xl space-y-4 px-5 py-10">
    <h1 className="font-display text-4xl">Bewertungsmoderation</h1>
    {queue.isPending && <p role="status">Bewertungen werden geladen …</p>}
    <FormStatus error={queue.error || save.error ? errorText(queue.error ?? save.error) : null} />
    {queue.data?.reviews.length === 0 && <p>Keine Bewertungen zur Moderation.</p>}
    {queue.data?.reviews.map((review) => <Panel key={review.id} title={review.location + ' · ' + review.rating + '/5'}>
      <p className="text-sm">{review.hidden ? 'Ausgeblendet' : 'Veröffentlicht'}</p>
      {review.comment && <p className="whitespace-pre-wrap break-words">{review.comment}</p>}
      {review.reply && <p className="whitespace-pre-wrap break-words"><strong>Antwort des Betriebs </strong>{review.reply}</p>}
      {review.report && <div className="my-3 space-y-1 text-sm">
        <p>Offene Meldungen · {review.report.pendingCount}</p>
        <p>Neueste Meldung · {reasons[review.report.reason]}</p>
        {review.report.details && <p className="whitespace-pre-wrap break-words">{review.report.details}</p>}
      </div>}
      <div className="mt-3 flex flex-wrap gap-2">
        {review.hidden
          ? <PrimaryButton type="button" testId={'restore-review-' + review.id} disabled={save.isPending}
              onClick={() => save.mutate({ id: review.id, action: 'restore' })}>Wieder veröffentlichen</PrimaryButton>
          : <>
              <PrimaryButton type="button" testId={'dismiss-review-' + review.id} disabled={save.isPending}
                onClick={() => save.mutate({ id: review.id, action: 'dismiss' })}>Meldungen ablehnen</PrimaryButton>
              <PrimaryButton type="button" testId={'hide-review-' + review.id} disabled={save.isPending}
                onClick={() => save.mutate({ id: review.id, action: 'hide' })}>Bewertung ausblenden</PrimaryButton>
            </>}
      </div>
    </Panel>)}
    <div className="flex gap-4 text-sm">
      {offset > 0 && <button className="underline" type="button" onClick={() => setOffset(offset - 20)}>Zurück</button>}
      {queue.data?.hasMore && <button className="underline" type="button" onClick={() => setOffset(offset + 20)}>Weitere Bewertungen</button>}
    </div>
  </div>;
}
