export const foundation = {
  name: "BeautyHub",
  version: "0.1.0",
  stage: 1,
  locale: "de-DE",
  currency: "EUR",
  timezone: "Europe/Berlin",
  developmentMode: true,
  bookingEnabled: false,
  authenticationEnabled: false,
  stages: [
    { number: 1, title: "Fundament", status: "in_progress", description: "Anwendung, Datenbank, API, Sicherheit und Tests." },
    { number: 2, title: "Konten & Onboarding", status: "planned", description: "Anmeldung, Rollen, Unternehmensprofile und Mandantentrennung." },
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
  configured: false,
  provider: "clerk",
  role: "guest",
  message: "Die sichere Anmeldung wird in Entwicklungsstufe 2 aktiviert. Es werden noch keine Konten erstellt.",
};
