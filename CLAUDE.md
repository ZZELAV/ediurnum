# ediurnum – Hinweise für Claude

Privates, verschlüsseltes Tagebuch. SvelteKit 2 + Svelte 5 (Runes), TypeScript, `node:sqlite`, Node ≥ 24.7.
Kommunikation mit dem Nutzer auf Deutsch (Schweizer Rechtschreibung: „ss“ statt „ß“).

## Befehle

- `npm run dev` – Entwicklungsserver (Daten in `./data`)
- `npm run check` – Typprüfung (svelte-check)
- `npm test` – Unit-Tests (`node --test`, Dateien in `tests/`)
- `npm run build` – Produktions-Build nach `build/`

## Versionierung (Pflicht bei jeder Änderung)

1. **Semantic Versioning** in `package.json`:
   - `PATCH` für Fehlerbehebungen, `MINOR` für neue Funktionen, `MAJOR` für inkompatible Änderungen
     (z. B. Änderungen am Datenbankschema ohne Migration oder am Backup-Format).
   - Beta-Phase: Vorabversionen `0.1.0-beta.N` (Tag `v0.1.0-beta.N`), die fertige Version wird `0.1.0`.
2. **CHANGELOG.md** im Format *Keep a Changelog* pflegen:
   - **Kein `[Unreleased]`-Abschnitt.** Mit der ersten Änderung nach einem Release wird die nächste Version angelegt: `## [x.y.z]` (noch ohne Datum) im CHANGELOG und dieselbe Version in `package.json`/`package-lock.json` (`npm version --no-git-tag-version x.y.z`). Die Einstellungen zeigen genau diesen Abschnitt (passend zur Version in `package.json`).
   - Jede Änderung dort in der passenden Kategorie (`Added`, `Changed`, `Fixed`, `Security`, `Removed`, `Deprecated`) eintragen – **auf Englisch** (öffentliches Repo), aus Sicht des Nutzers, kurz.
   - Beim Release: Datum ergänzen (`## [x.y.z] - JJJJ-MM-TT`), Vergleichslinks unten aktualisieren (`compare/vVORHER...vx.y.z` bzw. `releases/tag/…`), committen, Tag `vx.y.z` setzen und pushen. Der Tag löst den Workflow `.github/workflows/docker.yml` aus, der das Image `zzelav/ediurnum:<version>` und `:latest` auf Docker Hub veröffentlicht.
3. **Commits** nach *Conventional Commits* (`feat:`, `fix:`, `docs:`, `refactor:`, `chore:`, `security:`) auf Englisch, Git-Tag `vX.Y.Z` pro Release.
4. Die Version erscheint automatisch im Footer der App (`__APP_VERSION__` aus `package.json`).
5. **Vor jedem Release: Aufräumen.** Alle Dateien durchgehen (`npm run check`, `npm test`, `npm run build`, toter Code, ungenutzte Texte/Importe, veraltete Kommentare und Doku, README/DEPLOYMENT/CHANGELOG aktuell). Gefundene Fehler beheben und **mögliche Anpassungen dem Nutzer melden**, statt sie ungefragt umzubauen.
6. **Öffentliches Repo auf GitHub** (`ZZELAV/ediurnum`): README, CHANGELOG, Commits und `docs/DEPLOYMENT.md` auf Englisch; App-Texte in beiden Sprachen. Nie Testdaten, `.env` oder persönliche Daten committen.

## Architektur

- `src/lib/server/crypto.ts` – AES-256-GCM, Argon2id, Wiederherstellungsschlüssel-Format. Datensätze sind per AAD an ihre ID gebunden.
- `src/lib/server/vault.ts` – Hauptschlüssel nur im RAM pro Sitzung; PIN → Sperr-Schlüssel (HKDF aus Hauptschlüssel + PIN-Schlüssel).
- `src/lib/server/entries.ts` – ein Eintrag pro Tag; höchstens eine Version pro Kalendertag (TZ): Die erste Bearbeitung an einem neuen Tag archiviert die bisherige Fassung.
- `src/lib/server/ai/` – Prompt-Aufbau (`buildChatMarkdown` für die Markdown-Datei, `parseResponse` für zurückkopierte Antworten) und Anbieter-Adapter für KI-Agenten mit API-Schlüssel (in der Oberfläche vorerst ausgeblendet, kommt in einem späteren Release).
- `src/lib/reminders.ts` – Fälligkeit der Rückblicke (gemeinsam für App-Hinweise und Push); `src/lib/server/reminders.ts` – Zeitplan, VAPID, Geräte, Planer (läuft minütlich, gestartet in `hooks.server.ts` → `init`); `src/service-worker.ts` – nur Push, bewusst ohne Offline-Cache.
- `src/lib/profile.ts` – Selbsteinschätzung „Über mich“ (verschlüsselt in `meta.profile`, im Backup enthalten, optional in der KI-Datei). **Feld-IDs nie umbenennen.**
- `src/lib/server/log.ts` – Protokoll fürs Docker-Log (`LOG_LEVEL`); nie Inhalte, Passwörter oder Schlüssel loggen.
- `src/lib/idle.ts` – schliesst das Tagebuch im Browser nach Inaktivität (Lebenszeichen an `/api/session`).
- `src/lib/templates.ts` – geführte Fragen. **Feld-IDs nie umbenennen** (alte Antworten hängen daran).
- Checkboxen erscheinen global als Schalter (`app.css`, Abschnitt Formulare) – keine eigenen Checkbox-Stile bauen; für Ein/Aus-Optionen `role="switch"` setzen.
- Passwort- und PIN-Felder immer mit `PasswordInput.svelte` (Auge zum Anzeigen).
- Handy/iPhone: Raster immer mit `minmax(0, 1fr)` bzw. `minmax(min(100%, Xpx), 1fr)`, Felder in Flex-Zeilen mit `min-width: 0` – iOS gibt Eingabefeldern sonst eine Mindestbreite und sie ragen rechts hinaus. Nach Layout-Änderungen alle Seiten bei 320 px Breite auf `scrollWidth` prüfen.
- `Referrer-Policy` bleibt `same-origin`: Bei `no-referrer` senden Browser bei normalen Formularen `Origin: null`, SvelteKit lehnt das als Cross-Site ab.
- Rückfragen („Wirklich löschen?“) immer mit `ask()` aus `src/lib/confirm.svelte.ts`, **nie `window.confirm()`** – Browser-Dialoge werden in eingebetteten Browsern und manchen Web-Apps unterdrückt.
- `src/lib/i18n/{de,en}.ts` – alle Texte; jeder Schlüssel muss in beiden Sprachen existieren (`npm test` prüft das).

## Sicherheitsregeln

- Niemals Inhalte im Klartext in die Datenbank, in Logs oder in Fehlermeldungen schreiben.
- Klartext-Metadaten bleiben auf das Nötigste beschränkt (Datum, Zeitstempel, Flags, Abschnittsarten).
- Änderungen am Schema: neue Migration in `db.ts` (`SCHEMA_VERSION` erhöhen), nie bestehende Migrationen ändern.
- Änderungen am Backup-Format: Versionsnummer im Backup erhöhen und alte Versionen weiterhin lesen können.
