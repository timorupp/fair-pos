# FairPOS — Übersetzungswörterbuch

Dieses Dokument legt die verbindlichen Übersetzungen zwischen deutschen Fachbegriffen (UI, Dokumentation) und englischen Bezeichnern (Code, Datenbank) fest.

---

## Domänenbegriffe

| Deutsch | Englisch (Code/DB) | Anmerkung |
|---|---|---|
| Aktiv (Flag) | is_active | Boolean-Spalte; „nicht aktiv" heißt je nach Entität „archiviert" (register) oder „deaktiviert" (user) — Alternative zu einer Löschung, die per FK-RESTRICT ohnehin blockiert würde, sobald die Zeile referenziert ist |
| Artikel | article | Verkaufbares Produkt |
| Artikelgruppe | article_category | Träger des Steuersatzes. **Verbindlich „Artikelgruppe"** — nicht „Kategorie"/„Artikelkategorie" (früher uneinheitlich verwendet, 2026-08-25 vereinheitlicht) |
| Aufpreis | price_surcharge | Preiszuschlag bei Produktoption |
| Auswertung | report | Auswertungsseiten im Adminbereich |
| Bedienung | waiter | Person, die Tische bedient |
| Bedienungskasse | service_register | Kassentyp für Tischservice |
| Beleg | receipt | Allgemeiner Begriff für Bon/Rechnung |
| Benutzer | user | Systembenutzer |
| Bestellung | order | Aufgenommene Bestellung |
| Bestellbon | order_slip | An Küche/Theke gedruckter Bon |
| Bestellposition | order_item | Eine Einheit eines bestellten Artikels |
| Betrag | amount | Allgemeiner Geldbetrag |
| Bon | receipt | Gedruckter Kassenbeleg |
| Bonkasse | receipt_register | Kassentyp für Selbstabholer |
| Bondrucker | receipt_printer | Netzwerkdrucker für Bons |
| Brutto | gross | Betrag inkl. MwSt. |
| Datum | date | — |
| Drucker | printer | ESC/POS Netzwerkdrucker |
| Einlage / Wechselgeldeinlage | cash_deposit | Bargeldeinlage in die Kasse |
| Einzelpreis | unit_price | Preis je Einheit |
| Entnahme | cash_withdrawal | Bargeldentnahme aus der Kasse |
| Farbe | color | Hex-Farbwert |
| Gesamtbetrag | total_amount | — |
| Gesamtpreis | total_price | Summe einer Bestellung |
| Kassenabschluss | daily_closing | Z-Bon / täglicher Kassenabschluss |
| Kassenbon | sales_receipt | Bon für den Kunden |
| Kassenlayout | register_layout | Belegungsplan der Artikeltasten |
| Kassenlayout-Platzierung | register_layout_slot | Eine Taste im Layout-Raster |
| Kassenpersonal | cashier | Bedienpersonal an der Bonkasse |
| Kassenseriennummer | register_serial_number | Eindeutige ID der Installation |
| Kassenstand | cash_balance | Aktueller Bargeldbestand |
| Kassentyp | register_type | Bonkasse oder Bedienungskasse |
| Kasse | register | Kassensystem (Hardware + Software) |
| Kostenfrei / 100% Rabatt | free_of_charge | Buchungsart für Stornogründe |
| Menge | quantity | Stückzahl |
| Mwst. / Umsatzsteuer | tax | Mehrwertsteuer |
| Netto | net | Betrag exkl. MwSt. |
| Pfand | deposit | Pfandbetrag auf Artikel |
| Pfandrückgabe | deposit_refund | Negatives Pfand / Leergutrückgabe |
| Produktoption | product_option | Zusatzoption zu einem Artikel |
| Rechnung | invoice | Abgerechneter Beleg mit TSE-Signatur |
| Rechnungsnummer | receipt_number | Systemweit fortlaufende Belegnummer |
| Saalplan | floor_plan | Grundriss mit Tischpositionen |
| Seriennummer (TSE) | tse_serial_number | 64-stellige Hex-Seriennummer der TSE |
| Signatur | signature | Kryptographische TSE-Signatur |
| Signaturzähler | signature_counter | Fortlaufender TSE-Zähler |
| Soll-Kassenstand | expected_cash_balance | Rechnerischer Bargeldbestand |
| Standarddrucker | default_printer | Fallback-Drucker |
| Standardlayout | default_layout | Vorausgewähltes Kassenlayout |
| Startgeld | opening_float | Wechselgeld zu Beginn |
| Steuersatz | tax_rate | Prozentualer MwSt.-Satz |
| Storno | cancellation | Stornierung einer Position oder Rechnung |
| Stornogrund | cancellation_reason | Konfigurierter Grund für Stornos |
| Tagesabschluss | daily_closing | Synonym zu Kassenabschluss |
| Tastenbeschriftung | label | Pro-Platzierung-Override auf `register_layout_slot`, fällt ohne gesetzten Wert auf den Artikelnamen zurück (Task #91) |
| Tisch | dining_table | Tisch im Saalplan (`table` ist SQL-reserviert) |
| PIN | pin | Dauerhafter, vom Admin vergebener Anmelde-Code (Task #90) |
| Sitzung | session | Serverseitig verwaltete Login-Sitzung (Task #90) |
| Transaktion | transaction | TSE-Transaktion |
| Uhrzeit | time | — |
| Veranstaltung | event | Hierarchieebene, der Artikel/Kassen/Kassenlayouts/Saalplan/Rechnungen/Bestellungen zugeordnet sind; genau eine ist global aktiv (Task #95) |
| Aktive Veranstaltung | active_event_id (system_setting) / config.activeEventId | Die eine global aktive Veranstaltung; nur ein System-Administrator kann wechseln (Task #95) |
| System-Administrator | is_admin | Unbeschränkte Adminstufe (Task #94) |
| Veranstaltungs-Administrator | is_event_admin | Auf die aktive Veranstaltung beschränkte Adminstufe, unabhängig von is_admin (Task #94) |
| Systemverwaltung (Schritt) | admin_verified | Einmal pro Sitzung nötige Passwort-Bestätigung für eine der beiden Adminstufen, bevor die Administrationsoberfläche erreichbar ist (Task #90/#94) |
| Benutzername (Text-Schnappschuss) | user_name / cancelled_by_name / created_by_name | Auf order_item/daily_closing/cash_transaction/service_order/order_cancellation — Name des handelnden Benutzers zum Buchungszeitpunkt, kein Fremdschlüssel, übersteht das Löschen des Benutzers (Task #97) |
| Versteckt (Flag) | hidden | Pro-Platzierung-Flag auf `register_layout_slot` — Taste vorübergehend von Bonkasse/Bedienung ausgeblendet, ohne Position/Farbe/Beschriftung zu verlieren (Task #91) |
| Zahlung | payment | — |
| Zahlungsart | payment_method | bar / EC-Karte |

---

## Tabellennamen

| Deutsch | Englisch (DB-Tabellenname) |
|---|---|
| Artikel | article |
| Artikelgruppe | article_category |
| Benutzer | user |
| Benutzer-Kassen-Zuordnung | user_register |
| Drucker | printer |
| Veranstaltung | event |
| Saalplan-Spalte | floor_plan_column |
| Saalplan-Zeile | floor_plan_row |
| Kasse | register |
| Kassenlayout | register_layout |
| Kassenlayout-Platzierung | register_layout_slot |
| Kassenabschluss | daily_closing |
| Produktoption | product_option |
| Rechnung | invoice |
| Bestellposition | order_item |
| Druckauftrag | print_job |
| Saalplan-Tisch | dining_table |
| Sitzung | session |
| Stornogrund | cancellation_reason |
| Systemeinstellung | system_setting |

---

## Status-Werte

| Kontext | Deutsch | Englisch |
|---|---|---|
| order_item.status | Offen | open |
| order_item.status | Bezahlt | paid |
| order_item.status | Kostenfrei | free |
| order_item.status | Storniert | cancelled |
| print_job.status | Ausstehend | pending |
| print_job.status | In Druck | printing |
| print_job.status | Fertig | done |
| print_job.status | Fehlgeschlagen | failed |
| register.type | Bonkasse | receipt_register |
| register.type | Bedienungskasse | service_register |
| invoice.receipt_type | Kassenbeleg | sales_receipt |
| invoice.receipt_type | Stornierung | cancellation |
| invoice.receipt_type | Schulungsbeleg | training |
| cancellation_reason.booking_type | Storno | cancellation |
| cancellation_reason.booking_type | Kostenfrei | free_of_charge |
| invoice.payment_method | Bar | cash |
| invoice.payment_method | EC-Karte | card |
