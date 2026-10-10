# Changelog

All notable changes to ediurnum are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning: [Semantic Versioning](https://semver.org).
The topmost version without a date is still in development.

## [0.1.0-beta.4]

### Added

- "Your first steps" on the dashboard: write the first entry, fill in About me, switch on reminders, set a PIN and
  download a backup. Steps tick themselves off; the card can be hidden and shown again in the settings.
- Search in "All entries": finds words in every field (ignoring case and accents) and shows where they appear.
  Locked entries are only searched after entering the PIN.
- Legend for the calendar colours in "All entries".
- Test your recovery key in the security settings without changing anything.
- Customisable instructions for the AI in Insights, with a default that can be restored at any time.
- A short one-time explanation the first time focus mode starts.

### Changed

- "Today" now has a sun icon instead of a pencil.
- Text fields can only be resized vertically.
- The default AI instructions no longer ask for Swiss spelling.

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

[0.1.0-beta.4]: https://github.com/ZZELAV/ediurnum/compare/v0.1.0-beta.3...HEAD
[0.1.0-beta.3]: https://github.com/ZZELAV/ediurnum/compare/v0.1.0-beta.2...v0.1.0-beta.3
[0.1.0-beta.2]: https://github.com/ZZELAV/ediurnum/compare/v0.1.0-beta.1...v0.1.0-beta.2
[0.1.0-beta.1]: https://github.com/ZZELAV/ediurnum/releases/tag/v0.1.0-beta.1
