# Deploying to a VPS (Ubuntu / Debian)

The Studio can run as a plain Node process instead of a Cloudflare Worker —
see `studio/README.md` → *Running on a VPS instead of Cloudflare* for what
changes in the build. This file is the machine setup.

The layout assumed below is the one that matters most: **Postgres lives on the
VM and both apps use it.** The Studio runs there; the bot keeps running on the
PC and connects over the network. They share one database, so splitting them
without doing that leaves one of them pointing at a database nobody writes to.

---

## 1. Base packages

```bash
sudo apt update
sudo apt install -y curl git \
  pkg-config build-essential libpixman-1 libpixman-1-dev \
  libcairo2-dev libjpeg-dev libpango1.0-dev librsvg2-dev
```

The `lib*` packages are for `canvas`, which the bot uses to render profile
cards and palettes. It is a native module: without them `npm ci` appears to
succeed and the bot then dies with `ERR_DLOPEN_FAILED`. This is the same list
CI installs (`.github/workflows/ci.yml`).

## 2. Node 22

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v
```

CI pins Node 22; match it.

## 3. PostgreSQL 16

```bash
sudo apt install -y postgresql postgresql-contrib
sudo -u postgres psql -c "CREATE USER aesthetic WITH PASSWORD 'a-long-random-password';"
sudo -u postgres psql -c "CREATE DATABASE aesthetic OWNER aesthetic;"
```

### If the bot connects from another machine

Two files need editing, both under `/etc/postgresql/16/main/`.

`postgresql.conf`:

```
listen_addresses = 'localhost,0.0.0.0'
```

`pg_hba.conf` — append, and use a password rather than `trust`:

```
host    aesthetic    aesthetic    <the-bot's-ip>/32    scram-sha-256
```

Then `sudo systemctl restart postgresql`, and open the port only to that
machine rather than the world:

```bash
sudo ufw allow from <the-bot's-ip> to any port 5432 proto tcp
sudo ufw enable
```

Do not expose 5432 publicly. If the bot and the site end up on the same VM,
skip all of this — `localhost` is fine and faster.

## 4. Clone and install

Do not copy the folder across. `node_modules` contains a `canvas` binary built
for Windows, and `.env` files are gitignored so a copy silently half-works.

```bash
git clone -b v2 https://github.com/slimhercules953/Aesthetic-king.git /opt/aesthetic-king
cd /opt/aesthetic-king
npm ci
cd studio && npm ci && cd ..
```

## 5. Environment files

### `/opt/aesthetic-king/.env` (bot)

```
TOKEN=<bot token>
CLIENT_ID=<application id>
DEV_GUILD_ID=<guild id used for local command deploys>
DATABASE_URL=postgresql://aesthetic:<password>@127.0.0.1:5432/aesthetic
OLLAMA_URL=http://<ollama-host>:11434
OLLAMA_MODEL=<model tag>
NODE_ENV=production
```

If the bot stays on the PC, change only `DATABASE_URL` there — and note the
TLS rule below.

### `/opt/aesthetic-king/studio/.env.local` (site)

```
DATABASE_URL=postgresql://aesthetic:<password>@127.0.0.1:5432/aesthetic
DISCORD_CLIENT_ID=<application id>
DISCORD_CLIENT_SECRET=<client secret>
DISCORD_BOT_TOKEN=<bot token>
SESSION_SECRET=<must be identical to the old host>
OAUTH_TOKEN_ENCRYPTION_KEY=<must be identical to the old host>
NEXT_PUBLIC_APP_URL=https://<your domain>
OLLAMA_MODEL=<model tag>
OLLAMA_URL=http://<ollama-host>:11434
PREMIUM_MONTHLY_PRICE_ID=price_...
PREMIUM_ANNUAL_PRICE_ID=price_...
STRIPE_SECRET_KEY=sk_live_...
```

`CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` is the local
Hyperdrive emulator and is not needed on a VM — leave it out.

Three things here are easy to get wrong:

- **`SESSION_SECRET` and `OAUTH_TOKEN_ENCRYPTION_KEY` must be byte-identical
  to the current host.** Stored Discord OAuth tokens are encrypted with the
  latter; change it and every token in the database becomes undecryptable and
  all users are logged out. Copy the exact values.
- **`NEXT_PUBLIC_APP_URL` is inlined at build time.** Setting it after
  `npm run build:node` has no effect — rebuild.
- **`DATABASE_URL` TLS.** `studio/lib/database.ts` requires a verified TLS
  connection for any host that is not localhost/LAN, and skips TLS for
  localhost and private ranges. So `127.0.0.1` on the VM needs nothing, but a
  bot on the PC reaching a *public* IP will fail until the certificate
  verifies. Prefer a WireGuard/Tailscale private address, or append
  `?sslmode=require` to override.

## 6. Database schema

```bash
cd /opt/aesthetic-king
npx prisma generate
npx prisma migrate deploy
```

`migrate deploy` is the production command — it applies pending migrations
without the diff prompts `migrate dev` would ask for.

To move existing data rather than start empty, dump from the current server
and restore:

```bash
# on the old machine
pg_dump -U postgres -d <olddb> -f ak.sql
# on the VM
psql -U aesthetic -d aesthetic -f ak.sql
```

## 7. Build and run

```bash
cd /opt/aesthetic-king/studio
npm run build:node
```

That runs the Node Vite config and then the secret-leak scanner over the
output. Then check it by hand once:

```bash
PORT=3000 npm run start:node
curl -I http://127.0.0.1:3000/
```

### systemd unit for the site

`/etc/systemd/system/aesthetic-studio.service`:

```ini
[Unit]
Description=Aesthetic King Studio
After=network-online.target postgresql.service
Wants=network-online.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/aesthetic-king/studio
Environment=PORT=3000
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm run start:node
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now aesthetic-studio
sudo journalctl -u aesthetic-studio -f
```

### systemd unit for the bot (only if it moves to the VM too)

`/etc/systemd/system/aesthetic-bot.service`:

```ini
[Unit]
Description=Aesthetic King bot
After=network-online.target postgresql.service
Wants=network-online.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/aesthetic-king
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

