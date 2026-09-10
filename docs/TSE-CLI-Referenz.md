# TSE-CLI-Referenz

Vollständige Befehlsreferenz für `native/tse-cli`s `tseCli`-Binary — zum
direkten Aufruf auf der Kommandozeile durch einen Administrator, außerhalb
der FairPOS-Anwendung. Ergänzt `docs/TSE-Integration.md` (dort: Architektur,
Aufrufkette aus dem Backend, Lifecycle-Konzept) um die praktische Sicht:
"welchen Befehl tippe ich wofür ein". Insbesondere gedacht für drei Fälle,
die die Admin-UI nicht abdeckt:

1. **Einmalige Hardware-Inbetriebnahme** (`setup`) — bewusst kein UI-Schritt,
   siehe Abschnitt 2.
2. **Zurücksetzen einer Entwickler-TSE** (`factoryReset`) — kein
   FairPOS-Feature, nur über die CLI erreichbar, siehe Abschnitt 2.
3. **Löschen der auf der TSE gespeicherten Rohdaten** (`deleteStoredData`) —
   von FairPOS bewusst nicht ins Backend/die Admin-UI gebaut (siehe Task
   #103), nur über die CLI erreichbar, siehe Abschnitt 2.
4. **Inhaltliche Prüfung der auf der TSE gespeicherten Vorgänge**
   (`dumpProcessData`) — reiner Testing-Helfer für den manuellen
   Regressionstest (siehe Task #47/#102), nie von FairPOS
   selbst aufgerufen, nur über die CLI erreichbar, siehe Abschnitt 2.

---

## 1. Aufruf-Konventionen

**Binary-Pfad (Produktivserver):**
```
/opt/fairpos/packages/backend/native/tse-cli/vendor/bin/tseCli
```
Lokal beim Entwickeln: `packages/backend/native/tse-cli/vendor/bin/tseCli`
(relativ zum Repo-Root, erst nach `npm run build` in diesem Verzeichnis
vorhanden — siehe `docs/Installationsanleitung.md` Abschnitt 8.1).

**Immer als Service-User ausführen** (Dateizugriffsrechte auf den
TSE-Mountpunkt/gitignorte SDK-Bibliothek):
```bash
sudo -u fairpos <binary> <mount-pfad> <befehl> [argumente...]
```

**Allgemeine Argumentform:** `<mount-pfad>` ist immer das erste Argument
(Dateisystem-Mountpunkt der TSE, z. B. `/media/fairpos/TSE_XXXX` — der Wert
aus Einstellungen → TSE → Mount-Pfad in der Admin-UI), danach der Befehlsname,
danach befehlsspezifische Argumente.

**Ausgabe:** jeder Befehl gibt genau eine Zeile JSON auf stdout aus und
setzt den Exit-Code (`0` = Erfolg, `1` = Fehler):
- Erfolg: `{"ok":true,"result":{...}}`
- Fehler: `{"ok":false,"error":{"code":<n>,"message":"<msg>"}}` — `code` ist
  entweder `-1` (falscher CLI-Aufruf, z. B. falsche Argumentanzahl) oder ein
  numerischer `WormError`-Code aus dem Swissbit-SDK (siehe Abschnitt 5).

**Sicherheitshinweis (PIN/PUK-Werte auf der Kommandozeile):** Zugangsdaten
als CLI-Argumente landen in der Prozessliste (`ps aux`) und ggf. in der
Bash-History. Für Alltagsbefehle (`maintain`) ist das unkritisch, da nur die
TimeAdmin-PIN benötigt wird — genau die eine Zugangsdaten-Art, die FairPOS
laut `docs/TSE-Integration.md` Abschnitt 7 dauerhaft speichern darf. Für
`setup` und `deleteStoredData` (Abschnitt 2 — beide brauchen die Admin-PIN
bzw. Setup-Zugangsdaten, die FairPOS nie dauerhaft speichert) gilt:
**niemals dauerhaft speichern**, Befehl direkt danach aus der Bash-History
löschen (`history -d <Zeilennummer>` oder `HISTCONTROL=ignorespace` +
führendes Leerzeichen vor dem Befehl), siehe
`docs/Rechtliche-Anforderungen.md`.

---

## 2. Von `tseCli.cpp` implementierte Befehle

Diese zehn Befehle implementiert `native/tse-cli/src/tseCli.cpp` bereits
vollständig. Sieben davon ruft das Backend im laufenden Betrieb auch selbst
auf (`packages/backend/src/tse/client.ts`) — `setup`, `deleteStoredData` und
`dumpProcessData` sind die Ausnahmen, siehe dort. Manueller Aufruf ist für
die Diagnose oder für die vier oben genannten Sonderfälle gedacht.

### `setup` — Einmalige Hardware-Inbetriebnahme

```bash
tseCli <mount-pfad> setup <client-id> <credential-seed> <admin-puk> <admin-pin> <time-admin-pin>
```
Wraps `worm_tse_needs_setup` (bricht ab, falls die TSE schon eingerichtet
ist — Absicht, kein Bug) + `worm_tse_setup_ext`. Bringt eine fabrikneue TSE
von "nicht initialisiert" in "betriebsbereit": setzt PUK/alle PINs,
registriert den Client, aktiviert den CTSS-Zugriff.

- `credential-seed` kommt **nicht** vom TSE-Hersteller direkt, sondern wird
  vom TSE-**Händler** vergeben (häufig, aber nicht garantiert,
  `SwissbitSwissbit`) — im Zweifel beim Händler nachfragen.
- `admin-puk`/`admin-pin` sind **nicht** vorgegebene Werte aus
  Herstellerunterlagen — jede TSE hat werksseitig einen ursprünglichen
  PUK/PIN, den dieser Aufruf zwingend durch neue, selbst gewählte Werte
  ersetzt. `<admin-puk>`/`<admin-pin>` sind also die vom Verein selbst
  festgelegten neuen Werte.
- **Feste Längen, von der TSE hart geprüft** (laut `WormDLL.h`
  `worm_user_deriveInitialCredentials`/`worm_user_change_puk`/
  `worm_user_change_pin`): `<admin-puk>` muss **genau 6-stellig** sein,
  `<admin-pin>` und `<time-admin-pin>` müssen **genau 5-stellig** sein —
  jeweils nur Ziffern. Eine falsche Länge lässt `setup` sofort mit
  `WORM_ERROR_TSE_INVALID_PARAMETER` (Fehlercode `4103`) fehlschlagen, noch
  bevor die TSE den Credential-Seed überhaupt zur PUK-Herleitung verwendet
  — zählt nach bisherigem Kenntnisstand daher **nicht** zu den unten
  beschriebenen drei kritischen Fehlversuchen (dafür fehlt aber eine
  Bestätigung durch den Hersteller/die SDK-Doku).

Vollständiges Praxisbeispiel: `docs/Installationsanleitung.md` Abschnitt 8.3.

> ⚠️ **Ein falscher Credential-Seed kann die TSE sperren.** `setup`
> versucht mit dem angegebenen Credential-Seed den werksseitigen PUK zu
> ändern. Ist der Credential-Seed falsch, wird daraus der falsche
> ursprüngliche PUK abgeleitet und der Änderungsversuch schlägt fehl (das
> ist derselbe `worm_user_change_puk`-Mechanismus wie bei `unblock` oben,
> siehe D-066): auf **Firmware < 2.0.0** ist die TSE nach **drei** solchen
> Fehlversuchen **dauerhaft und unwiderruflich gesperrt** — keine
> Wiederherstellung möglich. Auf **Firmware ≥ 2.0.0** löst das stattdessen
> eine exponentiell wachsende Zeitsperre aus (1s, 2s, 4s, … ohne
> Obergrenze), die bei genug Fehlversuchen ebenfalls faktisch permanent
> werden kann. In beiden Fällen: Credential-Seed vor dem ersten Aufruf
> unbedingt beim Händler verifizieren, nicht raten.

**Seit Task #131 auch über die Admin-UI erreichbar** (Button "TSE
initialisieren" in den TSE-Tools, Einstellungen → TSE) — `setupTse()` in
`tse/client.ts` ist jetzt über `POST /api/admin/tse/setup` verdrahtet, mit
serverseitiger Formatvalidierung (Client-ID-Zeichensatz/-Länge,
PUK/PIN-Länge, nur Ziffern) vor dem eigentlichen Aufruf. Die Client-ID ist
in diesem Dialog ein eigenes Feld, bewusst unabhängig von der auf der
TSE-Verbindung-Karte gespeicherten — `setup` ist genau die Aktion, die eine
**andere** Client-ID registrieren kann (zweite TSE, oder eine frische, die
noch nirgends gespeichert ist); bei Erfolg wird die eingegebene Client-ID
als neue `tse_client_id`-Einstellung übernommen. Der manuelle CLI-Aufruf
bleibt weiterhin möglich und äquivalent — z. B. wenn die Admin-UI selbst
nicht erreichbar ist.

### `maintain` — Self-Test + Zeitsynchronisation

```bash
tseCli <mount-pfad> maintain <client-id> <time-admin-pin>
```
Wraps `worm_tse_runSelfTest` + `worm_user_login(TimeAdmin)` +
`worm_tse_updateTime` + `worm_user_logout`. Auch über den Button
"Zeit synchronisieren" (Einstellungen → TSE) erreichbar — der manuelle
CLI-Aufruf ist nur nötig, wenn die Admin-UI selbst nicht erreichbar ist
(Backend down, aber die TSE soll trotzdem geprüft werden).

### `info` — Statusabfrage (rein lesend)

```bash
tseCli <mount-pfad> info
```
Kein `client-id`-Argument nötig. Liefert Self-Test-Status, verbleibende
Signaturen/Transaktionen, Zertifikatsablauf, Seriennummer,
Signaturalgorithmus/Zeitformat/Public-Key sowie (Task #120) die volle
Zertifikatskette (`worm_getLogMessageCertificate`, Base64-kodiertes PEM,
Feld `certificateChain`) für `tse.csv`s `TSE_ZERTIFIKAT_I/II` — leeres
Feld statt Fehlschlag, falls die TSE sie gerade nicht liefern kann (z. B.
Self-Test noch nicht bestanden). Zusätzlich (Task #131) das Feld
`needsSetup` (`worm_tse_needs_setup`) — ob die TSE noch die einmalige
`setup`-Inbetriebnahme braucht; ebenfalls leer/`false` statt Fehlschlag,
falls die zugrundeliegende Abfrage selbst scheitert. Entspricht dem
"TSE testen"-Button (Einstellungen → TSE → TSE-Tools).

Seit D-066 (2026-09-10) zusätzlich `pukBlockingDurationAdminSeconds`/
`pukBlockingDurationTimeAdminSeconds` (`worm_info_pukBlockingDurationAdmin`/
`...TimeAdmin`) — Sekunden, für die die jeweilige PUK aktuell gesperrt ist,
`0` falls nicht gesperrt, `null` falls (noch) nicht auslesbar (Self-Test
nicht bestanden). Auf Firmware < 2.0.0 immer `0` (dort gibt es kein
Sperrzeit-Konzept, siehe `unblock` oben). **Das sind die einzigen passiv
auslesbaren Sperr-Infos** — für den PIN-Sperrstatus oder die Anzahl
bisheriger Fehlversuche (weder PIN noch PUK) bietet die SDK kein
entsprechendes Feld; das lässt sich nur transient aus der Fehlerantwort
eines tatsächlichen Login-/Unblock-Versuchs ablesen (verbraucht dabei
selbst einen Versuch).

### `exportTar` — Rohdaten-Vollexport

```bash
tseCli <mount-pfad> exportTar <ausgabedatei>
```
Wraps `worm_export_tar`. Schreibt das komplette bisher gespeicherte
TR-03153-Log als TAR-Archiv in `<ausgabedatei>`. Seit Task #103 auch über
den Button "TSE-Rohdaten exportieren" (Einstellungen → TSE) erreichbar —
der CLI-Aufruf liefert exakt dasselbe Ergebnis. **Kein Datumsfilter
möglich** — siehe Abschnitt 6.

### `factoryReset` — Entwickler-TSE auf Werkszustand zurücksetzen

```bash
tseCli <mount-pfad> factoryReset
```
Wraps `worm_tse_factoryReset`. Setzt eine TSE komplett auf Werkszustand
zurück: TSE-Speicher geleert, PUK und alle PINs auf Werksvorgabe,
Client-Registrierung entfernt — de facto wie eine fabrikneue TSE, danach ist
wieder `setup` (siehe oben) nötig. Kein Argument außer dem Mount-Pfad.

**Nur auf Entwickler-TSEs möglich** (`worm_info_isDevelopmentFirmware`) —
das SDK dokumentiert das explizit: *"This method only works on development
TSEs and will be removed from the final product."* Auf einer echten
Produktiv-TSE schlägt der Aufruf einfach fehl (Fehler, keine Wirkung) — kein
Risiko für eine versehentliche Ausführung am falschen Gerät. **Nie von
FairPOS aufgerufen** — reines Admin-Werkzeug für Test-/Entwicklungszyklen
mit einer physischen Entwickler-TSE. Seit Task #131 auch über den Button
"Werkseinstellung (Entwickler-TSE)" in den TSE-Tools erreichbar, mit
Tipp-Bestätigung ("ZURÜCKSETZEN" eintippen) vor der Ausführung.

### `unblock` — Gesperrte Admin-/TimeAdmin-PIN entsperren

```bash
tseCli <mount-pfad> unblock <admin|timeAdmin> <puk> <neue-pin>
```
Wraps `worm_user_unblock`. Setzt die PIN des angegebenen Nutzers zurück,
sofern die aktuelle PUK bekannt ist — auf Firmware < 2.0.0 muss das immer
die Admin-PUK sein (auch für `timeAdmin`), auf Firmware ≥ 2.0.0 ist die
TimeAdmin-PUK ohnehin identisch zur Admin-PUK (beide werden gemeinsam bei
`setup` festgelegt). `<neue-pin>` muss wie bei `setup` genau 5-stellig
sein. Schlägt der Aufruf fehl (falsche PUK), liefert die JSON-Antwort
zusätzlich `remainingRetries` — laut `WormDLL.h`-Dokumentation zu
`worm_user_unblock` wird dieser Wert **nur auf Firmware < 2.0.0** bei
jedem Fehlversuch tatsächlich heruntergezählt; auf Firmware ≥ 2.0.0 steht
er bei jedem Fehlschlag fest auf `3` ("the PUK will only be blocked
temporarily") und ist damit **kein echter Zähler** — sollte in der UI
nicht als Countdown dargestellt werden (live 2026-09-10 bestätigt: Wert
blieb über mehrere Fehlversuche hinweg unverändert bei 3).

Ausgelöst durch Task #109/#131: der Hintergrund-Health-Check ruft
`maintain` automatisch auf und hätte bei einer falsch hinterlegten
TimeAdmin-PIN dieselbe PIN binnen 3 Minuten dauerhaft gesperrt — seitdem
gibt es diesen Befehl zum Entsperren, plus eine Checkbox "Automatische
Zeit-Synchronisation aktiv" (Einstellungen → TSE → TSE-Tools), die sich in
genau diesem Fall automatisch deaktiviert. Seit Task #131 auch über die
Buttons "Admin-PIN entsperren"/"TimeAdmin-PIN entsperren" in den TSE-Tools
erreichbar (PUK und neue PIN müssen dort jeweils doppelt eingegeben
werden, zur Tippfehler-Vermeidung).

### `deleteStoredData` — Gespeicherte Rohdaten löschen

```bash
tseCli <mount-pfad> deleteStoredData <admin-pin> <ausgabedatei>
```
Wraps genau den vom SDK vorgeschriebenen Ablauf (`WormDLL.h`, Abschnitt zu
`worm_export_deleteStoredData`, wörtlich zitiert): Zeit muss gesetzt sein,
**bevor** exportiert wird — sonst erzeugt das Setzen der Zeit selbst einen
neuen, nicht-exportierten Log-Eintrag, der das Löschen wieder blockiert. Der
Befehl führt daher automatisch der Reihe nach aus:
1. Als *Admin* einloggen (`<admin-pin>`).
2. Zeit setzen (`worm_tse_updateTime`).
3. Vollexport durchführen (`worm_export_tar`, geschrieben nach
   `<ausgabedatei>` — **kein** gefilterter Export, der funktioniert seit
   Firmware ≥ 2.0.0 ohnehin nicht mehr, siehe Abschnitt 6).
4. Erst danach löschen (`worm_export_deleteStoredData`).

Bricht ohne zu löschen ab, falls der Export-Schritt fehlschlägt — die
TSE-Daten bleiben dann unverändert. Löschen setzt außerdem voraus, dass
**seit dem Export keine neuen Daten** entstanden sind (keine neue
Transaktion, keine erneute Zeitsynchronisation) — sonst schlägt der Aufruf
ab.

**Braucht die Admin-PIN** — FairPOS speichert diese laut
`docs/TSE-Integration.md` Abschnitt 7 bewusst **nirgends dauerhaft**
(anders als die TimeAdmin-PIN). Sie muss aus den Swissbit-Vertragsunterlagen
des Vereins stammen und wird nur für diesen einen Aufruf eingegeben — siehe
den Sicherheitshinweis in Abschnitt 1.

**Nie von FairPOS aufgerufen** — bewusst nicht ins Backend/die Admin-UI
eingebaut (siehe Task #103, "Bewusst nicht umgesetzt": destruktiv,
mit eigenen Vorbedingungen, nur relevant, sobald der TSE-Speicher tatsächlich
eng wird). Vor dem Löschen unbedingt `<ausgabedatei>` prüfen/sichern — der
Export ist die einzige Kopie der Daten, sobald gelöscht wurde.

### `dumpProcessData` — Gespeicherte Vorgänge inhaltlich prüfen

```bash
tseCli <mount-pfad> dumpProcessData <ausgabedatei>
```
Wraps `worm_entry_iterate_first`/`worm_entry_iterate_next` +
`worm_entry_readProcessData`. Liest **jeden aktuell auf der TSE
gespeicherten Eintrag** (nicht nur exportierte) und schreibt pro Eintrag
eine Tab-getrennte Zeile nach `<ausgabedatei>`:
```
<id>	<TRANSACTION|SYSTEM_LOG_MESSAGE|SE_AUDIT_LOG_MESSAGE>	<processData-Länge>	<processData als Text>
```
`processData` ist FairPOS' eigenes DSFinV-K-Anhang-I-Klartextformat (siehe
`tse/processData.ts`, z. B. `Beleg^19.00_0.00_0_0_0.00^19.00:Bar` für einen
Kassenbeleg) — kein Envelope-/Signatur-Parsing nötig, kein Login
erforderlich.

**Steuerzeichen werden escaped** (`\r` → `\r`-Literal, `\n` → `\n`-Literal,
`\t` → `\t`-Literal): `Bestellung-V1` trennt mehrere Bestellzeilen laut
Anhang I mit einem rohen `\r` (`buildAvBestellungProcessData`) — roh
geschrieben würde ein Terminal/Pager das als "Cursor an Zeilenanfang"
interpretieren und den Zeilenanfang (`id`/Typ/Länge) optisch überschreiben,
was wie eine kaputte TSE-Aufzeichnung aussieht, obwohl die Daten auf der
TSE unversehrt sind — nur die Dump-Datei hätte es falsch dargestellt.
Gefunden und behoben 2026-09-02 beim ersten echten Testlauf.

**Zweck: prüfen, ob wirklich jede Testbuchung mit den richtigen Beträgen auf
der TSE ankam** — Task #102/#47. Ersetzt die zuvor
vorgesehene, dauerhaft eigene Testing-Helper-Idee: die Prüfung braucht
lediglich diesen einen `tseCli`-Befehl plus Diff/Grep von Hand, kein
separates Skript.

**Grenzen:** liefert nur `processData` (Beträge, Positionen), nicht die
Transaktionsnummer oder Signatur des Eintrags — ein Abgleich gegen eine
konkrete FairPOS-Rechnung läuft daher über Betrag/Reihenfolge, nicht über
eine eindeutige ID. Für die Zähler-Plausibilität (stimmt die *Anzahl* der
Vorgänge) weiterhin `info`s `startedTransactions` vorher/nachher vergleichen.
Funktioniert nur, solange die Daten noch nicht per `deleteStoredData`
gelöscht wurden — danach bleibt nur noch der raue TAR-Export (Abschnitt 1
der Übersicht in `docs/TSE-Integration.md` Abschnitt 11).

**Seit Task #131 auch über die Admin-UI erreichbar** (Button
"Process-Data-Dump" in den TSE-Tools, Einstellungen → TSE) — reines
Diagnose-/Testing-Werkzeug, FairPOS interpretiert den Inhalt selbst nicht.

### `start` / `update` / `finish` — Fiskaltransaktionen

```bash
tseCli <mount-pfad> start  <client-id> <processType> <processDataBase64>
tseCli <mount-pfad> update <client-id> <transactionNumber> <processType> <processDataBase64>
tseCli <mount-pfad> finish <client-id> <transactionNumber> <processType> <processDataBase64>
```

> ⚠️ **Nicht manuell aufrufen.** Diese drei Befehle erzeugen echte,
> unveränderliche Log-Einträge auf der TSE (KassenSichV-relevant) und
> verbrauchen eine der begrenzten Transaktionsslots/Signaturen. `start` ohne
> passendes `finish`/Storno hinterlässt eine offene Transaktion, die manuell
> wieder abgeschlossen werden muss. Hier nur der Vollständigkeit halber
> dokumentiert — für Diagnosezwecke ist `info` (rein lesend) fast immer die
> richtige Wahl.

---

## 3. Typische Diagnose-Rezepte

**"Ist die TSE überhaupt da, ist sie gesund?"**
```bash
sudo -u fairpos tseCli /media/fairpos/TSE_XXXX info
```
Prüfen: `hasPassedSelfTest`/`hasValidTime` beide `true`,
`remainingSignatures` > 0.

**"Backend meldet TSE-Fehler, was steckt dahinter?"** — denselben `info`-
Aufruf machen und den `code` im Fehlerfall gegen Abschnitt 5 abgleichen,
oder direkt den Text aus dem Systemprotokoll (Einstellungen → Monitoring →
Systemprotokoll) lesen, der enthält den Code bereits als
`<Message> (Code <n>)` (siehe D-038).

**"TSE reagiert gar nicht"** — prüfen, ob der Mountpunkt überhaupt existiert
(`lsblk`, `mount | grep <mount-pfad>`), bevor der CLI-Aufruf selbst
untersucht wird — `worm_init` schlägt sonst mit einem irreführenden Fehler
fehl, der wie ein TSE-Problem aussieht, aber nur "Pfad existiert nicht"
bedeutet.

**"Wurden bei diesem Testlauf wirklich alle Verkäufe/Bestellungen korrekt
signiert?"** (Task #47/#102) — vor dem Testlauf `info`s `startedTransactions`
notieren, nach dem Testlauf erneut abfragen und die Differenz gegen die
Anzahl der getätigten Testbuchungen prüfen, dann inhaltlich:
```bash
sudo -u fairpos tseCli /media/fairpos/TSE_XXXX dumpProcessData /tmp/dump.txt
cat /tmp/dump.txt
```
und die `processData`-Spalte jeder `TRANSACTION`-Zeile gegen die tatsächlich
getätigten Testbuchungen (Beträge, Zahlart) abgleichen — siehe Abschnitt 2.

---

## 4. Weitere SDK-Funktionen (nicht in `tseCli.cpp` eingebaut)

`native/tse-cli/src/tseCli.cpp` implementiert bewusst nur die zehn oben
genannten Befehle (siehe Datei-Kopfkommentar: "no autopilot, no LAN-TSE
support, no firmware update, no multi-client management"). Der volle
Funktionsumfang steht in `vendor/include/WormDLL/WormDLL.h` (gitignort,
proprietäres Swissbit-SDK — siehe `AGENTS.md` Lizenz-Abschnitt). Ein neuer
Befehl lässt sich nach demselben Muster wie `factoryReset`/
`deleteStoredData` ergänzen (`cmdXyz(WormContext *ctx, ...)`-Funktion +
Dispatch-Zeile in `main()`, siehe dortige Kommentare als Vorlage) und mit
`./build.sh` neu bauen.

### Decommissioning (`worm_tse_decommission`)

Deaktiviert eine TSE endgültig für den Fiskaleinsatz (z. B. bei
Außerbetriebnahme/Rückgabe). **Nicht umkehrbar außer durch einen
Factory-Reset** (Abschnitt 2, also nur bei Entwickler-TSEs möglich — auf
einer echten Produktiv-TSE ist Decommissioning endgültig). Braucht
CTSS-Zugriff, *Admin*-Login und gültige Zeit, keine offenen Transaktionen.
Kein FairPOS-Anwendungsfall bekannt und (anders als `factoryReset`/
`deleteStoredData`) nicht auf Nutzerwunsch umgesetzt — hier nur als Hinweis,
falls eine TSE tatsächlich endgültig stillgelegt werden muss.

---

## 5. Wichtige Fehlercodes

Ausschnitt aus `vendor/include/WormDLL/wormError.h` — die im FairPOS-Kontext
bisher tatsächlich aufgetretenen oder für Abschnitt 2 relevanten Codes:

| Code (dez.) | Code (hex) | Name | Bedeutung |
|---|---|---|---|
| 0 | `0x0` | `WORM_ERROR_NOERROR` | Erfolg |
| 23 | `0x17` | `WORM_ERROR_INVALID_STATE` | Aufruf passt nicht zum aktuellen TSE-Zustand (z. B. `setup` auf einer bereits eingerichteten TSE) |
| 4098 | `0x1002` | `WORM_ERROR_NO_TIME_SET` | Keine gültige Zeit gesetzt — siehe D-038-Fortsetzung |
| 4106 | `0x100a` | `WORM_ERROR_CERTIFICATE_EXPIRED` | TSE-Zertifikat abgelaufen |
| 4111 | `0x100f` | `WORM_ERROR_NOT_AUTHORIZED` | Falscher/kein Nutzer eingeloggt für diesen Aufruf |
| 4113 | `0x1011` | `WORM_ERROR_CLIENT_NOT_REGISTERED` | Client-ID nicht registriert — siehe D-038 |
| 4116 | `0x1014` | `WORM_ERROR_TSE_HAS_UNFINISHED_TRANSACTIONS` | Offene Transaktion blockiert den Aufruf (z. B. Decommissioning) |
| 4119 | `0x1017` | `WORM_ERROR_STORE_FULL` | TSE-Speicher voll — spätestens jetzt `deleteStoredData` nutzen (Abschnitt 2) |
| 4350 | `0x10fe` | `WORM_ERROR_TSE_DECOMMISSIONED` | TSE wurde stillgelegt (Abschnitt 4), keine Vorgänge mehr möglich |
| 4351 | `0x10ff` | `WORM_ERROR_TSE_NOT_INITIALIZED` | TSE noch nicht eingerichtet — `setup` fehlt |

Vollständige Liste: `vendor/include/WormDLL/wormError.h` selbst (gitignort,
nur lokal mit installiertem SDK vorhanden).

---

## 6. Warum es keinen Datumsfilter für Exporte gibt

Häufige Frage bei Abschnitt 2 (`exportTar`/`deleteStoredData`): warum lässt
sich der Export nicht auf einen Zeitraum eingrenzen? Die dafür vorgesehenen
SDK-Funktionen (`worm_export_tar_filtered_time`,
`worm_export_tar_filtered_transaction`)
sind laut `WormDLL.h` ab TSE-Firmware ≥ 2.0.0 abgeschaltet und schlagen
**immer** fehl — SDK-Zitat: *"Filtered exports can no longer be performed by
the TSE [...]. If an ERS requires a filtered export, the ERS must filter the
TAR themselves."* Es gibt nur noch Vollexport (Abschnitt 2) oder
inkrementellen Export (`worm_export_tar_incremental`, bräuchte einen
persistierten State-Token — von FairPOS nicht gebaut, siehe Task #103).
