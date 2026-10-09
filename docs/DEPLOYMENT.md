# Deploying ediurnum with Docker Compose

This guide sets up ediurnum on a server with Docker, behind **NGINX Proxy Manager** for HTTPS,
and walks you through installing the app, testing push notifications and AI insights.

## 0. Requirements

- A Linux server with **Docker** and the **Compose plugin** (`docker compose version` works)
- **NGINX Proxy Manager** (or another reverse proxy that terminates HTTPS)
- A **domain or subdomain** pointing to the server, e.g. `journal.example.com` (DNS A/AAAA record)
- `git`

HTTPS is required: browsers only allow push notifications and installing the web app on secure origins.

## 1. Get the code

```bash
git clone https://github.com/ZZELAV/ediurnum.git
cd ediurnum
```

To run a specific release instead of the latest code, check out its tag, e.g. `git checkout v0.1.0-beta.1`.

## 2. Configure

```bash
cp .env.example .env
nano .env
```

- `ORIGIN` – the exact public address, e.g. `https://journal.example.com` (no trailing slash).
  It is used for cross-site protection, secure cookies and as the sender for push services.
- `TZ` – your time zone (`Europe/Zurich`, …). “Today” and all reminder times use it.
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

## 5. Build and start

```bash
docker compose up -d --build
docker compose ps          # after ~20 s the status should be "healthy"
docker compose logs -f     # Ctrl+C to stop following the logs
```

The first build takes a few minutes. If the container keeps restarting, check the logs – most often the
`data` folder is not writable (step 3).

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

ediurnum does not call an AI itself (yet). It creates a Markdown file with instructions and your entries that you
give to the AI chat of your choice – no API key needed.

1. Write a few entries. Each entry has the switch *Allowed for AI analyses* (on by default).
2. Open *Insights*, choose the period, the tone and the number of focus points, optionally a question, and click
   **Create Markdown file**.
3. **Download (.md)** and upload the file in an AI chat (ChatGPT, Claude, Gemini, …) – or **Copy text** and paste it.
4. Copy the AI’s complete answer, paste it into **Save the AI’s answer** and save.
   The focus points from the answer’s last section (“## Focus points”) appear on the dashboard.

The file contains your entries in plaintext. Only give it to an AI service you trust and delete it afterwards.
Built-in AI agents with your own API key are planned for a later release.

## 10. Updates

```bash
cd ediurnum
git pull                       # or: git fetch --tags && git checkout <new tag>
docker compose up -d --build
```

Database migrations run automatically on start. Download a backup before larger updates.

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
