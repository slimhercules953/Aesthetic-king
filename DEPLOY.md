# Deploying to a VPS (Ubuntu / Debian)

The Studio can run as a plain Node process instead of a Cloudflare Worker —
see `studio/README.md` → *Running on a VPS instead of Cloudflare* for what
changes in the build. This file is the machine setup.

Two layouts work. Either both apps run on the VM (there is a systemd unit for
each in `deploy/systemd/`, and Postgres is reachable only on `127.0.0.1`), or the
Studio runs there and the bot stays on the PC and connects over the network. They
share one database, so the thing you must not do is split them without deciding
which machine owns Postgres — otherwise one of them points at a database nobody
writes to.

The steps below assume both apps end up on the VM. §3 explains what changes if
the bot stays on the PC.

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

## 3. PostgreSQL

**Install Postgres 18, not the Ubuntu default.** The current database on the PC
is server 18 (`postgresql-x64-18`). Ubuntu 24.04 ships 16, and `pg_dump` refuses
to dump from a newer server than itself while a 18 dump will not restore onto 16.
Add the PostgreSQL Global Development Group repo:

```bash
sudo apt install -y curl ca-certificates
sudo install -d /usr/share/postgresql-common/pgdg
sudo curl -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc --fail \
  https://www.postgresql.org/media/keys/ACCC4CF8.asc
echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt $(. /etc/os-release && echo $VERSION_CODENAME)-pgdg main" | sudo tee /etc/apt/sources.list.d/pgdg.list
sudo apt update
sudo apt install -y postgresql-18
```

Verify before you rely on it:

```bash
psql --version                      # want 18.x
```

If you would rather not match versions, the alternative is to leave Postgres on
the PC and have the VM connect to it over the network — but that puts the
database behind your home NAT and makes the site depend on the PC being on. Not
recommended for something meant to be always-on.

```bash
sudo -u postgres psql -c "CREATE USER aesthetic WITH PASSWORD 'a-long-random-password';"
sudo -u postgres psql -c "CREATE DATABASE aesthetic OWNER aesthetic;"
```

Leave `listen_addresses` at its default `localhost` if both apps run on the VM.
That keeps the database off the network entirely.

### If the bot connects from another machine

Two files need editing, both under `/etc/postgresql/18/main/`.

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

Do not copy the project folder across. `node_modules` contains a `canvas` binary
built for Windows, and `.env` files are gitignored so a copy silently half-works.

Since the VM is a separate machine you reach over SSH, everything below runs in
an SSH session on the VM. Push your branch first, then:

```bash
ssh <user>@<vm-address>
git clone -b v2 https://github.com/slimhercules953/Aesthetic-king.git /opt/aesthetic-king
cd /opt/aesthetic-king
npm ci
cd studio && npm ci && cd ..
```