The bot reads `.env` from its working directory, so `WorkingDirectory` matters.

## 8. Reverse proxy + TLS

The Node server binds `0.0.0.0:3000` but should never be the public entry
point. Caddy is the shortest path because it does certificates on its own:

`/etc/caddy/Caddyfile`:

```
aesthetic.etterdigital.dev {
    reverse_proxy 127.0.0.1:3000
}
```

```bash
sudo systemctl reload caddy
```

Point the DNS record at the VM first, otherwise the certificate request fails.

## 9. Discord developer portal

Add the production callback for client `1062520458416771092`:

```
https://<your domain>/api/auth/discord/callback
```

In production `resolveAppOrigin()` in `studio/lib/auth.ts` always uses
`NEXT_PUBLIC_APP_URL` for the `redirect_uri` rather than the request's `Host`
header — trusting the header would let a forged one redirect a victim's auth
code to an attacker's origin. So the domain in `NEXT_PUBLIC_APP_URL` and the
one registered at Discord have to agree exactly, scheme included.

## 10. Updating later

```bash
cd /opt/aesthetic-king
git pull
npm ci
cd studio && npm ci && npm run build:node && cd ..
npx prisma migrate deploy
sudo systemctl restart aesthetic-studio
```

Restart the bot too if the pull touched `src/`.

---

## Still blocked on external setup

These are not deployment steps and cannot be finished from the code:

- **DNS for `aesthetic.etterdigital.dev`** — until it resolves, the webhooks
  below have nowhere to arrive and the certificate cannot be issued.
- **`STRIPE_WEBHOOK_SECRET`** — set in the Stripe dashboard *after* the domain
  works, pointing at `https://<domain>/api/webhooks/stripe`. Premium is not
  activated by the checkout itself; only the webhook does that, so billing
  appears to take money and grant nothing until this is wired up.
- **`TOPGG_WEBHOOK_SECRET`** — same story for
  `https://<domain>/api/webhooks/topgg`.
- **Stripe customer portal** — not enabled on the account, so the "manage
  subscription" link has no destination.
- **Re-inviting the bot on existing servers** — the Role maker needs Manage
  Roles, which is a new consent bit; an owner has to run the invite again.
