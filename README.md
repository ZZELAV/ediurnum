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
  - Due weekly and monthly reviews are suggested right inside the entry (“Write it now” / “Not today”)
- **Past days open read-only** – edit them with the pencil; every entry keeps a **version history**
- **Reminders**: weekly and monthly reviews plus your own reminders (once, daily, on chosen weekdays or monthly),
  shown in the app and as **push notifications** on registered devices
- **Optional focus mode**: while you write, navigation and side column fade out; press Esc to return
- **All content encrypted at rest**, with a recovery key shown once at setup
- **Locked entries** with an additional PIN
- **AI insights without API keys**: ediurnum turns the entries of a period into a Markdown file for the AI chat of your
  choice (ChatGPT, Claude, Gemini, …). Paste the answer back to keep it – its focus points for the coming weeks appear
  on the dashboard. Built-in AI agents with API keys are planned for a later release.
- **Encrypted backup**, readable export (Markdown/JSON) and **delete journal** (all entries, or a complete reset)
- German and English, light and dark theme (follows your device unless you choose one), installable as a web app

## Security at a glance

| What | How |
|---|---|
| Entries, settings, AI reviews | AES-256-GCM with a random 256-bit master key |
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

```bash
git clone https://github.com/ZZELAV/ediurnum.git && cd ediurnum
cp .env.example .env            # set ORIGIN to your public https address
mkdir -p data && sudo chown 1000:1000 data
docker compose up -d --build
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

Tech stack: SvelteKit 2, Svelte 5, TypeScript, `node:sqlite`, `web-push`.
Releases follow [Semantic Versioning](https://semver.org); see [CHANGELOG.md](CHANGELOG.md).

## License

[GNU Affero General Public License v3.0](LICENSE) – you may use, modify and share ediurnum; if you run a modified
version as a service for others, you must make its source code available to them.
