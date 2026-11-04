// ─────────────────────────────────────────────────────────────
//  Cloudflare Worker für die Herkunftskarte (Tag der offenen Tür, JCS)
//
//  Aufgabe: nimmt die Antworten aus dem Formular entgegen und speichert sie
//  in IServ (Nextcloud/WebDAV). Die Zugangsdaten liegen nur hier als Secrets.
//
//  Speicherprinzip (hält auch viele gleichzeitige Antworten aus):
//    TdoT/eintraege/<zeit>_<id>.json   jede Antwort als eigene Datei (maßgeblich)
//    TdoT/daten.json                   Übersicht, wird laufend aus den Einzeldateien ergänzt
//    TdoT/antworten.csv                Tabelle für Excel, wird mit der Übersicht aktualisiert
//
//  Variablen (Cloudflare → Worker → Einstellungen → Variablen und Secrets):
//    NC_BASE        https://cloudfiles.senckenberg-runkel.de/remote.php/dav/files/<ID>
//    NC_USER        Benutzername für WebDAV (Secret)
//    NC_PASS        App-Passwort (Secret)
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
  "hünfelden": ["Hünfelden", 8.150, 50.333],
  // Ortsteile von Villmar und Runkel (Wikipedia/Wikidata, abgeglichen mit OpenStreetMap)
  "aumenau": ["Aumenau", 8.253, 50.403], "falkenbach": ["Falkenbach", 8.246, 50.436],
  "langhecke": ["Langhecke", 8.281, 50.389], "seelbach": ["Seelbach", 8.229, 50.416],
  "weyer": ["Weyer", 8.224, 50.368], "arfurt": ["Arfurt", 8.198, 50.407],
  "dehrn": ["Dehrn", 8.099, 50.420], "ennerich": ["Ennerich", 8.128, 50.393],
  "eschenau": ["Eschenau", 8.175, 50.436], "hofen": ["Hofen", 8.159, 50.426],
  "schadeck": ["Schadeck", 8.158, 50.410], "steeden": ["Steeden", 8.126, 50.417],
  "wirbelau": ["Wirbelau", 8.223, 50.444]
};

const UA = "JCS-TdoT-Herkunftskarte/1.0 (Schulprojekt Johann-Christian-Senckenberg-Schule Runkel)";
const NACHLADEN_MAX = 40;   // so viele neue Einzeldateien pro Abruf übernehmen (Cloudflare erlaubt 50 Anfragen)

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
        const { daten, vollstaendig } = await aktuell(env, ctx);
        if (url.searchParams.get("format") === "csv") {
          return new Response(csv(daten.eintraege), { headers: { "Content-Type": "text/csv; charset=utf-8", ...cors } });
        }
        return antwort({ eintraege: daten.eintraege, vollstaendig });
      }
      return antwort({ fehler: "Unbekannte Adresse" }, 404);
    } catch (e) {
      return antwort({ fehler: String(e.message || e) }, e.status || 500);
    }
  }
};

// ── Speichern: eine Datei pro Antwort, dadurch keine Konflikte ──

async function speichern(request, env) {
  let roh;
  try { roh = await request.json(); } catch { throw fehler("Ungültige Daten", 400); }
  if (roh.website) return { ok: true };   // Honeypot: echte Eltern sehen dieses Feld nicht

  const text = (v, max) => String(v || "").replace(/\s+/g, " ").trim().slice(0, max);
  const liste = (v, max) => (Array.isArray(v) ? v : []).map(x => text(x, 80)).filter(Boolean).slice(0, max);

  const ort = text(roh.ort, 60);
  if (ort.length < 2) throw fehler("Bitte einen Wohnort angeben", 400);

  const eintrag = {
    id: crypto.randomUUID(),
    zeit: new Date().toISOString(),
    ort, lon: null, lat: null,
    quelle: liste(roh.quelle, 10),
    quelleFrei: text(roh.quelleFrei, 200),
    interesse: liste(roh.interesse, 10),
    interesseFrei: text(roh.interesseFrei, 200)
  };

  const treffer = await geocode(ort, env);
  if (treffer) [eintrag.ort, eintrag.lon, eintrag.lat] = treffer;

  const name = `${eintrag.zeit.replace(/[:.]/g, "-")}_${eintrag.id.slice(0, 8)}.json`;
  await schreiben(env, "eintraege/" + name, JSON.stringify(eintrag));
  return { ok: true, ort: eintrag.ort, gefunden: eintrag.lat !== null };
}

// Ortssuche: erst feste Liste, dann Zwischenspeicher, dann OpenStreetMap (Nominatim)
const geoCache = new Map();
async function geocode(ort, env) {
  const key = ort.toLowerCase();
  if (ORTE[key]) return ORTE[key];
  if (geoCache.has(key)) return geoCache.get(key);

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
  } catch { /* Ort bleibt ohne Position, Antwort wird trotzdem gespeichert */ }
  geoCache.set(key, ergebnis);
  return ergebnis;
}

