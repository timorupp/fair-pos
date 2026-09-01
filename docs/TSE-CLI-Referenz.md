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
   #103 in `TASKS.md`), nur über die CLI erreichbar, siehe Abschnitt 2.

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

Diese neun Befehle implementiert `native/tse-cli/src/tseCli.cpp` bereits
vollständig. Sieben davon ruft das Backend im laufenden Betrieb auch selbst
auf (`packages/backend/src/tse/client.ts`) — `setup` und `deleteStoredData`
sind die Ausnahmen, siehe dort. Manueller Aufruf ist für die Diagnose oder
für die drei oben genannten Sonderfälle gedacht.

### `setup` — Einmalige Hardware-Inbetriebnahme

```bash
tseCli <mount-pfad> setup <client-id> <credential-seed> <admin-puk> <admin-pin> <time-admin-pin>
```
Wraps `worm_tse_needs_setup` (bricht ab, falls die TSE schon eingerichtet
ist — Absicht, kein Bug) + `worm_tse_setup_ext`. Bringt eine fabrikneue TSE
von "nicht initialisiert" in "betriebsbereit": setzt PUK/alle PINs,
registriert den Client, aktiviert den CTSS-Zugriff. `credential-seed`/
`admin-puk`/`admin-pin` stammen aus den Swissbit-Vertragsunterlagen des
Vereins — nicht aus diesem Repo. Vollständiges Praxisbeispiel:
`docs/Installationsanleitung.md` Abschnitt 8.4.

**Einziger Befehl in dieser Liste, den FairPOS selbst nie aufruft.** Ein
`setupTse()`-Wrapper existiert zwar in `tse/client.ts`, wird aber von keiner
Route verwendet — bewusst kein Admin-UI-Schritt (siehe
`docs/TSE-Integration.md` Abschnitt 7), immer nur dieser manuelle
CLI-Aufruf bei der Erstinbetriebnahme. Muss trotzdem einmalig gemacht
werden — nur eben ausschließlich hier auf der Kommandozeile, nicht über die
Anwendung.

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
Signaturalgorithmus/Zeitformat/Public-Key. Entspricht dem
"TSE testen"-Button.

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
mit einer physischen Entwickler-TSE.

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
eingebaut (siehe `TASKS.md` Task #103, "Bewusst nicht umgesetzt": destruktiv,
mit eigenen Vorbedingungen, nur relevant, sobald der TSE-Speicher tatsächlich
eng wird). Vor dem Löschen unbedingt `<ausgabedatei>` prüfen/sichern — der
Export ist die einzige Kopie der Daten, sobald gelöscht wurde.

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
`<Message> (Code <n>)` (siehe `DANGER.md` D-038).

**"TSE reagiert gar nicht"** — prüfen, ob der Mountpunkt überhaupt existiert
(`lsblk`, `mount | grep <mount-pfad>`), bevor der CLI-Aufruf selbst
untersucht wird — `worm_init` schlägt sonst mit einem irreführenden Fehler
fehl, der wie ein TSE-Problem aussieht, aber nur "Pfad existiert nicht"
bedeutet.

---

## 4. Weitere SDK-Funktionen (nicht in `tseCli.cpp` eingebaut)

`native/tse-cli/src/tseCli.cpp` implementiert bewusst nur die neun oben
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
| 4098 | `0x1002` | `WORM_ERROR_NO_TIME_SET` | Keine gültige Zeit gesetzt — siehe `DANGER.md` D-038-Fortsetzung |
| 4106 | `0x100a` | `WORM_ERROR_CERTIFICATE_EXPIRED` | TSE-Zertifikat abgelaufen |
| 4111 | `0x100f` | `WORM_ERROR_NOT_AUTHORIZED` | Falscher/kein Nutzer eingeloggt für diesen Aufruf |
| 4113 | `0x1011` | `WORM_ERROR_CLIENT_NOT_REGISTERED` | Client-ID nicht registriert — siehe `DANGER.md` D-038 |
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
persistierten State-Token — von FairPOS nicht gebaut, siehe `TASKS.md`
Task #103).
