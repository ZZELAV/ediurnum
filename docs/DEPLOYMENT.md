# Deploying ediurnum with Docker Compose

This guide sets up ediurnum on a server with Docker, behind **NGINX Proxy Manager** for HTTPS,
and walks you through installing the app, testing push notifications and AI insights.

## 0. Requirements

- A Linux server with **Docker** and the **Compose plugin** (`docker compose version` works)
- **NGINX Proxy Manager** (or another reverse proxy that terminates HTTPS)
- A **domain or subdomain** pointing to the server, e.g. `journal.example.com` (DNS A/AAAA record)
- `curl` (or `git`, if you build from source)

HTTPS is required: browsers only allow push notifications and installing the web app on secure origins.

## 1. Get the files

ediurnum is published as a ready-made image on Docker Hub
([zzelav/ediurnum](https://hub.docker.com/r/zzelav/ediurnum), for amd64 and arm64). You only need two files:

```bash
mkdir ediurnum && cd ediurnum
curl -fsSLO https://raw.githubusercontent.com/ZZELAV/ediurnum/main/docker-compose.yml
curl -fsSLO https://raw.githubusercontent.com/ZZELAV/ediurnum/main/.env.example
```

<details>
<summary>Build from source instead</summary>

```bash
git clone https://github.com/ZZELAV/ediurnum.git
cd ediurnum
git checkout v0.1.0-beta.4      # optional: a specific release
```

In step 5 and for updates, add `-f docker-compose.yml -f docker-compose.build.yml` and `--build` to
`docker compose up`, e.g. `docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build`.
</details>

## 2. Configure

```bash
cp .env.example .env
nano .env
```

- `ORIGIN` – the exact public address, e.g. `https://journal.example.com` (no trailing slash).
  It is used for cross-site protection, secure cookies and as the sender for push services.
- `TZ` – your time zone (`Europe/Zurich`, …). “Today”, the version history (one version per day) and all reminder times use it.
- `EDIURNUM_VERSION` (optional) – pin a release, e.g. `0.1.0-beta.4`. Without it, the newest release (`latest`) is used.
- `LOG_LEVEL` (optional) – `info` by default: start-up, opening and closing the journal, failed attempts, backups,
  push notifications and errors. `debug` additionally logs every request. Logs never contain journal content.
- Leave the other values as they are unless you know you need something else.

## 3. Prepare the data folder

The container runs as user `1000` and stores the encrypted database in `./data`:

```bash
mkdir -p data
sudo chown 1000:1000 data
```

## 4. Choose how the proxy reaches the container

**Option A – port on the host (simplest).** Keep `ports: - "3000:3000"` in `docker-compose.yml`.
The proxy forwards to `<server IP>:3000`. Make sure port 3000 is not reachable from the internet
(firewall), only by the proxy.

**Option B – shared Docker network (recommended if NGINX Proxy Manager runs in Docker on the same host).**

```bash
docker network ls      # find the network of NGINX Proxy Manager, e.g. nginx-proxy-manager_default
```

In `docker-compose.yml`: remove the `ports:` block, enable the `networks:` lines under the service and at the
bottom, and set the network name you found. The proxy then forwards to host `ediurnum`, port `3000`.

## 5. Start

```bash
docker compose up -d
docker compose ps          # after ~20 s the status should be "healthy"
docker compose logs -f     # Ctrl+C to stop following the logs
```

If the container keeps restarting, check the logs – most often the `data` folder is not writable (step 3).

## 6. Set up the proxy host (NGINX Proxy Manager)

*Hosts → Proxy Hosts → Add Proxy Host*

- **Details:** domain `journal.example.com`, scheme `http`,
  forward hostname/IP `<server IP>` (option A) or `ediurnum` (option B), port `3000`,
  enable *Block Common Exploits*.
- **SSL:** *Request a new SSL certificate* (Let’s Encrypt), enable *Force SSL* and *HTTP/2 Support*.
- **Advanced:** allow larger uploads for restoring backups:

  ```nginx
  client_max_body_size 50m;
  ```

Save and open `https://journal.example.com`.

## 7. First start

1. Choose a password (at least 10 characters).
2. **Store the recovery key safely** (password manager or printed). It is shown only once and is the only way
   to recover the journal or open a backup if you forget your password.
3. Confirm and open the journal.

Quick check: write an entry, open *Settings → Backup & export* and download an encrypted backup.

**Install as an app (optional):** ediurnum then opens in its own window like a desktop or phone app.

- Chrome / Edge (Windows, macOS, Linux, Android): install icon in the address bar, or menu → *Install ediurnum*.
- Safari on macOS: *File → Add to Dock*.
- iPhone / iPad: Safari → *Share* → *Add to Home Screen*.
- Firefox on the desktop does not support installing web apps.

The app needs a connection to your server; there is deliberately no offline cache (journal content never lands in
the browser cache).

## 8. Test push notifications

Push needs HTTPS (step 6). Notifications never contain journal content.

**Computer (Chrome, Edge, Firefox):**

1. *Reminders → Push notifications → Enable on this device* and allow notifications in the browser prompt.
2. Click *Send test notification* – a notification should appear within a few seconds.

**Android (Chrome):** same as on the computer.

**iPhone/iPad (iOS 16.4 or later):** push only works in the installed web app.

1. Open the address in **Safari** → *Share* → *Add to Home Screen*.
2. Open ediurnum **from the home screen**, sign in.
3. *Reminders → Push notifications → Enable on this device*, allow, then *Send test notification*.

**Test a real reminder:** *Reminders → New reminder*, repeat *Once*, today’s date, a time **2–3 minutes from now**.
The server checks every minute and sends it at that time – even if the journal is closed.

**Troubleshooting:**

```bash
docker compose logs ediurnum | grep -i push
```

- `403` / `BadJwtToken` (often Apple): `ORIGIN` must be the real `https://` address. Alternatively set
  `VAPID_SUBJECT=mailto:you@example.com` in `.env`, then `docker compose up -d`.
- `404` / `410`: the device unsubscribed; ediurnum removes it automatically. Enable it again on that device.
- “Notifications are blocked”: allow notifications for the site in the browser or system settings
  (on iPhone: *Settings → Notifications → ediurnum*).
- Reminder at the wrong time: check `TZ` in `.env`.

## 9. Test AI insights

ediurnum never sends anything to an AI on its own. It creates a Markdown file with instructions and your entries that
you give to the AI chat of your choice – no API key needed.

1. Write a few entries with a mood. Each entry has the switch *Allowed for AI analyses* (on by default).
   Optionally fill in *Settings → About me* – the self-assessment is added to the file as background.
2. Open *Insights*, choose the period, the tone and the number of focus points, optionally a question, and click
   **Create Markdown file**.
3. **Download (.md)** and upload the file in an AI chat (ChatGPT, Claude, Gemini, …) – or **Copy text** and paste it.
4. Copy the AI’s complete answer, paste it into **Save the AI’s answer** and save.
   The focus points from the answer’s last section (“## Focus points”) appear on the dashboard,
   the review shows a chart of your mood in that period.

The file contains your entries in plaintext. Only give it to an AI service you trust and delete it afterwards.
AI agents with your own API key are planned for a later release – they will also only run when you start them.

## 10. Updates

```bash
cd ediurnum
docker compose pull
docker compose up -d
```

With `EDIURNUM_VERSION` pinned, change it in `.env` first. New releases are listed in the
[changelog](https://github.com/ZZELAV/ediurnum/blob/main/CHANGELOG.md). Database migrations run automatically on start.
Download a backup before larger updates.

**Switching from a source installation** (`git clone`): run `git pull` once – `docker-compose.yml` then uses the
image from Docker Hub – and continue with `docker compose pull && docker compose up -d`. Your `.env` and `data`
stay as they are.

## 11. Backups

- **In the app:** *Settings → Backup & export → Download encrypted backup* (`.ediurnum` file).
  Restore it on a new installation with *Restore* and your recovery key.
- **On the server:** `./data` contains the encrypted database. For a consistent copy, stop the container briefly
  (`docker compose stop`, copy, `docker compose start`) or use the in-app backup.

## 12. Removing ediurnum

```bash
docker compose down
rm -rf data        # deletes the journal permanently
```
