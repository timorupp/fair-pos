# FairPOS — TSE-Integration: Technisches Konzept

Diese Datei beschreibt die **technische Architektur** der TSE-Anbindung (Task #4).
Sie ergänzt `Anforderungen.md` (fachliche Vorgaben, Entscheidungshistorie
Swissbit vs. fiskaltrust vs. Epson) und `Rechtliche-Anforderungen.md`
(gesetzliche Grundlagen, DSFinV-K). Diese Datei ist die **Wartbarkeits-Referenz**
für alle, die später an der TSE-Anbindung arbeiten.

**Entscheidung (siehe `Anforderungen.md` für Details):** Swissbit USB-TSE,
angesprochen über einen selbst geschriebenen, minimalen CLI-Wrapper um das
offizielle Swissbit-SDK (`WormAPI`). Kein fiskaltrust, kein Epson-Protokoll,
kein natives Node-Addon.

---

## 1. Architekturüberblick

```
┌─────────────────────────────────────────────────────────────┐
│ Node.js Backend (Fastify)                                    │
│                                                                │
│  packages/backend/src/tse/                                    │
│    ├── queue.ts        ── serialisiert alle TSE-Zugriffe      │
│    ├── client.ts       ── ruft die CLI als Subprozess auf,    │
│    │                       parst JSON-Antworten                │
│    └── types.ts        ── TS-Typen für Requests/Responses      │
│                                                                │
│           │ child_process.execFile(tseCliPath, [...args])     │
│           ▼                                                    │
│  packages/backend/native/tse-cli/                              │
│    ├── src/tseCli.cpp  ── unser CLI-Tool (eigener Code, klein) │
│    ├── build.sh        ── Build-Skript                         │
│    └── vendor/         ── GITIGNORED: Swissbit-SDK-Dateien      │
│         (Header + libWormAPI.so — siehe Abschnitt 3)           │
│                                                                │
└───────────────────────────┬────────────────────────────────────┘
                            │ liest/schreibt Mount-Pfad
                            ▼
                  Swissbit USB-TSE (als Mass-Storage gemountet)
```

Kein Netzwerk, kein Daemon, kein separater Dienst. Die CLI wird pro
TSE-Operation als Kindprozess gestartet und beendet sich sofort wieder.

---

## 2. Warum CLI-Subprozess (nicht natives Node-Addon, nicht eigener Dienst)

- **Kein natives N-API/FFI-Binding nötig** — Node.js muss keine `.so` direkt
  einbinden, das übernimmt der C++-Subprozess.
- **Kein Dienst zu warten** — kein Prozess, der dauerhaft läuft, überwacht und
  neugestartet werden müsste. Ein Subprozess pro Aufruf ist bei unserem
  Transaktionsvolumen (Vereinsfest, keine Hochlast) vernachlässigbarer Overhead
  (Prozessstart ~5–20 ms, TSE-Signierung selbst dauert typischerweise
  200–500 ms — der Subprozess-Start fällt darin nicht auf).
- **Isolation:** Ein Absturz/Hänger der TSE-Kommunikation reißt nicht den
  Backend-Prozess mit.

---

## 3. Vendoring — warum und wie

**Warum ausgelagert statt eingecheckt:** FairPOS ist ein öffentliches Repo.
Das Swissbit-SDK unterliegt einem eigenen Lizenzvertrag (*Device Driver
Distribution Agreement v1.1*), der zwar für unsere Eigenentwicklung
großzügig ist (royalty-free, perpetual), aber ohne anwaltliche Prüfung soll
kein Fremdcode/-binary in dieses Repo committet werden — auch nicht Header-
oder Beispieldateien.

**Deshalb gilt für alles unter `packages/backend/native/tse-cli/vendor/`:**
- Der gesamte Ordnerinhalt ist **gitignored** (siehe `.gitignore`-Eintrag).
- Eine Platzhalterdatei `vendor/PLACE_SDK_FILES_HERE.txt` (die **selbst
  committed** ist, weil sie nur unseren eigenen Text enthält) beschreibt exakt,
  welche Dateien aus dem Swissbit-SDK-Download dort abgelegt werden müssen und
  woher sie stammen.
- **Unser eigener CLI-Quellcode** (`src/tseCli.cpp`) wird **nicht** von
  Swissbits Beispielcode (`wormCli.cpp`) kopiert oder abgeleitet — er ist
  komplett neu geschrieben, orientiert sich nur inhaltlich (welche
  API-Funktionen in welcher Reihenfolge aufgerufen werden) an der öffentlich
  dokumentierten Funktionsweise. Das hält das rechtliche Risiko minimal, auch
  ohne anwaltliche Prüfung.
- Jede Neueinrichtung eines Entwicklungsrechners oder Produktivservers braucht
  daher **einen manuellen Schritt**: SDK herunterladen (Zugang läuft über den
  Swissbit-Vertrag/Implementierungspaket) und die in der Platzhalterdatei
  gelisteten Dateien an die vorgegebene Stelle kopieren, dann `build.sh`
  ausführen.

**Was wird vendored (siehe `vendor/PLACE_SDK_FILES_HERE.txt` für die
verbindliche, aktuelle Liste):**
- `WormDLL.h`, `WormDLL_publicTypes.h`, `wormError.h` — Header, nötig zum
  Kompilieren
- `libWormAPI.so` (Linux x64) — Laufzeitbibliothek, nötig zum Linken **und**
  zur Laufzeit (muss im `LD_LIBRARY_PATH` oder per RPATH auffindbar sein)

---

## 4. Unser CLI-Tool — Design-Prinzipien

**Minimal halten** (expliziter Wartbarkeits-Anspruch): Das Tool deckt **nur**
das ab, was FairPOS tatsächlich braucht — keine Firmware-Update-Befehle, keine
Client-Verwaltung jenseits des einen registrierten Clients, kein LAN-TSE-Pfad.
Swissbits eigenes Referenzbeispiel (`wormCli.cpp`, ~870 Zeilen) deckt deutlich
mehr ab, als wir benötigen; unser Tool bleibt bewusst kleiner.

**Befehle:**

| Befehl | Zweck | Häufigkeit |
|---|---|---|
| `setup` | Einmalige Erstinbetriebnahme der TSE (PUK/PINs setzen, Client registrieren) | einmalig, admin-getriggert |
| `maintain` | Self-Test + Zeit-Synchronisation | periodisch (z.B. alle paar Stunden, Cron-artig aus dem Backend) |
| `start <processData> <processType>` | `worm_transaction_start` | pro Kassiervorgang / Bestellung |
| `update <transactionNumber> <processData> <processType>` | `worm_transaction_update` | optional, bei mehrstufigen Vorgängen |
| `finish <transactionNumber> <processData> <processType>` | `worm_transaction_finish` | pro Kassiervorgang / Bestellung / Storno |
| `info` | TSE-Status als JSON (Self-Test-Status, verbleibende Signaturen, Zertifikatsablauf, …) | Admin-Statusanzeige, Health-Checks |
| `exportTar <file>` | Rohdaten-Export (TAR, TR-03153-konform) für Archivierung/DSFinV-K-Vorstufe | Backup-Dienst, vor Ort selten |

**Warum `start`/`update`/`finish` ohne Login funktionieren:** Laut Swissbit-API
ist für Transaktionsbefehle **kein** Admin-/TimeAdmin-Login nötig — nur der
Client muss vorher registriert sein (passiert einmalig bei `setup`). Login ist
nur für administrative Befehle nötig (in unserem Tool nur `setup`). Das hält
den heißen Pfad (Kassieren) einfach und schnell.

**JSON-Contract:** Jeder Befehl gibt auf `stdout` **ein JSON-Objekt** zurück:
- Erfolg: `{ "ok": true, "result": { ... } }`
- Fehler: `{ "ok": false, "error": { "code": "<WORM_ERROR_...>", "message": "..." } }`

Exit-Code `0` bei Erfolg, `1` bei Fehler — das Node-seitige `client.ts` kann sich
darauf verlassen, ohne den Klartext-Output der Swissbit-Beispielimplementierung
parsen zu müssen (die ursprüngliche `wormCli.cpp` gibt für Transaktionen
Klartext aus — unser Tool tut das bewusst nicht, sondern immer JSON).

---

## 5. Concurrency-Modell

**Hardware-Fakt (aus `WormDLL.h`, wörtlich):** „The Swissbit TSE hardware can
not be operated from multiple threads or processes at the same time, as it
allows only one command to be active at any given time and rejects all further
commands."

**Konsequenz:** `packages/backend/src/tse/queue.ts` serialisiert **alle**
Aufrufe an die TSE-CLI durch eine einfache Promise-Kette (kein externer
Lock-Service nötig, weil unser Backend der einzige Prozess ist, der die TSE
anspricht). Muster ist identisch zur bestehenden atomaren Belegnummer-Vergabe
(`receipt/sequence.ts`) — ein Request wird erst gestartet, wenn der vorherige
abgeschlossen ist.

```ts
// Konzeptionell (siehe queue.ts für die tatsächliche Implementierung):
let chain: Promise<unknown> = Promise.resolve();
function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const result = chain.then(fn, fn);
  chain = result.catch(() => {});
  return result;
}
```

---

## 6. Lifecycle im Betrieb

1. **Einmalig bei Erstinbetriebnahme:** Admin löst über die Systemeinstellungen
   `setup` aus. Erzeugt PUK/PINs (nicht im Code hinterlegt — siehe Abschnitt 7),
   registriert den Client, TSE ist danach transaktionsbereit.
2. **Periodisch (Hintergrundjob im Backend, z.B. alle 4h):** `maintain` läuft
   automatisch — Self-Test + Zeit-Sync. Kein Einfluss auf den Kassiervorgang,
   läuft unabhängig.
3. **Pro fiskalisch relevantem Vorgang:** `start` → (optional `update`) →
   `finish`, jeweils mit dem passenden `processType` je nach Vorgang (siehe
   `Anforderungen.md` → „Zu signierende Vorgänge in FairPOS" für die Zuordnung
   Kassenbeleg-V1 / AVBestellung / AVSonstige).

---

## 7. Zugangsdaten (PUK/PINs) — Sicherheitsanforderung

Gemäß der gesetzlichen Vorgabe (siehe Epson-Developer-Guide, Abschnitt „PIN and
PUK Handling", inhaltlich identisch für Swissbit): **Admin-PIN/PUK dürfen
NICHT im Quellcode oder in Konfigurationsdateien des Kassensystems gespeichert
werden** — das sind Zugangsdaten des Betreibers, nicht des Software-Herstellers.

- `setup` fragt PUK/PIN interaktiv ab (oder liest sie aus einer Umgebungsvariable,
  die nur zum Zeitpunkt der Einrichtung gesetzt wird, nie dauerhaft im Repo/ENV).
- Der **TimeAdmin-PIN** darf laut Vorgabe dauerhaft im System gespeichert werden
  (wird für automatisierte Zeit-Sync benötigt) — das ist die einzige Ausnahme.
- Admin-PIN wird **nicht** dauerhaft gespeichert — administrative Vorgänge
  (erneutes Setup, Dekommissionierung) verlangen erneute manuelle Eingabe.

**Umgesetzt (August 2026):** Mount-Pfad, Client-ID und TimeAdmin-PIN sind über
Systemeinstellungen → System konfigurierbar, gespeichert als `tse_mount_point` /
`tse_client_id` / `tse_time_admin_pin` in `system_setting` (gleiche Tabelle wie
`server_address`/`backup_directory`). `tse/settings.ts` spiegelt Mount-Pfad und
Client-ID beim Start und nach jedem Speichern synchron in `config` (siehe
config.ts), damit der heiße Kassierpfad weiterhin ohne DB-Zugriff auskommt.
Admin-PIN/PUK/Credential-Seed werden bewusst NICHT über die UI abgefragt — die
einmalige Hardware-Inbetriebnahme (`setup`) ist nicht Teil dieser UI-Iteration.
Ein "TSE testen"-Button ruft `GET /api/admin/tse/status` auf, der live `info`
aufruft und Self-Test-Status, Restsignaturen, Zertifikatsablauf usw. anzeigt.

---

## 8. Fehlerbehandlung

Alle `WORM_ERROR_*`-Codes aus `wormError.h` werden 1:1 als String im
JSON-Fehlerobjekt zurückgegeben (kein eigenes Mapping nötig — reduziert Code).
Das Node-seitige `client.ts` kennt nur die für den Betrieb relevanten Fälle
explizit (z.B. `WORM_ERROR_CERTIFICATE_EXPIRED`, `WORM_ERROR_STORE_FULL_INTERNAL`)
und wirft ansonsten einen generischen Fehler mit dem Rohcode für die Logs.

### 8.1 TSE-Ausfall — verbindliches Muster für JEDEN Aufrufer (August 2026)

**Rechtsgrundlage** (verbatim geprüft, siehe `Rechtliche-Anforderungen.md`
Abschnitt 3.3 für die vollständigen Zitate): AEAO zu § 146a AO, Nr. 1.14.
Kernaussage — Weiterbetrieb ohne funktionsfähige TSE ist ausdrücklich
zulässig ("nicht beanstandet"), solange nur die TSE (nicht das gesamte
System) betroffen ist. Es besteht **keine** Pflicht, Vorgänge während eines
Ausfalls zu puffern und später in die TSE nachzutragen — das wäre mit der
TSE-Architektur (Live-Signatur mit TSE-eigenem Zeitstempel) auch technisch
nicht sinnvoll möglich.

**Verbindliche Regel für jede Stelle, die `tse/client.ts` aufruft** (aktuell
`routes/register-session.ts` Bonkasse-Checkout; künftig auch die
Bedienungskasse-Flows aus Task #41):

1. **Niemals blockieren.** Jeder Aufruf von `startTransaction`/
   `finishTransaction`/etc. steht in einem `try/catch`. Ein Fehler (TSE
   unerreichbar, Timeout, `TseError`) darf den zugrunde liegenden
   Geschäftsvorgang (Kassieren, Bestellung aufnehmen, Storno) **nicht**
   abbrechen — kein `503`, kein Rollback der DB-Transaktion deswegen.
2. **Ohne Signatur weiterbuchen.** Bei einem Fehler bleiben die `tse_*`-Spalten
   `null` — exakt wie im (Dev/Test-)Fall einer fehlenden Konfiguration. Aus
   Compliance-Sicht sind beide Fälle gleich zu behandeln: keine Signatur ist
   keine Signatur, unabhängig vom Grund.
3. **Keine zusätzliche Beleg-Markierung nötig.** Die fehlende
   Transaktionsnummer auf dem Bon ist laut Nr. 1.14.2 bereits eine zulässige
   Kennzeichnung — die Renderer (`escpos-receipt.ts`, `pdf.ts`) drucken die
   Zeile ohnehin nur `if (d.tseTransactionNumber !== null)`. Datum/Uhrzeit
   auf dem Bon kommen so oder so vom Kassensystem, nicht von der TSE
   (`invoice.created_at`, nicht `tse_start_time`).
4. **Immer eine Warnung zurückgeben — auch bei fehlender Konfiguration.**
   Jeder Endpunkt, der eine TSE-Signierung versucht (oder mangels
   Konfiguration übersprungen hat), gibt ein `tse_warning: string | null`
   Feld in der Response zurück (Vorbild: das bestehende
   `slip_printer_missing`-Muster). `null` nur, wenn tatsächlich signiert
   wurde. Das macht JEDEN unsignierten Verkauf im UI sichtbar, damit die
   Ursache "unverzüglich" (Nr. 1.14.4) behoben werden kann — unabhängig
   davon, ob es ein echter Ausfall oder schlicht keine konfigurierte TSE ist.
5. **Fehler loggen, nicht schlucken.** `req.log.error({ err }, '...')` (oder
   äquivalent) beim Catch, damit ein Ausfallmuster im Server-Log
   nachvollziehbar bleibt — das ist zugleich ein einfacher Anfang für die in
   Nr. 1.14.1 geforderte Ausfall-Dokumentation (Zeit + Grund), auch wenn ein
   dediziertes Ausfall-Log (Start-/Ende-Zeitpunkt, automatisiert) noch nicht
   gebaut ist (siehe „Nicht in diesem Dokument" unten).

Referenzimplementierung: `routes/register-session.ts` (Bonkasse-Checkout,
Task #40) — TSE-Signierung läuft vor der DB-Transaktion, ein Fehlschlag
setzt nur `tseWarning`, die Rechnung wird trotzdem angelegt. Tests:
`register-session.integration.test.ts` → Describe-Block „TSE-Signierung".

**Noch offen (nicht Teil dieses Musters, für eine spätere Iteration):** ein
automatisiertes Ausfall-Log (Start-/Ende-Zeitstempel + Grund als eigene
Tabelle, befüllt an einer zentralen Stelle statt pro Aufrufer) für eine
vollständige, maschinenlesbare Umsetzung von Nr. 1.14.1. Aktuell erfüllt das
Server-Log (Punkt 5) die Dokumentationspflicht manuell/lesbar, aber nicht
strukturiert abfragbar.

---

## 9. Testen ohne echte Hardware

Integrationstests gegen eine echte TSE sind in CI nicht möglich (Hardware
nötig). Stattdessen:
- **Unit-Tests für `queue.ts` und `client.ts`** mocken den Subprozess-Aufruf
  (z.B. über einen Test-Stub, der anstelle der echten Binary ein Shell-Skript
  mit vordefinierten JSON-Antworten aufruft).
- **Kein Test führt echte TSE-Operationen aus** — das reine Vorhandensein der
  Binary (`vendor/`) ist in CI nicht gegeben (gitignored, muss lokal vom
  Entwickler bereitgestellt werden) und wird auch nicht erwartet.
- Manuelles Testen gegen die echte TSE bleibt manuell/vor Ort.

**Stand August 2026:** Echte Hardware-Tests sind bisher nicht möglich — die
Entwicklungsumgebung läuft unter WSL2, das USB-Geräte nicht ohne `usbipd-win`
(Windows-Host-Aktion) durchreicht. Das Team plant den Wechsel auf ein natives
Ubuntu-System für Hardware-Tests; die Swissbit Developer-USB-TSE dafür ist
bereits bestellt. Bis dahin bleibt die Abdeckung auf die Stub-basierten
Unit-Tests beschränkt.

---

## 10. Build

`packages/backend/native/tse-cli/build.sh` kompiliert `src/tseCli.cpp` gegen
die vendorten Header/Library und legt die Binary unter
`native/tse-cli/vendor/bin/tseCli` ab (ebenfalls gitignored — Build-Artefakt).
Das Backend (`tse/client.ts`) erwartet die Binary dort; ein fehlender Build
führt zu einer klaren Fehlermeldung beim ersten TSE-Aufruf, nicht zu einem
stillen Fallback.

Voraussetzung zum Bauen: g++ mit C++11-Unterstützung, sonst keine externen
Build-Abhängigkeiten (kein CMake nötig für unser schlankes Tool, anders als
Swissbits Beispiel).

---

## 11. Nicht in diesem Dokument

- DSFinV-K-Formatierung (Task #13) — eigenes Thema, nutzt aber den `exportTar`-
  Rohdaten-Export dieses Moduls als Datenquelle.
- Fachliche Zuordnung, welcher Vorgang welchen `processType` bekommt — siehe
  `Anforderungen.md`.
- Backup/Archivierungsstrategie der Export-Daten — siehe Task #25.
