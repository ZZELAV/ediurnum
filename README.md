# ediurnum

*diurnum* (Latin for “diary”) + *e* for digital: a private, self-hosted, encrypted journal for daily reflection –
with optional AI feedback for personal growth.

> **Status: beta.** ediurnum is usable, but expect changes. Keep encrypted backups.

## Features

- **One entry per day, 5–10 minutes**, with guided questions
  - **Experienced** (daily): gratitude, what happened, best moment, insight
  - **Feelings** (about weekly): energy, emotions, what gives and drains energy
  - **Learning & growth** (about monthly): what you learned, what you’re proud of, your next focus
  - **Free thoughts** and a mood scale in every entry
  - Weekly and monthly reviews are suggested once about a week or a month has passed without one – in the entry
    and on the dashboard (“Write it now” / “Not today”)
- **Your first steps** on the dashboard: a short checklist (first entry, About me, reminders, PIN, backup) that
  ticks itself off
- **About me**: a short self-assessment as your first entry (journaling experience, life satisfaction, personality
  based on the Big Five, values, strengths, goals) – the background for AI insights, editable any time
- **On this day**: the entry from one year ago appears on the dashboard
- **Past days open read-only** – edit them with “Edit”; every entry keeps a **version history** (one version per day,
  with changes highlighted)
- **Search** all entries from “All entries” (ignores case and accents); the calendar shows your mood per day
- **Statistics**: current and longest writing streak, mood and energy per month, mood per weekday, your most frequent
  feelings and how many weekly and monthly reviews you wrote – for 30 or 90 days, 12 months or everything
- **Reminders**: weekly and monthly reviews plus your own reminders (once, daily, on chosen weekdays or monthly),
  shown in the app and as **push notifications** on registered devices
- **Optional focus mode**: while you write, navigation and side column fade out; press Esc to return
- **All content encrypted at rest**, with a recovery key shown once at setup (and testable in the settings); the journal locks itself after a set
  time without activity
- **Locked entries** with an additional PIN
- **AI insights without API keys**: ediurnum turns the entries of a period into a Markdown file for the AI chat of your
  choice (ChatGPT, Claude, Gemini, …), optionally with your self-assessment. The instructions for the AI can be customised. Paste the answer back to keep it – its
  focus points for the coming weeks and a chart of your mood appear on the dashboard. ediurnum never sends anything
  to an AI on its own; AI agents with your own API key are planned for a later release.
- **Encrypted backup**, readable export (Markdown/JSON) and **delete journal** (all entries, or a complete reset)
- German and English, light and dark theme (follows your device unless you choose one), installable as a web app

## Security at a glance

| What | How |
|---|---|
| Entries, settings, self-assessment, AI reviews | AES-256-GCM with a random 256-bit master key |
| Master key | stored encrypted with your password (Argon2id, 64 MiB); decrypted only in memory during a session |
| Recovery key | is the master key itself (56 characters incl. checksum); shown only once |
| Locked entries | additionally encrypted with a key derived from master key + PIN |
| Plaintext on disk | only dates, timestamps, lock/AI flags and which sections an entry contains |

> **Without your password and without the recovery key, your data is lost.** This is by design.
>
> The Markdown file for an AI chat contains the selected entries in plaintext – only share it with an AI service you
> trust. Locked entries are only included if they are allowed for AI and the PIN has been entered.
>
> To send reminders while the journal is closed, the server keeps the reminder schedule, the titles and texts of your
> own reminders and the push addresses of your devices unencrypted. Notifications never contain journal content and are
> delivered through your browser’s push service (Google, Apple, Mozilla).

## Running ediurnum

ediurnum runs as a single Docker container behind a reverse proxy that provides HTTPS
(for example NGINX Proxy Manager).

The image is on Docker Hub: [`zzelav/ediurnum`](https://hub.docker.com/r/zzelav/ediurnum) (amd64, arm64).

```bash
mkdir ediurnum && cd ediurnum
curl -fsSLO https://raw.githubusercontent.com/ZZELAV/ediurnum/main/docker-compose.yml
curl -fsSLO https://raw.githubusercontent.com/ZZELAV/ediurnum/main/.env.example
cp .env.example .env            # set ORIGIN to your public https address
mkdir -p data && sudo chown 1000:1000 data
docker compose up -d
```

The full step-by-step guide – reverse proxy, push notifications, AI insights, updates and backups – is in
**[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**.

## Development

Requirements: Node.js ≥ 24.7

```bash
npm install
npm run dev      # http://localhost:5173, data in ./data
npm test         # unit tests
npm run check    # type check
npm run build    # production build in ./build
```

Tech stack: SvelteKit 3, Svelte 5, TypeScript, `node:sqlite`, `web-push`.
Releases follow [Semantic Versioning](https://semver.org); see [CHANGELOG.md](CHANGELOG.md).

## License

[GNU Affero General Public License v3.0](LICENSE) – you may use, modify and share ediurnum; if you run a modified
version as a service for others, you must make its source code available to them.
