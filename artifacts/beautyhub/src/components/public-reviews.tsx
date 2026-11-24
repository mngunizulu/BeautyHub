import { useAuth } from '@clerk/react';
import { useMutation } from '@tanstack/react-query';
import { FormStatus, PrimaryButton, inputCls } from '@/components/forms';
import { sendBookingData } from '@/lib/booking';
import { errorText } from '@/lib/api';
import { useState } from 'react';
import { useListPublicBusinessReviews } from '@workspace/api-client-react';

type ReviewSort = 'newest' | 'highest' | 'lowest';
const dateLabel = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeZone: 'Europe/Berlin' });
const ratingLabel = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });

export function PublicReviews({ slug }: { slug: string }) {
  const { userId } = useAuth();
  const [sort, setSort] = useState<ReviewSort>('newest');
  const [offset, setOffset] = useState(0);
  const query = useListPublicBusinessReviews(slug, { sort, offset });
  return <section className="mt-10" aria-labelledby="salon-reviews">
    <h2 id="salon-reviews" className="font-display text-3xl">Bewertungen</h2>
    {query.isPending && <p role="status">Bewertungen werden geladen …</p>}
    {query.isError && <button type="button" className="underline" onClick={() => query.refetch()}>Bewertungen erneut laden</button>}
    {query.data?.count === 0 && <p className="mt-3 text-muted-foreground">Noch keine veröffentlichten Bewertungen.</p>}
    {!!query.data?.count && <div className="mt-3 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p><strong>{ratingLabel.format(query.data.average!)}/5</strong> · {query.data.count} {query.data.count === 1 ? 'Bewertung' : 'Bewertungen'}</p>
        <label className="flex items-center gap-2">Sortieren
          <select className="rounded-md border border-border bg-background p-2" value={sort}
            onChange={(event) => { setSort(event.target.value as ReviewSort); setOffset(0); }}>
            <option value="newest">Neueste zuerst</option>
            <option value="highest">Höchste Bewertung</option>
            <option value="lowest">Niedrigste Bewertung</option>
          </select>
        </label>
      </div>
      <ul className="divide-y divide-border rounded-xl border border-border">
        {query.data.reviews.map((review) => <li key={review.id} className="space-y-2 p-4">
          <p className="text-sm font-medium">{review.rating}/5 · <time dateTime={review.date}>{dateLabel.format(new Date(review.date))}</time></p>
          {review.comment && <p className="whitespace-pre-wrap break-words">{review.comment}</p>}
          {review.reply && <div className="border-l-2 border-border pl-3">
            <p className="text-sm font-medium">Antwort des Betriebs</p>
            <p className="whitespace-pre-wrap break-words">{review.reply}</p>
          </div>}
          {userId && <ReportReview key={userId} id={review.id} />}
        </li>)}
      </ul>
      <div className="flex gap-4">
        {offset > 0 && <button type="button" className="underline" onClick={() => setOffset(offset - 10)}>Zurück</button>}
        {offset + 10 < query.data.count && <button type="button" className="underline" onClick={() => setOffset(offset + 10)}>Weitere Bewertungen</button>}
      </div>
    </div>}
  </section>;
}

function ReportReview({ id }: { id: string }) {
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const report = useMutation({
    mutationFn: () => sendBookingData('/api/me/reviews/' + id + '/report', { reason, details }),
  });

  if (report.isSuccess) return <p role="status" className="text-sm">Meldung eingegangen.</p>;
  return <details className="text-sm">
    <summary className="cursor-pointer underline">Bewertung melden</summary>
    <form className="mt-2 space-y-2" onSubmit={(event) => { event.preventDefault(); report.mutate(); }}>
      <label className="block">Grund
        <select className={inputCls} required value={reason} onChange={(event) => setReason(event.target.value)}>
          <option value="">Bitte auswählen</option>
          <option value="spam">Spam</option>
          <option value="abuse">Beleidigung oder Belästigung</option>
          <option value="personal_information">Personenbezogene Daten</option>
          <option value="other">Sonstiges</option>
        </select>
      </label>
      <label className="block">Weitere Angaben (optional)
        <textarea className={inputCls} maxLength={1000} value={details} onChange={(event) => setDetails(event.target.value)} />
      </label>
      <PrimaryButton testId={'report-review-' + id} pending={report.isPending}>Meldung senden</PrimaryButton>
      <FormStatus error={report.error ? errorText(report.error) : null} />
    </form>
  </details>;
}
