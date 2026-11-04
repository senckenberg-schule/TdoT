// ─────────────────────────────────────────────────────────────
//  Einstellungen für die Herkunftskarte (Tag der offenen Tür)
//  Nur diese Datei muss angepasst werden.
// ─────────────────────────────────────────────────────────────
window.TDOT = {

  // Adresse des Cloudflare Workers (siehe README, Schritt 2).
  // Solange hier nichts steht, laufen alle Seiten im Vorschau-Modus mit Beispieldaten.
  WORKER_URL: "https://tdot.stbauer81.workers.dev",

  // Markierung der Schule auf der Karte.
  // Aktuell: Ortsmitte Runkel laut Wikipedia. Für den genauen Schulstandort
  // die Koordinaten z. B. in OpenStreetMap per Rechtsklick ablesen und hier eintragen.
  SCHULE: { name: "JCS Runkel", lon: 8.155, lat: 50.405 },

  // Orte mit geprüften Koordinaten (Wikipedia-Infobox der Gemeinde, Stand 02.11.2026).
  // Alle anderen Orte sucht der Worker automatisch über OpenStreetMap.
  ORTE: {
    "Runkel": [8.155, 50.405], "Limburg": [8.067, 50.383], "Villmar": [8.192, 50.391],
    "Weilburg": [8.250, 50.483], "Beselich": [8.125, 50.458], "Elz": [8.033, 50.417],
    "Hadamar": [8.050, 50.450], "Brechen": [8.183, 50.350], "Weinbach": [8.300, 50.433],
    "Merenberg": [8.183, 50.517], "Selters": [8.267, 50.350], "Dornburg": [8.024, 50.504],
    "Löhnberg": [8.267, 50.517], "Weilmünster": [8.367, 50.433], "Mengerskirchen": [8.156, 50.564],
    "Diez": [8.016, 50.371], "Bad Camberg": [8.267, 50.300], "Hünfelden": [8.150, 50.333]
  },

  // Orte, die im Formular als Knöpfe erscheinen
  CHIP_ORTE: ["Runkel", "Limburg", "Villmar", "Weilburg", "Beselich", "Elz", "Hadamar", "Brechen", "Weinbach", "Merenberg"],

  QUELLEN: ["Grundschule", "Freunde oder Bekannte", "Homepage", "Social Media", "Zeitung", "Infoabend"],

  INTERESSEN: ["Schulform IGS", "Neue Lernkultur", "Ganztagsangebote", "Förderung und individuelle Unterstützung", "Übergang von der Grundschule", "iPad-Konzept"],

  // Wie oft die Live-Karte nach neuen Einträgen fragt (Sekunden)
  AKTUALISIERUNG_SEKUNDEN: 8
};