If the repo is private, a HTTPS clone will prompt for a password GitHub no
longer accepts. Add a fine-grained personal access token scoped to just this
repository and use it as the password, or install a deploy key:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/aesthetic_deploy -N ""     # on the VM
cat ~/.ssh/aesthetic_deploy.pub                             # paste as a read-only deploy key
git config core.sshCommand "ssh -i ~/.ssh/aesthetic_deploy"
```

### The `.env` files have to come across separately

They are gitignored, so `git clone` will not bring them. From the PC:

```powershell
cd "c:\Users\etter\OneDrive\Desktop\Coding stuff\New Bots\Aesthetic-king"
scp .env <user>@<vm-address>:/tmp/bot.env
scp studio\.env.local <user>@<vm-address>:/tmp/studio.env
```

Then on the VM, move them into place:

```bash
sudo mv /tmp/bot.env /opt/aesthetic-king/.env
sudo mv /tmp/studio.env /opt/aesthetic-king/studio/.env.local
```

`/tmp` is world-readable, so delete them once moved: `shred -u /tmp/bot.env
/tmp/studio.env` (or `rm -f` at minimum). Ownership and `chmod 600` are in §8.

Copying these two files as-is is safe even though they were written on Windows:
`dotenv` and vinext's own parser both normalise CRLF, so no stray `\r` ends up in
a value. Verified against both parsers.

### Moving the existing data

The database is currently on the PC in Postgres 18, so a fresh clone starts
empty. Dump and restore rather than re-creating content by hand:

```powershell
# on the PC
pg_dump -U aesthetic_king -h localhost --no-owner --no-privileges -f ak.sql aesthetic_king
scp ak.sql <user>@<vm-address>:/tmp/
```

`pg_dump` is at `C:\Program Files\PostgreSQL\18\bin\pg_dump.exe`; add it to your
PATH for the command, or call it by full path. Dump as the role named in
`DATABASE_URL` rather than `postgres` — it owns the database, so it works without
a separate superuser password.

`--no-owner` and `--no-privileges` are not cosmetic. The local role is called
`aesthetic_king` and the VM's is `aesthetic`, so a default dump is full of
`ALTER TABLE ... OWNER TO aesthetic_king` statements that each fail on the
target. Omitting them means whoever runs the restore owns everything, which is
another reason to restore as the app role rather than as `postgres`: Prisma needs
that ownership to `ALTER` tables later.

```bash
# on the VM
sudo chmod a+r /tmp/ak.sql
sudo -u aesthetic psql -d aesthetic -v ON_ERROR_STOP=1 -f /tmp/ak.sql
shred -u /tmp/ak.sql
```

The dump is plain SQL containing your password hashes and encrypted OAuth
tokens, so do not leave it in `/tmp`.

This is why §3 installs Postgres 18: the dump is only forward-compatible, and a
18 dump restored onto 16 fails on version-gated statements. The local database is
named `aesthetic_king` while the runbook uses `aesthetic` on the VM — that is
fine, `pg_dump` output does not reference the source database name.

### Doing all of the above with the helper script

`deploy/push-to-vm.ps1` does the four PC-side steps above in one go: it checks
SSH, copies both `.env` files, installs them with the right owner and mode 600,
dumps the local database, uploads it, and tightens its permissions. It never
prints a secret, and it deletes the local dump even if a later step fails.

```powershell
cd "c:\Users\etter\OneDrive\Desktop\Coding stuff\New Bots\Aesthetic-king"

# both .env files plus a fresh database dump
.\deploy\push-to-vm.ps1 -Vm alice@203.0.113.10

# secrets only, leave the database alone
.\deploy\push-to-vm.ps1 -Vm alice@203.0.113.10 -EnvOnly
```

Pass `-RemoteDir` and `-ServiceUser` if you used something other than
`/opt/aesthetic-king` and `aesthetic`. The remote `install` calls run under
`sudo`, so the login you give it needs sudo rights.

It does not transfer code — the VM pulls that from GitHub, because
`node_modules` here contains a Windows-built `canvas` binary. When it finishes it
prints the restore command and the `systemctl restart` to run on the VM.

## 5. Environment files

### `/opt/aesthetic-king/.env` (bot)

```
TOKEN=<bot token>
CLIENT_ID=<application id>
DEV_GUILD_ID=<guild id used for local command deploys>
DATABASE_URL=postgresql://aesthetic:<password>@127.0.0.1:5432/aesthetic
R2_ACCOUNT_ID=<cloudflare account id>
R2_ACCESS_KEY_ID=<r2 access key id>
R2_SECRET_ACCESS_KEY=<r2 secret>
R2_BUCKET_NAME=<bucket name>
R2_PUBLIC_URL=https://<pub bucket hostname>
OLLAMA_URL=http://<ollama-host>:11434
OLLAMA_MODEL=<model tag>
NODE_ENV=production
```

The `R2_*` block is not optional — the bot reads it directly (`src/config/env.js`)
and serves every asset from the bucket. Without it it starts fine and then fails
when a command tries to render. `R2_ENDPOINT` is derived from `R2_ACCOUNT_ID`, so
leave it unset unless you use a custom endpoint.

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
STRIPE_WEBHOOK_SECRET=whsec_...
```

`CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` is the local
Hyperdrive emulator and is not needed on a VM — leave it out.

Four things here are easy to get wrong:

