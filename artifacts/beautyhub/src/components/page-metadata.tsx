import { useEffect } from "react";
import { useLocation } from "wouter";

const pages: Record<string, [string, string]> = {
  "/": ["Dein nächster Salon um die Ecke", "BeautyHub – der deutsche Entwicklungskatalog für Beauty und Wellness. Entdecke klar gekennzeichnete fiktive Studios, Leistungen und Preise."],
  "/salons": ["Salons entdecken", "Durchsuche den synthetischen BeautyHub-Entwicklungskatalog nach Salon, Stadt oder Kategorie."],
  "/fuer-unternehmen": ["Für Unternehmen", "Die geplante BeautyHub-Plattform für Salons und Wellnessbetriebe. Erfahre, was in den nächsten Entwicklungsstufen entsteht."],
  "/anmelden": ["Anmeldung ab Stufe 2", "BeautyHub-Konten werden in Entwicklungsstufe 2 aktiviert. Aktuell sind keine Anmeldung oder Kontoerstellung möglich."],
  "/system": ["Systemstatus und Fahrplan", "Live-Datenbankstatus, aktuelle Fähigkeiten und der zehnstufige BeautyHub-Entwicklungsfahrplan."],
};

export function PageMetadata() {
  const [location] = useLocation();
  useEffect(() => {
    const profile = location.startsWith("/salons/") ? location.slice(8).split("-").map((word) => word[0]?.toUpperCase() + word.slice(1)).join(" ") : null;
    const [name, description] = pages[location] ?? (profile
      ? [profile, `Öffentliches synthetisches Salonprofil ${profile} im BeautyHub-Entwicklungskatalog. Noch keine echten Terminbuchungen.`]
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
