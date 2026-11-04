// ─────────────────────────────────────────────────────────────
//  Cloudflare Worker für die Herkunftskarte (Tag der offenen Tür, JCS)
//
//  Aufgabe: nimmt die Antworten aus dem Formular entgegen und speichert sie
//  in IServ (Nextcloud/WebDAV). Die Zugangsdaten liegen nur hier als Secrets.
//
//  Variablen (Cloudflare → Worker → Einstellungen → Variablen und Secrets):
//    NC_BASE        https://cloudfiles.senckenberg-runkel.de/remote.php/dav/files/<ID>
//    NC_USER        IServ-Benutzername für WebDAV            (Secret)
//    NC_PASS        Passwort bzw. App-Passwort                (Secret)
//    ADMIN_KEY      selbst gewählter Schlüssel für die Auswertung (Secret)
//    ALLOWED_ORIGIN https://senckenberg-schule.github.io
//    FOLDER         TdoT   (optional, Ordner in IServ)
//
//  Endpunkte:
//    POST /eintrag   Antwort aus dem Formular speichern
//    GET  /karte     nur Orte und Anzahlen für die Live-Karte (keine Freitexte)
//    GET  /export    alle Antworten, nur mit Header X-Admin-Key (?format=csv für CSV)
// ─────────────────────────────────────────────────────────────

const ORTE = {
  "runkel": ["Runkel", 8.155, 50.405], "limburg": ["Limburg", 8.067, 50.383],
  "limburg an der lahn": ["Limburg", 8.067, 50.383], "villmar": ["Villmar", 8.192, 50.391],
  "weilburg": ["Weilburg", 8.250, 50.483], "beselich": ["Beselich", 8.125, 50.458],
  "elz": ["Elz", 8.033, 50.417], "hadamar": ["Hadamar", 8.050, 50.450],
  "brechen": ["Brechen", 8.183, 50.350], "weinbach": ["Weinbach", 8.300, 50.433],
  "merenberg": ["Merenberg", 8.183, 50.517], "selters": ["Selters", 8.267, 50.350],
  "dornburg": ["Dornburg", 8.024, 50.504], "löhnberg": ["Löhnberg", 8.267, 50.517],
  "weilmünster": ["Weilmünster", 8.367, 50.433], "mengerskirchen": ["Mengerskirchen", 8.156, 50.564],
  "diez": ["Diez", 8.016, 50.371], "bad camberg": ["Bad Camberg", 8.267, 50.300],
  "hünfelden": ["Hünfelden", 8.150, 50.333]
};

const MAX_EINTRAEGE = 5000;
const UA = "JCS-TdoT-Herkunftskarte/1.0 (Schulprojekt Johann-Christian-Senckenberg-Schule Runkel)";

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get("Origin") || "";
    const erlaubt = !env.ALLOWED_ORIGIN || origin === env.ALLOWED_ORIGIN;
    const cors = {
      "Access-Control-Allow-Origin": erlaubt && origin ? origin : (env.ALLOWED_ORIGIN || "*"),
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Admin-Key",
      "Vary": "Origin"
    };
    const antwort = (daten, status = 200, extra = {}) =>
      new Response(typeof daten === "string" ? daten : JSON.stringify(daten), {
        status, headers: { "Content-Type": "application/json; charset=utf-8", ...cors, ...extra }
      });

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    const url = new URL(request.url);
    try {
      if (url.pathname === "/eintrag" && request.method === "POST") {
        if (!erlaubt) return antwort({ fehler: "Nicht erlaubt" }, 403);
        return antwort(await speichern(request, env));
      }
      if (url.pathname === "/karte" && request.method === "GET") {
        return antwort(await karte(env, ctx), 200, { "Cache-Control": "no-store" });
      }
      if (url.pathname === "/export" && request.method === "GET") {
        if (!env.ADMIN_KEY || request.headers.get("X-Admin-Key") !== env.ADMIN_KEY) {
          return antwort({ fehler: "Schlüssel fehlt oder ist falsch" }, 401);
        }
        const { daten } = await lesen(env);
        if (url.searchParams.get("format") === "csv") {
          return new Response(csv(daten.eintraege), {
            headers: { "Content-Type": "text/csv; charset=utf-8", ...cors }
          });
        }
        return antwort({ eintraege: daten.eintraege });
      }
      return antwort({ fehler: "Unbekannte Adresse" }, 404);
    } catch (e) {
      return antwort({ fehler: String(e.message || e) }, e.status || 500);
    }
  }
};