- **`OLLAMA_URL` points at a LAN address on a third machine**, not at the VM and
  not at the PC you deploy from. `http://10.40.10.167:11434` is a box on the
  `10.40.10.x` home network (the deploy PC is `10.40.10.47`); the VM is on
  `10.40.99.x`. This deployment deliberately points the VM at that instance, so
  generation only works while that machine is on *and* the two subnets route to
  each other. Check with
  `curl -m 5 http://10.40.10.167:11434/api/version` **from the VM** — if it
  hangs, either add a route, run Ollama on the VM and use
  `http://127.0.0.1:11434`, or accept that AI generation 500s. Nothing else
  breaks: the app boots and only generation fails, at call time.
  `OLLAMA_URL` is read at request time, so changing it needs only
  `systemctl restart aesthetic-studio`, not a rebuild.
- **`SESSION_SECRET` and `OAUTH_TOKEN_ENCRYPTION_KEY` must be byte-identical
  to the current host.** Stored Discord OAuth tokens are encrypted with the
  latter; change it and every token in the database becomes undecryptable and
  all users are logged out. Copy the exact values.
- **`NEXT_PUBLIC_APP_URL` is inlined at build time.** It is currently
  `http://localhost:3000`, which would bake a broken link into every page. Set
  it to the real `https://` domain *before* `npm run build:node`, or rebuild
  after.
- **`DATABASE_URL` TLS.** `studio/lib/database.ts` requires a verified TLS
  connection for any host that is not localhost/LAN, and skips TLS for
  localhost and private ranges. So `127.0.0.1` on the VM needs nothing, but a
  bot on the PC reaching a *public* IP will fail until the certificate
  verifies. Prefer a WireGuard/Tailscale private address, or append
  `?sslmode=require` to override.

## 6. Database schema

If you restored a dump in §4, skip this — the dump already carries the schema
and Prisma's `_prisma_migrations` table, so the command below is a no-op.

For a fresh database:

```bash
cd /opt/aesthetic-king
npx prisma generate
npx prisma migrate deploy
```

`migrate deploy` is the production command — it applies pending migrations
without the diff prompts `migrate dev` would ask for.

## 7. Build and run

```bash
cd /opt/aesthetic-king/studio
npm run build:node
```

That runs the Node Vite config and then the secret-leak scanner over the
output. Then check it by hand once:

```bash
PORT=3100 npm run start:node
curl -I http://127.0.0.1:3100/
```

On a VM, only ever run `build:node` — never plain `npm run build`. Both configs
write to the same `dist/`, and the Cloudflare one leaves a workerd bundle there
that `vinext start` cannot execute. The site will fail to boot with a confusing
error about a missing server entry, and the fix is just to re-run `build:node`.

## 8. Running it under systemd

Both apps are ordinary long-running Node processes, so systemd can supervise
them directly. There is no PM2 dependency in either `package.json` — PM2 is
only how the bot has been started so far — so nothing in the code has to
change. The units live in [`deploy/systemd/`](deploy/systemd).

### If PM2 is currently running them

Stop it first, or the two supervisors will fight over the port and the bot will
open a second Discord connection:

```bash
pm2 list
pm2 delete all
pm2 unstartup systemd     # removes the resurrect-on-boot service
rm -f ~/.pm2/dump.pm2     # so nothing is restored next boot
```

Then create the service user, matching the units:

```bash
sudo useradd --system --home /opt/aesthetic-king --shell /usr/sbin/nologin aesthetic
sudo chown -R aesthetic:aesthetic /opt/aesthetic-king
```

Once that `chown` has run, your login user can no longer write into `/opt` at
all, so `scp .env thomas@host:/opt/aesthetic-king/.env` fails with
`dest open "/opt/aesthetic-king/.env": Permission denied`. Copy the files to
your home directory and install them from there — `install` sets owner and mode
in one step, so the secrets never sit in `/opt` owned by the wrong user:

```bash
# on the VM
mkdir -p ~/ak-deploy
# scp the files to ~/ak-deploy/ from wherever they came, then:
cd /opt/aesthetic-king
sudo install -o aesthetic -g aesthetic -m 600 ~/ak-deploy/env       .env
sudo install -o aesthetic -g aesthetic -m 600 ~/ak-deploy/env.local studio/.env.local
rm -rf ~/ak-deploy
```

This matters more than it looks because both `.env` files are gitignored, so
`git pull` never touches them and this is the only way to change them.

Do this before installing the units. The site reads `studio/.env.local`, which
holds the signing keys, so that file must not be world-readable and must not be
owned by a user the web server can impersonate:

```bash
sudo chmod 600 /opt/aesthetic-king/.env /opt/aesthetic-king/studio/.env.local
```

### Install the units

```bash
sudo cp deploy/systemd/aesthetic-studio.service /etc/systemd/system/
sudo cp deploy/systemd/aesthetic-bot.service /etc/systemd/system/
sudo systemctl daemon-reload

sudo systemctl enable --now aesthetic-studio
sudo systemctl enable --now aesthetic-bot

systemctl status aesthetic-studio aesthetic-bot
sudo journalctl -u aesthetic-studio -u aesthetic-bot -f
```

Skip the bot unit if the bot stays on your PC — only the site moves.

### Why the site's `ExecStart` is not `npm run start:node`

This is the one thing worth getting right. With `npm run …` as `ExecStart`,
`npm` is PID 1 of the service and the Node server is its child. systemd sends
SIGTERM to the main PID only, `npm` does not forward it, and the site never
runs its shutdown — `systemctl stop` then blocks until `TimeoutStopSec` and
kills it with SIGKILL, possibly mid-request. Calling node on
`node_modules/vinext/dist/cli.js` directly keeps the service to a single
process that receives the signal. It was checked that this starts the server
and serves pages exactly like the npm script does.

The bot is already fine this way because `npm start` runs `node src/index.js`,
which is a direct entry point, and `src/index.js` handles SIGTERM itself: it
closes the Discord connection, drains the Prisma pool, and exits, with a 10s
internal ceiling. `TimeoutStopSec=30` leaves room for that.

### Why there is no `EnvironmentFile=`

Both apps already load their own `.env` from the working directory — the bot
via `dotenv.config()` in `src/config/env.js`, the site via vinext's own loader
in `vinext start`, which reads `.env.local` from the cwd. So the units only set
`PORT` and `NODE_ENV`.

Avoid `EnvironmentFile=/opt/aesthetic-king/.env` even though it looks tidier:
systemd expands `$` in those values, so a `DATABASE_URL` password containing a
`$` gets silently replaced with an empty string and you get an authentication
failure that reads like a wrong password.

Note the precedence if you do set a variable in both places: `process.env`
wins over `.env.local`, so a value in the unit silently shadows the file. Keep
secrets in the file and only the port in the unit.

### Day-to-day commands

```bash
sudo systemctl restart aesthetic-studio     # after a rebuild
sudo systemctl stop aesthetic-bot           # graceful, waits for Discord to close
sudo journalctl -u aesthetic-studio --since "10 min ago"
sudo journalctl -u aesthetic-bot -p err      # errors only
systemctl is-active aesthetic-studio aesthetic-bot
```

`Restart=always` means a crash comes back in 5 seconds on its own; check the
journal rather than assuming a stopped service is dead.

### Optional: journald limits

Node logs a lot and journald is usually unlimited by default:

```bash
sudo systemctl edit journald
```

```ini
[Journal]
SystemMaxUse=500M
```

## 9. Getting traffic to the site

The site binds `127.0.0.1:3100` (see the `-H` flag and `PORT` in the unit), so
it is reachable only through something else. That is deliberate regardless of
which option below you pick: binding `0.0.0.0` would leave plain unencrypted
HTTP on :3100 as a way around TLS.

The port is 3100 rather than 3000 or 3001 because those two are what dev
tooling defaults to, so they are the first things to collide with. Whatever you
choose, the unit's `PORT`, the proxy upstream and the `ss` check in §12 all have
to say the same number.

Which option applies depends on whether the VM has a public address.

### 9a. Cloudflare Tunnel (VM behind NAT, no public IP)

This is the path when the VM only has a private address (e.g. `10.40.x.x`).
There is no public address to aim a DNS record at and no port to forward, so
the usual reverse proxy cannot work. `cloudflared` dials *out* to Cloudflare
and streams responses back, so the VM needs no inbound connectivity.

Requires the domain's DNS to be hosted by Cloudflare. Check with
`dig NS etterdigital.dev` — the answer must be `*.ns.cloudflare.com`.

Install the connector first:

