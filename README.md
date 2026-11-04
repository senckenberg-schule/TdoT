# Herkunftskarte zum Tag der offenen Tür (JCS)

Eltern scannen einen QR-Code, geben ihren Wohnort und zwei Antworten ein. Der Ort erscheint als Pin auf einer Live-Karte im Foyer. Die Antworten landen in IServ.

| Datei | Wofür |
|---|---|
| `index.html` | Formular für die Eltern (Ziel des QR-Codes) |
| `karte.html` | Live-Karte für den großen Bildschirm |
| `auswertung.html` | Auswertung nach dem Tag, nur mit Schlüssel |
| `qr.html` | QR-Code als Plakat zum Ausdrucken |
| `config.js` | **alle Einstellungen** (Worker-Adresse, Orte, Antwortmöglichkeiten) |
| `stil.css` | Gestaltung |
| `worker/worker.js` | Code für Cloudflare (wird nicht über GitHub ausgeführt) |

Solange in `config.js` keine Worker-Adresse steht, laufen alle Seiten im Vorschau-Modus mit Beispieldaten.

## Einrichtung

### 1. Dateien zu GitHub

1. Repository `senckenberg-schule/TdoT` öffnen, **Add file → Upload files**.
2. Alle Dateien und den Ordner `worker` hineinziehen, **Commit changes**.
3. **Settings → Pages**: unter *Branch* `main` und `/ (root)` wählen, speichern.
4. Nach etwa einer Minute ist das Formular erreichbar unter
   `https://senckenberg-schule.github.io/TdoT/`

### 2. Cloudflare Worker

1. In Cloudflare **Workers & Pages → Erstellen → Worker**, Name z. B. `tdot`, bereitstellen.
2. **Code bearbeiten**, den Inhalt von `worker/worker.js` komplett einfügen, **Bereitstellen**.
3. **Einstellungen → Variablen und Secrets** anlegen:

   | Name | Typ | Wert |
   |---|---|---|
   | `NC_BASE` | Text | `https://cloudfiles.senckenberg-runkel.de/remote.php/dav/files/da65e470-cdc4-45fb-81f6-7438e75284ce` |
   | `NC_USER` | Secret | IServ-Benutzername für WebDAV (wie im Worker `nextcloud-proxy`) |
   | `NC_PASS` | Secret | zugehöriges Passwort bzw. App-Passwort |
   | `ADMIN_KEY` | Secret | selbst ausgedachter, langer Schlüssel für die Auswertung |
   | `ALLOWED_ORIGIN` | Text | `https://senckenberg-schule.github.io` |

4. Die Adresse des Workers kopieren (z. B. `https://tdot.stbauer81.workers.dev`).

### 3. Verbinden

In `config.js` bei `WORKER_URL` die Worker-Adresse eintragen und auf GitHub speichern.

### 4. Testen

1. Formular auf dem Handy öffnen und eine Testantwort abschicken.
2. In IServ muss ein Ordner `TdoT` mit `daten.json` und `antworten.csv` erscheinen.
3. `karte.html` öffnen: Der Pin ist da.
4. Vor dem Tag der offenen Tür `daten.json` und `antworten.csv` in IServ löschen. Damit startet die Karte bei null.

## Am Tag selbst

- Am Bildschirm `https://senckenberg-schule.github.io/TdoT/karte.html` öffnen und auf **Vollbild** klicken. Die Karte holt alle 8 Sekunden neue Einträge, neue Pins leuchten rot auf.
- `qr.html` ausdrucken und aufhängen. Der QR-Code steht außerdem unten links auf der Karte.

## Danach

- `auswertung.html` öffnen und den `ADMIN_KEY` eingeben, oder direkt `antworten.csv` aus IServ in Excel öffnen.

## Gut zu wissen

- Gespeichert werden nur Ort, Uhrzeit und die Antworten, keine Namen und keine IP-Adressen.
- Orte aus der Liste in `config.js` haben geprüfte Koordinaten. Alle anderen sucht der Worker über OpenStreetMap (Nominatim). Findet er einen Ort nicht, wird die Antwort trotzdem gespeichert, erscheint aber nicht als Pin.
- Die Karte nutzt den freien Kartendienst OpenFreeMap. Ist er nicht erreichbar, zeigt die Karte nach 10 Sekunden einen schlichten Hintergrund, die Pins laufen weiter.
- Der Schulstandort ist derzeit die Ortsmitte von Runkel. Für die genaue Lage die Koordinaten in `config.js` bei `SCHULE` anpassen.