// ── Übersicht aktuell halten ────────────────────────────────

// Liest daten.json, holt neue Einzeldateien dazu und schreibt die Übersicht zurück.
// Mehrere Bildschirme dürfen das gleichzeitig tun: Grundlage sind immer die Einzeldateien,
// eine überschriebene Übersicht ergänzt sich beim nächsten Abruf von selbst.
async function aktuell(env, ctx) {
  const daten = await lesen(env);
  const liste = await dateiliste(env);
  const bekannt = new Set(daten.eintraege.map(e => e.datei));
  const neu = liste.filter(n => !bekannt.has(n));
  const jetzt = neu.slice(0, NACHLADEN_MAX);

  const geladen = await Promise.all(jetzt.map(async n => {
    const r = await fetch(pfad(env, "eintraege/" + encodeURIComponent(n)), { headers: { Authorization: auth(env) } });
    return r.ok ? { ...(await r.json()), datei: n } : null;
  }));
  const dazu = geladen.filter(Boolean);
  if (dazu.length) {
    daten.eintraege = [...daten.eintraege, ...dazu].sort((a, b) => a.zeit.localeCompare(b.zeit));
    ctx.waitUntil(Promise.all([
      schreiben(env, "daten.json", JSON.stringify(daten)),
      schreiben(env, "antworten.csv", csv(daten.eintraege))
    ]).catch(() => {}));
  }
  return { daten, vollstaendig: neu.length <= NACHLADEN_MAX };
}

async function karte(env, ctx) {
  // Kurzer Zwischenspeicher, damit mehrere Bildschirme IServ nicht unnötig belasten
  const cache = caches.default;
  const schluessel = new Request("https://tdot.cache/karte");
  const alt = await cache.match(schluessel);
  if (alt) return alt.json();

  const { daten } = await aktuell(env, ctx);
  const orte = {};
  for (const e of daten.eintraege) {
    orte[e.ort] ??= { ort: e.ort, lon: e.lon, lat: e.lat, n: 0 };
    orte[e.ort].n++;
  }
  const ergebnis = {
    gesamt: daten.eintraege.length,
    orte: Object.values(orte),
    letzte: daten.eintraege.slice(-5).reverse().map(e => ({ ort: e.ort, zeit: e.zeit }))
  };
  ctx.waitUntil(cache.put(schluessel, new Response(JSON.stringify(ergebnis), { headers: { "Cache-Control": "max-age=4" } })));
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
function pruefe(r) {
  if (r.status === 401) throw fehler("IServ-Anmeldung fehlgeschlagen (Benutzer oder Passwort prüfen)", 502);
}

async function lesen(env) {
  // Zufälliger Zusatz an der Adresse, damit kein Zwischenspeicher eine alte Fassung liefert
  const r = await fetch(pfad(env, "daten.json") + "?frisch=" + Date.now() + Math.random().toString(36).slice(2), {
    headers: { Authorization: auth(env), "Cache-Control": "no-cache", Pragma: "no-cache" }
  });
  pruefe(r);
  if (r.status === 404) return { eintraege: [] };
  if (!r.ok) throw fehler(`IServ antwortet mit ${r.status}`, 502);
  const daten = await r.json();
  daten.eintraege = (daten.eintraege || []).filter(e => e.datei);
  return daten;
}

async function dateiliste(env) {
  const r = await fetch(pfad(env, "eintraege/"), {
    method: "PROPFIND",
    headers: { Authorization: auth(env), Depth: "1", "Content-Type": "application/xml" },
    body: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/></d:prop></d:propfind>'
  });
  pruefe(r);
  if (r.status === 404) return [];
  if (!r.ok) throw fehler(`IServ antwortet mit ${r.status}`, 502);
  return [...(await r.text()).matchAll(/<(?:\w+:)?href>([^<]+\.json)<\/(?:\w+:)?href>/g)]
    .map(m => decodeURIComponent(m[1].split("/").pop()));
}

async function schreiben(env, datei, inhalt) {
  const headers = {
    Authorization: auth(env),
    "Content-Type": datei.endsWith(".csv") ? "text/csv; charset=utf-8" : "application/json"
  };
  let r = await fetch(pfad(env, datei), { method: "PUT", headers, body: inhalt });
  if (r.status === 404 || r.status === 409) {
    // Ordner fehlt noch: anlegen und erneut versuchen
    await fetch(pfad(env, ""), { method: "MKCOL", headers: { Authorization: auth(env) } });
    if (datei.includes("/")) {
      await fetch(pfad(env, datei.slice(0, datei.lastIndexOf("/") + 1)), { method: "MKCOL", headers: { Authorization: auth(env) } });
    }
    r = await fetch(pfad(env, datei), { method: "PUT", headers, body: inhalt });
  }
  pruefe(r);
  if (!r.ok) throw fehler(`Speichern in IServ fehlgeschlagen (${r.status})`, 502);
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
