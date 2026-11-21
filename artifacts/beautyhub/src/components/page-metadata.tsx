import { useEffect } from "react";
import { useLocation } from "wouter";

const pages: Record<string, [string, string]> = {
  "/": ["Dein nächster Salon um die Ecke", "BeautyHub – Beauty- und Wellnessbetriebe in Deutschland mit klaren Leistungen, Preisen und Öffnungszeiten."],
  "/salons": ["Salons entdecken", "Durchsuche BeautyHub nach Salon, Stadt oder Kategorie."],
  "/fuer-unternehmen": ["Für Unternehmen", "Betrieb auf BeautyHub registrieren, Schritt für Schritt einrichten und veröffentlichen."],
  "/sign-in": ["Anmelden", "Bei BeautyHub anmelden."],
  "/sign-up": ["Registrieren", "Ein BeautyHub-Konto anlegen."],
  "/konto": ["Mein Konto", "Profil, Einstellungen und Daten deines BeautyHub-Kontos."],
  "/unternehmen": ["Meine Betriebe", "Betriebe verwalten und neue anlegen."],
  "/einladung": ["Einladung annehmen", "Einladung in ein BeautyHub-Team annehmen."],
  "/system": ["Systemstatus und Fahrplan", "Live-Datenbankstatus, aktuelle Fähigkeiten und der zehnstufige BeautyHub-Entwicklungsfahrplan."],
};

export function PageMetadata() {
  const [location] = useLocation();
  useEffect(() => {
    const profile = location.startsWith("/salons/") ? location.slice(8).split("-").map((word) => word[0]?.toUpperCase() + word.slice(1)).join(" ") : null;
    const key = location.startsWith("/sign-in") ? "/sign-in" : location.startsWith("/sign-up") ? "/sign-up" : location.startsWith("/unternehmen/") ? "/unternehmen" : location;
    const [name, description] = pages[key] ?? (profile
      ? [profile, `Salonprofil ${profile} auf BeautyHub mit Leistungen, Preisen und Öffnungszeiten.`]
      : ["Seite nicht gefunden", "Diese BeautyHub-Seite ist nicht verfügbar."]);
    const title = `${name} | BeautyHub`;
    document.title = title;
    for (const [attribute, key, content] of [
      ["name", "description", description],
      ["property", "og:title", title],
      ["property", "og:description", description],
      ["property", "og:type", "website"],
      ["property", "og:locale", "de_DE"],
    ]) {
      let meta = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
      if (!meta) {
        meta = document.createElement("meta");
        meta.setAttribute(attribute!, key!);
        document.head.appendChild(meta);
      }
      meta.content = content!;
    }
  }, [location]);
  return null;
}
