import { ArrowLink } from '@/components/site';

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-5 pt-24 text-center">
      <p className="font-mono text-sm text-muted-foreground">404</p>
      <h1 className="mt-2 font-display text-5xl">Diese Seite gibt es <span className="italic text-primary">nicht.</span></h1>
      <p className="mt-4 text-muted-foreground">Vielleicht hat sich ein Tippfehler eingeschlichen.</p>
      <div className="mt-8"><ArrowLink href="/" testId="link-home-404">Zur Startseite</ArrowLink></div>
    </div>
  );
}
