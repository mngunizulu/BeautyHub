export const foundation = {
  name: "BeautyHub",
  version: "0.2.0",
  stage: 2,
  locale: "de-DE",
  currency: "EUR",
  timezone: "Europe/Berlin",
  developmentMode: true,
  bookingEnabled: false,
  authenticationEnabled: true,
  stages: [
    { number: 1, title: "Fundament", status: "completed", description: "Anwendung, Datenbank, API, Sicherheit und Tests." },
    { number: 2, title: "Konten & Onboarding", status: "completed", description: "Anmeldung, Rollen, Unternehmensprofile und Mandantentrennung." },
    { number: 3, title: "Marktplatz", status: "planned", description: "Erweiterte Suche, öffentliche Profile und Favoriten." },
    { number: 4, title: "Buchungssystem", status: "planned", description: "Verfügbarkeit, sichere Terminbuchung und Umbuchungen." },
    { number: 5, title: "Betrieb & Kunden", status: "planned", description: "Kalender, Teamverwaltung und private Kundendaten." },
    { number: 6, title: "Zahlungen & Kasse", status: "planned", description: "Simulierte Zahlungen, Belege und Gutscheine." },
    { number: 7, title: "Warenwirtschaft", status: "planned", description: "Produkte, Lieferanten und konsistente Lagerbewegungen." },
    { number: 8, title: "Marketing & Bindung", status: "planned", description: "Nachrichten, Bewertungen und Treueprogramme." },
    { number: 9, title: "Analyse & Verwaltung", status: "planned", description: "Berichte, SaaS-Abonnements und Plattformverwaltung." },
    { number: 10, title: "Freigabevorbereitung", status: "planned", description: "Regression, Sicherheit, Barrierefreiheit und Datenschutzprüfung." },
  ],
} as const;

export const guestSession = {
  authenticated: false,
  configured: true,
  provider: "clerk",
  role: "guest",
  message: "Melde dich sicher an oder erstelle ein Konto.",
};
