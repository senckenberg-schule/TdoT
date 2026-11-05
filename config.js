// ─────────────────────────────────────────────────────────────
//  Einstellungen für die Herkunftskarte (Tag der offenen Tür)
//  Nur diese Datei muss angepasst werden.
// ─────────────────────────────────────────────────────────────
window.TDOT = {

  // Adresse des Cloudflare Workers (siehe README, Schritt 2).
  // Solange hier nichts steht, laufen alle Seiten im Vorschau-Modus mit Beispieldaten.
  WORKER_URL: "https://tdot.stbauer81.workers.dev",

  // Markierung der Schule auf der Karte, Mittelpunkt der Entfernungsringe.
  // Johann-Christian-Senckenberg-Schule Villmar, Ferdinand-Dirichs-Straße 5
  // (Schulgelände laut OpenStreetMap, abgefragt am 04.11.2026)
  SCHULE: { name: "JCS Villmar", lon: 8.19197, lat: 50.39889 },

  // Orte mit geprüften Koordinaten. Gemeinden: Wikipedia-Infobox (Stand 02.11.2026).
  // Ortsteile von Villmar und Runkel: Wikipedia bzw. Wikidata, abgeglichen mit OpenStreetMap
  // (Stand 04.11.2026, Abweichung jeweils unter 300 m; Schadeck nur OpenStreetMap).
  // Alle anderen Orte sucht der Worker automatisch über OpenStreetMap.
  ORTE: {
    "Aumenau": [8.253, 50.403], "Falkenbach": [8.246, 50.436], "Langhecke": [8.281, 50.389],
    "Seelbach": [8.229, 50.416], "Weyer": [8.224, 50.368],
    "Arfurt": [8.198, 50.407], "Dehrn": [8.099, 50.420], "Ennerich": [8.128, 50.393],
    "Eschenau": [8.175, 50.436], "Hofen": [8.159, 50.426], "Schadeck": [8.158, 50.410],
    "Steeden": [8.126, 50.417], "Wirbelau": [8.223, 50.444],
    "Runkel": [8.155, 50.405], "Limburg": [8.067, 50.383], "Villmar": [8.192, 50.391],
    "Weilburg": [8.250, 50.483], "Beselich": [8.125, 50.458], "Elz": [8.033, 50.417],
    "Hadamar": [8.050, 50.450], "Brechen": [8.183, 50.350], "Weinbach": [8.300, 50.433],
    "Merenberg": [8.183, 50.517], "Selters": [8.267, 50.350], "Dornburg": [8.024, 50.504],
    "Löhnberg": [8.267, 50.517], "Weilmünster": [8.367, 50.433], "Mengerskirchen": [8.156, 50.564],
    "Diez": [8.016, 50.371], "Bad Camberg": [8.267, 50.300], "Hünfelden": [8.150, 50.333]
  },

  // Orte, die im Formular als Knöpfe erscheinen
  CHIP_ORTE: ["Villmar", "Aumenau", "Falkenbach", "Langhecke", "Seelbach", "Weyer", "Runkel", "Limburg", "Weilburg", "Beselich", "Weinbach", "Brechen", "Elz", "Hadamar", "Merenberg"],

  QUELLEN: ["Grundschule", "Freunde oder Bekannte", "Homepage", "Social Media", "Infoabend"],

  INTERESSEN: ["Schulform IGS", "Neue Lernkultur", "Ganztagsangebote", "Förderung und individuelle Unterstützung", "iPad-Konzept"],

  // Wie oft die Live-Karte nach neuen Einträgen fragt (Sekunden)
  AKTUALISIERUNG_SEKUNDEN: 8
};