```bash
# Install Cloudflare's apt repo (the signed-by key avoids apt-key, which is
# removed in newer Ubuntu).
sudo mkdir -p --mode=0755 /etc/apt/keyrings
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg \
  | sudo tee /etc/apt/keyrings/cloudflare-main.gpg >/dev/null
echo "deb [signed-by=/etc/apt/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared $(lsb_release -cs) main" \
  | sudo tee /etc/apt/sources.list.d/cloudflared.list
sudo apt update && sudo apt install -y cloudflared
```

There are two ways to tell the connector which tunnel it is running, and they
are mutually exclusive. Pick one.

**Token / remotely managed (what this deployment uses).** The tunnel, its
hostname routes and its DNS record all live in the Cloudflare dashboard, and
the connector is handed a bearer token that identifies the tunnel. Nothing is
configured on the VM beyond the token, so rebuilding the VM is just
"install cloudflared, paste the token".

In the dashboard: *Networks → Tunnels → Create Tunnel → cloudflared*, name it
`aesthetic-studio`, then add a *Published application* route with hostname
`aesthetic.etterdigital.dev` and service `http://localhost:3100`. Copy the
token from the installer snippet — note that the snippet shown is for the
selected OS, but the token itself is the same for every platform.

If the VM already runs `cloudflared` for another hostname (check with
`systemctl status cloudflared --no-pager`), you may not need the token at all.
A connector started with an account-level token picks up every remotely
managed tunnel in the account automatically, so creating the tunnel and adding
its route is enough — the dashboard shows a connector on the tunnel within a
few seconds. Confirm the connector's `arch` matches the machine you expect
(`linux_amd64` for the VM, `linux_arm64` for a Pi) before believing it. Only
install a per-tunnel token if the tunnel shows no connector.

```bash
# From the PC. The token is a bearer credential, so it must not be committed;
# tunnel-token.txt is gitignored.
scp tunnel-token.txt thomas@VM:/tmp/tunnel-token

# On the VM.
sudo install -d -m 0755 /etc/cloudflared
sudo install -m 600 -o root -g root /tmp/tunnel-token /etc/cloudflared/token
sudo rm -f /tmp/tunnel-token
sudo cloudflared service install --token "$(sudo cat /etc/cloudflared/token)"
sudo systemctl enable --now cloudflared
sudo systemctl status cloudflared --no-pager
```

The service unit `cloudflared service install` writes passes
`--token-file /etc/cloudflared/token`, so the token never appears in the
process list or in journald.

Two traps with this mode:

- **`localhost` is the connector's localhost, not yours.** A route of
  `http://localhost:3100` only works because the connector runs on the same
  machine as the app. If the connector for a hostname lives on another box
  (a Raspberry Pi, an old PC), the route has to name a reachable address
  instead, and the 502 comes back as soon as you assume otherwise.
- **The scheme must match what the app speaks.** The Studio is plain HTTP, so
  `https://localhost:3100` fails the TLS handshake and Cloudflare shows a 502
  "Host Error". Use `http://`.
- **Moving a hostname between tunnels is two steps.** Adding a route for a
  hostname that already has a DNS record does *not* repoint the record; it
  keeps pointing at the old tunnel. Edit the record (or delete and recreate it)
  so the `CNAME` targets `<new-tunnel-id>.cfargotunnel.com`.
- **Deleting a route deletes the DNS record too**, even one you repointed by
  hand. If you delete the stale route on the old tunnel after moving the
  hostname, the site goes down with Cloudflare error 1016 "DNS Resolution
  Error" until you recreate the record. Recreating it through the API needs the
  CNAME `content` to end in a dot
  (`<tunnel-id>.cfargotunnel.com.`) or it is rejected with error 9007.

**Locally managed.** Ingress lives in `/etc/cloudflared/config.yml` and the
tunnel is created with `cloudflared tunnel create`, which writes a per-tunnel
credential JSON. Useful if you want routes in version control, but the VM then
owns the routing config.

