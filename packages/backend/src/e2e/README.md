# End-to-End-Tests (Task #53)

Deterministische, skriptbasierte Tests per echtem HTTP gegen eine **echte,
laufende** FairPOS-Instanz — anders als die Unit-Tests (`npm test`) und
Integrationstests (`npm run test:integration`), die gegen eine gemockte
TSE-CLI bzw. eine testcontainers-Postgres im selben Prozess laufen. Diese
Suite fängt Deployment-Fehler ab, die die anderen beiden strukturell nicht
sehen können — z.B. ob die native Installation tatsächlich funktioniert,
nicht nur ob der Code korrekt ist.

**Kein Ersatz** für `npm test`/`npm run test:integration` — ergänzt sie, läuft
zusätzlich, typischerweise einmal nach einer frischen Installation oder nach
einem größeren Update.

## Voraussetzungen

1. Eine laufende FairPOS-Instanz (siehe `docs/Installationsanleitung.md`).
2. Ein Admin-Benutzer (`npm run db:seed -- <name> <passwort>`).
3. Umgebungsvariablen:

   | Variable | Pflicht | Beschreibung |
   |---|---|---|
   | `E2E_BASE_URL` | nein (Standard: `http://localhost:3000`) | Basis-URL der Instanz |
   | `E2E_ADMIN_NAME` | ja | Name des Admin-Benutzers aus Schritt 2 |
   | `E2E_ADMIN_PASSWORD` | ja | Sein Passwort |

## Ausführen

```bash
E2E_ADMIN_NAME=admin E2E_ADMIN_PASSWORD=... npm run test:e2e
```

## Was wird geprüft

`full-flow.e2e.test.ts` bildet den zentralen Ablauf aus
`docs/Manueller-Testplan.md` automatisiert ab:

Login → Artikel/Kasse/Kassierer anlegen → Bestellung/Kassieren (Bonkasse) →
Tagesabschluss (Z-Bon) → DSFinV-K-Export → Rechnungs-PDF-Export.

Die TSE-Signierung wird mitgeprüft, aber **nicht** als Testfehler behandelt,
wenn keine TSE konfiguriert ist — das ist ein explizit unterstützter Zustand
(siehe `docs/TSE-Integration.md` → "TSE-Ausfall"). Ist laut
`GET /api/admin/tse/status` eine TSE konfiguriert und erreichbar, verlangt
der Test eine tatsächlich erfolgreiche Signatur (`tse_warning === null`) —
das ist der einzige Fall, in dem diese Suite echte Hardware mitprüft.

## Determinismus

Jeder Lauf legt eigene, eindeutig benannte Fixtures an (Artikel, Kasse,
Kassierer-Benutzer — Name-Suffix mit Zeitstempel), damit wiederholte Läufe
gegen dieselbe Instanz sich nicht gegenseitig stören und nicht mit
tatsächlichen Vereinsdaten kollidieren. Es findet **kein automatisches
Aufräumen** statt — das ist auf einer frischen Installation vor dem ersten
echten Event unkritisch; auf einer bereits produktiven Instanz sollte diese
Suite nicht gedankenlos wiederholt laufen, da sie echte Datensätze anlegt
(Artikel, Kasse, Benutzer, Rechnung, Tagesabschluss).