// ── Speichern ───────────────────────────────────────────────

async function speichern(request, env) {
  let roh;
  try { roh = await request.json(); } catch { throw fehler("Ungültige Daten", 400); }

  // Honeypot: echte Eltern sehen dieses Feld nicht
  if (roh.website) return { ok: true };

  const text = (v, max) => String(v || "").replace(/\s+/g, " ").trim().slice(0, max);
  const liste = (v, max) => (Array.isArray(v) ? v : []).map(x => text(x, 80)).filter(Boolean).slice(0, max);

  let ort = text(roh.ort, 60);
  if (ort.length < 2) throw fehler("Bitte einen Wohnort angeben", 400);

  const eintrag = {
    id: crypto.randomUUID(),
    zeit: new Date().toISOString(),
    ort,
    lon: null, lat: null,
    quelle: liste(roh.quelle, 10),
    quelleFrei: text(roh.quelleFrei, 200),
    interesse: liste(roh.interesse, 10),
    interesseFrei: text(roh.interesseFrei, 200)
  };

  // Daten lesen, Ort suchen, zurückschreiben. Falls jemand gleichzeitig speichert,
  // meldet IServ einen Konflikt (412) und wir versuchen es mit dem neuen Stand erneut.
  for (let versuch = 0; versuch < 8; versuch++) {
    const { daten, etag } = await lesen(env);
    if (daten.eintraege.length >= MAX_EINTRAEGE) throw fehler("Speicher voll", 507);

    const treffer = await geocode(ort, daten.geocache);
    if (treffer) { eintrag.ort = treffer[0]; eintrag.lon = treffer[1]; eintrag.lat = treffer[2]; }

    daten.eintraege.push(eintrag);
    const ok = await schreiben(env, "daten.json", JSON.stringify(daten), etag);
    if (ok) {
      // Tabelle für Excel aktualisieren (Fehler hier sind unkritisch, daten.json ist maßgeblich)
      await schreiben(env, "antworten.csv", csv(daten.eintraege), undefined).catch(() => {});
      return { ok: true, ort: eintrag.ort, gefunden: eintrag.lat !== null };
    }
    await new Promise(r => setTimeout(r, 150 + Math.random() * 400));
  }
  throw fehler("Gerade sehr viel los, bitte noch einmal senden", 503);
}

async function geocode(ort, cache) {
  const key = ort.toLowerCase();
  if (ORTE[key]) return ORTE[key];
  if (key in cache) return cache[key];

  let ergebnis = null;
  try {
    const q = new URL("https://nominatim.openstreetmap.org/search");
    q.searchParams.set("q", ort);
    q.searchParams.set("countrycodes", "de");
    q.searchParams.set("format", "jsonv2");
    q.searchParams.set("limit", "1");
    q.searchParams.set("viewbox", "7.6,50.8,8.8,50.0"); // bevorzugt die Region, schließt andere nicht aus
    q.searchParams.set("accept-language", "de");
    const r = await fetch(q, { headers: { "User-Agent": UA } });
    if (r.ok) {
      const [t] = await r.json();
      if (t) ergebnis = [t.name || ort, Math.round(+t.lon * 1e4) / 1e4, Math.round(+t.lat * 1e4) / 1e4];
    }
  } catch { /* Ort bleibt ohne Position, Eintrag wird trotzdem gespeichert */ }
  cache[key] = ergebnis;
  return ergebnis;
}

// ── Karte ───────────────────────────────────────────────────