```bash
# One-time: authorise this machine against your Cloudflare account. Opens a
# browser, so on a headless VM run it and then open the printed URL.
# Deliberately NOT sudo'd. `login` and `create` only talk to the Cloudflare
# API and write into the invoking user's ~/.cloudflared; running them under
# sudo makes the output location depend on how sudo handles $HOME, which
# differs between Ubuntu versions. Root is only needed for /etc and the
# service, both later.
cloudflared tunnel login
cloudflared tunnel create aesthetic-studio
# Prints "Created tunnel aesthetic-studio with id <uuid>" and writes
# ~/.cloudflared/<uuid>.json. Copy the UUID.
TUNNEL_ID=<paste-the-uuid-from-above>

# Point the hostname at the tunnel. Creates the DNS record automatically; it
# must be proxied (orange cloud), not DNS-only, or the tunnel never sees the
# traffic.
cloudflared tunnel route dns aesthetic-studio aesthetic.etterdigital.dev

# Now move the credential into a place the service can read. cert.pem is only
# needed for API calls like the two above, so it does not have to move.
sudo install -d -m 0755 /etc/cloudflared
sudo cp "$HOME/.cloudflared/$TUNNEL_ID.json" /etc/cloudflared/
# The credentials file is a bearer token for the tunnel.
sudo chmod 600 "/etc/cloudflared/$TUNNEL_ID.json"

sudo cp /opt/aesthetic-king/deploy/cloudflared/config.yml.example /etc/cloudflared/config.yml
sudo sed -i "s/<TUNNEL_ID>/$TUNNEL_ID/g" /etc/cloudflared/config.yml

# Generates /etc/systemd/system/cloudflared.service from this config.
sudo cloudflared service install
sudo systemctl enable --now cloudflared
sudo systemctl status cloudflared --no-pager
```

Then confirm the tunnel can reach the app (locally managed only):

```bash
sudo cloudflared tunnel --config /etc/cloudflared/config.yml ingress validate
sudo cloudflared tunnel --config /etc/cloudflared/config.yml ingress http://127.0.0.1:3100
```

Whichever mode you use, **only one connector per hostname should be running**.
Cloudflare load-balances across every connector attached to a tunnel, so a
leftover connector on another machine makes the site fail intermittently
rather than consistently. If the tunnel used to run somewhere else — on
Windows it is a service called `Cloudflared` — stop and disable it:

```powershell
# elevated PowerShell, on the old host
Stop-Service Cloudflared
Set-Service Cloudflared -StartupType Disabled
```

Two things to expect that are not bugs:

- **`Next-Action: 5` / a 530 in the browser while the Studio is down.** The
  tunnel answers on Cloudflare's edge even when nothing is listening locally,
  so a stopped app looks like a DNS problem. Check
  `curl -I http://127.0.0.1:3100/` on the VM first.
- **Visitor IP addresses become Cloudflare's.** If anything logs or rate-limits
  by IP, read `CF-Connecting-IP` instead of the socket address.

Because Cloudflare terminates TLS, there is no certificate to manage here and
no Caddy to install.

### 9b. Caddy (VM has a public address)

Caddy is the shortest path when you *do* have a reachable address, because it
issues certificates on its own:

`/etc/caddy/Caddyfile`:

```
aesthetic.etterdigital.dev {
    reverse_proxy 127.0.0.1:3100
}
```

```bash
sudo systemctl reload caddy
```

Point the DNS record at the VM first, otherwise the certificate request fails.

### Either way: confirm nothing is listening publicly

```bash
ss -ltnp | grep -E ':(80|443|3100|5432)\b'
```

`3100` and `5432` should show `127.0.0.1` (or the LAN range for Postgres if the
bot is on a different box). If either shows `0.0.0.0`, fix it with `ufw deny`
before you forget about it. With the tunnel there is no reason for anything to
accept inbound connections at all.

## 10. Discord developer portal

Add the production callback for client `1062520458416771092`:

```
https://<your domain>/api/auth/discord/callback
```

In production `resolveAppOrigin()` in `studio/lib/auth.ts` always uses
`NEXT_PUBLIC_APP_URL` for the `redirect_uri` rather than the request's `Host`
header — trusting the header would let a forged one redirect a victim's auth
code to an attacker's origin. So the domain in `NEXT_PUBLIC_APP_URL` and the
one registered at Discord have to agree exactly, scheme included.

## 11. Updating later

After §8's `chown`, the tree belongs to `aesthetic` and your login user cannot
write to it, so `git pull` fails with `unable to write ...` or a detached
HEAD. Run the update as the service user:

```bash
cd /opt/aesthetic-king
sudo systemctl stop aesthetic-studio
sudo -u aesthetic git pull
sudo -u aesthetic npm ci
cd studio && sudo -u aesthetic npm ci && sudo -u aesthetic npm run build:node && cd ..
sudo -u aesthetic npx prisma generate
sudo -u aesthetic npx prisma migrate deploy
sudo systemctl start aesthetic-studio
```

Stop the site before rebuilding rather than restarting after: `build:node`
replaces `dist/` in place, and a running server reading a half-written bundle
is the sort of failure that resolves itself before you look at the journal.

Restart the bot too if the pull touched `src/` or `prisma/`:

```bash
sudo systemctl restart aesthetic-bot
```

Both units have `Restart=always`, so `stop` is a real stop (systemd remembers
it) and only `start`/`restart` bring them back.

If `git pull` complains about `safe.directory`, git is refusing to operate on a
tree owned by someone else. Either keep using `sudo -u aesthetic` as above, or
register it once:

```bash
sudo git config --system --add safe.directory /opt/aesthetic-king
```

---

## Still blocked on external setup

These are not deployment steps and cannot be finished from the code:

- **Where Ollama runs** — decided: the VM points at
  `http://10.40.10.167:11434`, a machine on the home `10.40.10.x` network. The
  remaining unknown is whether the VM's `10.40.99.x` network can route there.
  Confirm from the VM with `curl -m 5 http://10.40.10.167:11434/api/version`; if
  it times out, add a route or move Ollama onto the VM. Nothing else breaks if
  it stays unreachable — the apps boot and only AI generation fails, at call
  time.
- **DNS for `aesthetic.etterdigital.dev`** — done for this deployment: the
  hostname is a proxied `CNAME` to
  `f37ee879-eb6e-421b-8a59-bd63e222fd61.cfargotunnel.com` (tunnel
  `aesthetic-studio`), and `https://aesthetic.etterdigital.dev/` serves the
  Studio. Keep in mind that adding the *Published application* route only
  creates the record when the hostname was not already routed somewhere else,
  and that deleting a route deletes the record — see the traps in §9a.
- **`STRIPE_WEBHOOK_SECRET`** — done for `aesthetic.etterdigital.dev`: endpoint
  `we_1UNDv9CkTi4OEW1yuiShRn4E` is enabled on the test account and subscribed to
  `checkout.session.completed`, `invoice.paid`, `invoice.payment_succeeded`,
  `customer.subscription.deleted` and `charge.refunded` on API version
  `2026-08-26.dahlia`. Copy its `whsec_…` into the env file. Premium is not
  activated by the checkout itself; only the webhook does that, so billing
  appears to take money and grant nothing until this is wired up. A live-key
  deployment needs its **own** endpoint — the test secret will not sign live
  events, and the payloads must be created against the same API version the app
  reads.
- **`TOPGG_WEBHOOK_SECRET`** — same story for
  `https://<domain>/api/webhooks/topgg`.
- **`CHIME_WEBHOOK_SECRET`** — and for
  `https://<domain>/api/webhooks/chime`. Chime's payload shape is not
  documented, so the route accepts `user`, `userId`, `user_id`, `discordId`
  or `discord_id` and treats a missing `type` as a vote; every candidate is
  validated as a snowflake, so an unrecognised shape answers `400` rather than
  crediting somebody arbitrary. If Chime lets you choose the format, match
  Top.gg (`Authorization` header, `user` field). Until the secret is set the
  route answers `404`, the `chime_vote` Crown source is hidden on the Earn
  page, and `/vote` does not mention Chime — set `CHIME_BOT_URL` as well or
  the listing stays invisible even once votes can be paid.
- **Patch notes** — nothing publishes `PatchNote` rows, so `/patch-notes` has
  nothing to show and the Studio bell stays quiet until you run
  `node scripts/seedPatchNotes.js <notes.json> --apply` (see
  `scripts/patch-notes.example.json`).
- **Stripe customer portal** — not enabled on the account, so the "manage
  subscription" link has no destination.
- **Re-inviting the bot on existing servers** — the Role maker needs Manage
  Roles, which is a new consent bit; an owner has to run the invite again.
