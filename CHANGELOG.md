# Changelog

All notable changes to ediurnum are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning: [Semantic Versioning](https://semver.org).
The topmost version without a date is still in development.

## [0.1.0-beta.6]

### Added

- The dashboard endpoint `/api/widget` also returns whether today's entry is written (`writtenToday`) and the
  current writing streak in days (`streak`; counts up to yesterday until today is written). DEPLOYMENT.md has a
  Homepage example.
- The journal locks itself after you leave the app – close it, switch to another app or tab, or lock the screen.
  By default after 1 minute; adjustable in the settings (1, 5 or 15 minutes, or never). This also works when the
  app was closed completely in the meantime.
- "All entries" shows every month from your first entry up to the current one, including months without entries,
  so you can fill in any day.

### Changed

- "Close journal" is now called "Lock journal".
- `lastEntry` in `/api/widget` is now the time of the latest save (ISO timestamp) instead of only the date, so
  dashboards can show the actual time. The Homepage example in DEPLOYMENT.md shows it as relative time ("2 hours ago").

- An entry whose content is completely deleted no longer counts as written (list, calendar, streak, widget). It
  stays with its version history and counts again once you write something.
- Backups now have format version 2. Older backups can still be restored; a backup from a newer ediurnum version
  is rejected with a clear message.
- The version history shows connected changes as one block (all removed words, then all new ones) instead of
  alternating word by word.
- Unlocking an entry no longer releases it for AI insights again; that only happens when you switch it on.
- Dates and numbers follow the regional format of your browser when it matches the app language (e.g. "3,3" in
  Germany, "3.3" in Switzerland, US date order in American English). Otherwise Swiss German or British English
  formats are used as before.
- Updated to SvelteKit 3, Vite 8 and TypeScript 6. Nothing changes for existing installations: `ORIGIN` works as
  before, also with an `http://` address. The container now starts with `node server.js` (only relevant if you run
  ediurnum without the Docker image).
- Unexpected errors and rejected requests are logged more precisely; expected ones (e.g. "not found") only with
  `LOG_LEVEL=debug`.
- Clearer wording during setup ("Your first step" above About me) and on the dashboard for an empty list of
  previous days.

### Security

- A PIN in the wrong format is rejected without running the key derivation.
- Passwords are limited to 1024 characters, so very large inputs are no longer run through Argon2 (also on the
  sign-in page).
- Two setups at the same moment can no longer overwrite each other; the second one gets a message.
- Resolves the advisory for the `cookie` package (not exploitable in ediurnum, as cookie names and paths are fixed).

### Fixed

- Saving an entry quickly several times in a row (auto-save, Ctrl+S, leaving the page) could in rare cases store an
  older version last.
- Invalid requests to the API return "400 Bad Request" instead of a server error.
- A recovery key with an invalid character (e.g. "O" or "0") showed an untranslated German error message.
- The reminders page showed the next weekly and monthly review by schedule alone. It now shows the day the reminder
  is actually sent, taking the minimum gap into account (e.g. in a new journal the first weekly review comes after
  about a week).
- "Open journal" after the recovery key could be reached with the keyboard before confirming that the key was saved.
- "Recent entries" shows the weekday before the day in every regional format (American English showed "8 Thu").
- The dividers in "Recent entries" on the dashboard are straight like everywhere else (their ends curved upwards).
- After restoring from a backup, "Download a backup" in "Your first steps" is ticked off.
- The log now says "PIN set" instead of "PIN changed" when a PIN is set for the first time.
- Push notifications are sent with high urgency, so iPhones show reminders on time instead of holding them back
  until the device wakes up for another reason.
- Search treats "ss" and "ß" as equal ("strasse" finds "Straße").
- Search results are refreshed when the PIN expires or you lock again, so excerpts of locked entries no longer stay
  on screen. A failed search now shows an error instead of silently keeping the old results.

## [0.1.0-beta.5] - 2026-10-10

### Added

- The version history highlights what changed compared with the previous version: added text is marked,
  removed text is struck through, unchanged fields fade into the background. Can be switched off.
- Optional endpoint `/api/widget` for dashboards: number of entries and date of the latest entry, only active when
  `WIDGET_TOKEN` is set (at least 16 characters) and requested with `Authorization: Bearer <token>`.

### Changed

- "Last saved" in an entry now shows the date as well as the time.

### Fixed

- The version history still described the old ten-minute rule instead of one version per day.

## [0.1.0-beta.4] - 2026-10-10

### Added

- "Your first steps" on the dashboard: write the first entry, fill in About me, switch on reminders, set a PIN and
  download a backup. Steps tick themselves off; the card can be hidden and shown again in the settings.
- Search in "All entries": finds words in every field (ignoring case and accents) and shows where they appear.
  Locked entries are only searched after entering the PIN.
- Legend for the calendar colours in "All entries".
- Test your recovery key in the security settings without changing anything.
- Customisable instructions for the AI in Insights, with a default that can be restored at any time.

### Changed

- "Today" now has a sun icon instead of a pencil.
- Text fields can only be resized vertically.
- Clearer mood colours, especially in light mode; entries without a mood are outlined in the calendar.
- Collapsible boxes show an arrow on the right.
- The default AI instructions no longer ask for Swiss spelling.
- The focus points of an analysis are now labelled "Your focus points".
- Version history: at most one version per day. All changes made on the same day are kept together; editing an
  entry on a later day starts a new version.

### Fixed

- Text fields and drop-downs next to each other now have the same height, so their labels line up.

## [0.1.0-beta.3] - 2026-10-09

### Added

- Ready-made Docker image on Docker Hub (`zzelav/ediurnum`, amd64 and arm64): installing no longer needs
  `git clone` – `docker-compose.yml` and `.env.example` are enough. Pin a version with `EDIURNUM_VERSION`.

### Fixed

- On iPhone, the next date of a review reminder overlapped the time field above it.
- On iPhone and other narrow screens, input fields (e.g. the three gratitude lines), long buttons and long words in
  the changelog or AI reviews no longer reach beyond the right edge.

## [0.1.0-beta.2] - 2026-10-09

### Added

- About me: a short self-assessment as your first entry (journaling experience, life satisfaction, personality
  based on the Big Five, values, strengths, goals and what the AI should know). It can be edited in the settings
  and is added to the file for an AI chat as background (can be switched off).
- Your first name when creating the journal, used in the greeting; editable in the settings.
- A hint to use a password manager (e.g. Bitwarden) when creating the journal; your first name is offered to it
  as the user name.
- "On this day": the entry from one year ago (and earlier years) on the dashboard.
- A chart of your mood in AI insights (when creating the file and for saved reviews) and under "Your focus"
  on the dashboard, from the start of the reviewed period until today.
- The eye to show or hide the input in every password and PIN field.
- More helpful container logs (start-up, opening and closing, failed attempts, backups, push, errors) and
  `LOG_LEVEL=debug` to log every request.

### Changed

- Weekly and monthly reviews are only suggested after about a week or a month without one – also for a new journal.
  The dashboard shows them like the entry does, with "Write now" and "Not today".
- The journal now also closes on the screen after the set time without activity, not only on the server.
- The settings show only the changes of the current version, with a link to the full changelog on GitHub.
- The inactivity setting is now called "Lock automatically (in minutes)".

### Security

- Deleting a PIN-locked entry now requires the PIN.

### Fixed

- Closing the journal behind a reverse proxy with HTTPS failed with "Cross-site POST form submissions are forbidden".
- Missing icons (`favicon.ico`, older Apple touch icon names) and SVG icons in push notifications.
- Time and date fields reaching beyond the screen edge on phones.

## [0.1.0-beta.1] - 2026-10-09

First public beta of ediurnum – a private, self-hosted, encrypted journal for daily reflection.

### Added

- One entry per day with guided questions (experienced, feelings, learning & growth), free thoughts and mood;
  past days open read-only and can be edited with the pencil, with a version history per entry.
- Weekly and monthly reviews suggested inside the entry, reminders for them and your own reminders,
  shown in the app and as push notifications.
- Encryption of all content with a recovery key, PIN-locked entries, encrypted backup, readable export
  and deleting the journal.
- AI insights without API keys: a Markdown file with your entries for any AI chat; the pasted answer is saved
  and its focus points for the coming weeks appear on the dashboard.
- Optional focus mode while writing, German and English, light and dark theme, installable web app,
  Docker Compose setup for self-hosting.

[0.1.0-beta.5]: https://github.com/ZZELAV/ediurnum/compare/v0.1.0-beta.4...v0.1.0-beta.5
[0.1.0-beta.4]: https://github.com/ZZELAV/ediurnum/compare/v0.1.0-beta.3...v0.1.0-beta.4
[0.1.0-beta.3]: https://github.com/ZZELAV/ediurnum/compare/v0.1.0-beta.2...v0.1.0-beta.3
[0.1.0-beta.2]: https://github.com/ZZELAV/ediurnum/compare/v0.1.0-beta.1...v0.1.0-beta.2
[0.1.0-beta.1]: https://github.com/ZZELAV/ediurnum/releases/tag/v0.1.0-beta.1
