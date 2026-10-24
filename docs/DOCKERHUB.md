# ediurnum

**A private, self-hosted journal for daily reflection** – all content encrypted at rest, with guided questions,
weekly and monthly reviews, reminders and optional AI insights through the AI chat of your choice.

*diurnum* (Latin for “diary”) + *e* for digital. Source code, documentation and changelog:
**[github.com/ZZELAV/ediurnum](https://github.com/ZZELAV/ediurnum)** · License: AGPL-3.0

## Features

- One entry per day in 5–10 minutes: guided questions (experienced, feelings, learning & growth), free thoughts, mood
- **Search** across all entries and a calendar that shows your mood per day
- **Statistics**: writing streaks, mood over time, mood and energy per month and weekday, most frequent feelings
- “Your first steps” on the dashboard to get started (first entry, About me, reminders, PIN, backup)
- Weekly and monthly reviews, your own reminders and **push notifications** (also on iPhone as an installed web app)
- **About me**: a short self-assessment (personality, values, goals) as background for AI insights
- **AI insights without API keys**: a Markdown file for ChatGPT, Claude, Gemini, … with customisable instructions –
  ediurnum never sends anything to an AI on its own; focus points appear on the dashboard
- Version history per entry (one version per day, changes highlighted), “on this day”, focus mode, German, English and Italian, light and dark theme, installable web app
- **Encryption**: AES-256-GCM with a random master key (= recovery key), password via Argon2id, PIN-locked entries,
  encrypted backups, recovery key test in the settings; the journal locks itself shortly after you leave the app
- Readable export as Markdown, JSON or **PDF**, and a **backup converter** that turns an encrypted backup into these
  formats without a running app: `docker run --rm -it -v "$PWD:/work" -u "$(id -u):$(id -g)" zzelav/ediurnum node scripts/convert.ts /work/<backup>.ediurnum`

## Quick start

ediurnum needs a reverse proxy with **HTTPS** in front of it (e.g. NGINX Proxy Manager) – browsers only allow push
notifications and installing the app on secure origins.

```bash
mkdir ediurnum && cd ediurnum
curl -fsSLO https://raw.githubusercontent.com/ZZELAV/ediurnum/main/docker-compose.yml
curl -fsSLO https://raw.githubusercontent.com/ZZELAV/ediurnum/main/.env.example
cp .env.example .env            # set ORIGIN to your public https address
mkdir -p data && sudo chown 1000:1000 data
docker compose up -d
```

Then open your address and create the journal. **Store the recovery key safely** – without password and recovery key
your entries cannot be recovered.

Step-by-step guide (proxy, push notifications, updates, backups):
[docs/DEPLOYMENT.md](https://github.com/ZZELAV/ediurnum/blob/main/docs/DEPLOYMENT.md)

## Tags

| Tag | Meaning |
|---|---|
| `latest` | newest release |
| `1.0.0`, … | a specific release – see the [changelog](https://github.com/ZZELAV/ediurnum/blob/main/CHANGELOG.md) |

Images are built for `linux/amd64` and `linux/arm64` (e.g. Raspberry Pi 4/5). Pin a version in `.env` with
`EDIURNUM_VERSION=1.0.0`.

## Configuration

| Variable | Required | Description |
|---|---|---|
| `ORIGIN` | yes | Exact public address, e.g. `https://journal.example.com` (cross-site protection, secure cookies, push sender). Without HTTPS use the `http://` address – push and app installation then do not work |
| `TZ` | recommended | Time zone for “today”, the version history and reminder times, default `Europe/Zurich` |
| `ADDRESS_HEADER`, `XFF_DEPTH` | behind a proxy | Real client IP from the proxy, e.g. `X-Forwarded-For` and `1` (slows down password guessing) |
| `BODY_SIZE_LIMIT` | no | Maximum upload size for restoring a backup, default `50M` |
| `COOKIE_SECURE` | no | `true`/`false`: mark the session cookie `Secure` (HTTPS only). Default follows `ORIGIN` (`https://` → on) |
| `VAPID_SUBJECT` | no | Sender for push services (`mailto:` or `https:`), defaults to `ORIGIN` |
| `LOG_LEVEL` | no | `error`, `warn`, `info` (default) or `debug` (every request). Logs never contain journal content |
| `WIDGET_TOKEN` | no | Enables `/api/widget` for dashboards (number of entries, time of the latest save, written today, current streak); at least 16 characters, sent as `Authorization: Bearer <token>` |

| Container | |
|---|---|
| Port | `3000` (HTTP – put the HTTPS proxy in front) |
| Volume | `/data` – the encrypted SQLite database; owned by user `1000` |
| User | runs as non-root user `node` (1000); works with `read_only: true` and `cap_drop: ALL` |
| Health check | built in (`/login`) |

## Updates

```bash
docker compose pull && docker compose up -d
```

Database migrations run automatically. Download an encrypted backup in the app before larger updates.

## Privacy

Plaintext on disk is limited to dates, timestamps, flags and which sections an entry contains. To send reminders while
the journal is closed, the reminder schedule and the push addresses of your devices are stored unencrypted;
notifications never contain journal content.