async function karte(env, ctx) {
  // Kurzer Zwischenspeicher, damit mehrere Bildschirme IServ nicht unnötig belasten
  const cache = caches.default;
  const schluessel = new Request("https://tdot.cache/karte");
  const alt = await cache.match(schluessel);
  if (alt) return alt.json();

  const { daten } = await lesen(env);
  const orte = {};
  for (const e of daten.eintraege) {
    const k = e.ort;
    orte[k] ??= { ort: k, lon: e.lon, lat: e.lat, n: 0, zuletzt: e.zeit };
    orte[k].n++;
    if (e.zeit > orte[k].zuletzt) orte[k].zuletzt = e.zeit;
  }
  const ergebnis = {
    gesamt: daten.eintraege.length,
    orte: Object.values(orte),
    letzte: daten.eintraege.slice(-5).reverse().map(e => ({ ort: e.ort, zeit: e.zeit }))
  };
  ctx.waitUntil(cache.put(schluessel, new Response(JSON.stringify(ergebnis), {
    headers: { "Cache-Control": "max-age=4" }
  })));
  return ergebnis;
}

// ── IServ (WebDAV) ──────────────────────────────────────────

function pfad(env, datei) {
  return `${env.NC_BASE.replace(/\/$/, "")}/${env.FOLDER || "TdoT"}/${datei}`;
}
function auth(env) {
  const b = new TextEncoder().encode(`${env.NC_USER}:${env.NC_PASS}`);
  return "Basic " + btoa(String.fromCharCode(...b));
}

async function lesen(env) {
  const r = await fetch(pfad(env, "daten.json"), {
    headers: { Authorization: auth(env) }, cf: { cacheTtl: 0 }
  });
  if (r.status === 404) return { daten: { eintraege: [], geocache: {} }, etag: null };
  if (r.status === 401) throw fehler("IServ-Anmeldung fehlgeschlagen (Benutzer oder Passwort prüfen)", 502);
  if (!r.ok) throw fehler(`IServ antwortet mit ${r.status}`, 502);
  const daten = await r.json();
  daten.eintraege ??= [];
  daten.geocache ??= {};
  return { daten, etag: r.headers.get("ETag") };
}

// etag: null = Datei darf noch nicht existieren, undefined = ohne Prüfung überschreiben
async function schreiben(env, datei, inhalt, etag) {
  const headers = {
    Authorization: auth(env),
    "Content-Type": datei.endsWith(".csv") ? "text/csv; charset=utf-8" : "application/json"
  };
  if (etag === null) headers["If-None-Match"] = "*";
  else if (etag) headers["If-Match"] = etag;

  let r = await fetch(pfad(env, datei), { method: "PUT", headers, body: inhalt });
  if (r.status === 404 || r.status === 409) {
    // Ordner fehlt noch: anlegen und erneut versuchen
    await fetch(pfad(env, ""), { method: "MKCOL", headers: { Authorization: auth(env) } });
    r = await fetch(pfad(env, datei), { method: "PUT", headers, body: inhalt });
  }
  if (r.status === 412) return false;
  if (!r.ok) throw fehler(`Speichern in IServ fehlgeschlagen (${r.status})`, 502);
  return true;
}

// ── Hilfen ──────────────────────────────────────────────────

function csv(eintraege) {
  const zelle = v => {
    const s = String(v ?? "");
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const kopf = ["Zeit", "Ort", "Breitengrad", "Längengrad", "Aufmerksam geworden durch", "Aufmerksam Sonstiges", "Interessiert an", "Interesse Sonstiges"];
  const zeilen = eintraege.map(e => [
    new Date(e.zeit).toLocaleString("de-DE", { timeZone: "Europe/Berlin" }),
    e.ort, e.lat ?? "", e.lon ?? "",
    e.quelle.join(" | "), e.quelleFrei, e.interesse.join(" | "), e.interesseFrei
  ].map(zelle).join(";"));
  return "﻿" + [kopf.join(";"), ...zeilen].join("\r\n");
}

function fehler(text, status) {
  const e = new Error(text);
  e.status = status;
  return e;
}
