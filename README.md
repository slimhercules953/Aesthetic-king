# 👑 Aesthetic King

A creative identity platform for Discord. Aesthetic King helps users build complete, coordinated Discord identities — aesthetic, mood, palette, PFP, banner, username, bio, status, symbols — through a Discord bot and a web workspace called **Aesthetic King Studio**, backed by a shared PostgreSQL database.

The bot provides speed. Studio provides depth. **Aesthetic Packs** — reusable coordinated visual identities — connect the two.

```text
                 AESTHETIC KING

        ┌──────────────┬──────────────┐
        ▼              ▼              ▼
       BOT           STUDIO        COMMUNITY
        │              │              │
    Generate        Create         Discover
    Use Packs       Customize      Publish
    Quick Tools     Manage         Remix
        │              │              │
        └──────────────┼──────────────┘
                       ▼
              CREATIVE IDENTITY
                    PLATFORM
```

---

## Repository Layout

```text
.
├── src/                  # Discord bot (V2 architecture)
│   ├── commands/         # Slash commands (aesthetic, profile, theme, palette, ...)
│   ├── events/           # Gateway events (ready, interactionCreate, guildCreate/Delete)
│   ├── components/       # Embeds, buttons (embed-first response system)
│   └── services/         # Database, AI, colors, R2, rendering services
├── slash/                # Legacy V1 commands (kept for the v1 entry point only)
├── scripts/              # Command deployment, asset catalog, and test scripts
├── prisma/               # Shared schema + migrations (bot and Studio use one DB)
├── studio/               # Aesthetic King Studio (Vinext/React on Cloudflare Workers)
│   └── README.md         # Studio-specific docs (dev flags, migrations, billing notes)
└── index.js              # Legacy V1 bot entry point
```

---

## The Bot

Node.js + discord.js v14. Runs from `src/index.js`.

### Commands

| Command | Description |
|---|---|
| `/aesthetic` | Flagship: generates a coordinated profile concept (aesthetic, mood, colors, PFP, banner, palette, symbols, username, bio, status) with interactive rerolls and full Aesthetic Pack integration |
| `/profile` | Coordinated Discord profile concepts |
| `/theme` | Coordinated aesthetic themes |
| `/palette` | Aesthetic color palettes |
| `/palette-image` | Extract a palette from an uploaded image |
| `/legibility` | Checks whether text is readable over a background |
| `/symbols` | Aesthetic symbol sets by visual style |
| `/status` | Discord status ideas from aesthetic + mood |
| `/username` | Aesthetic username ideas |
| `/bio` | Aesthetic Discord bios |
| `/premium` | Read-only Premium plan, Crown balance and active unlocks, with a link to Studio |
| `/ping` | Diagnostic (always available, never Pack- or config-affected) |

All responses are **embed-first**: polished Discord embeds rather than plain text, including errors, permission denials, and configuration confirmations. Generated creative content is public; administrative messages are ephemeral. `/premium` is the deliberate exception — a plan and Crown balance are nothing to hide, and its link to the unlock page is worth showing to the whole channel.

### Server Configuration

Servers can be configured from the Studio (see below): a **generation channel** that restricts generation commands, a **default aesthetic/mood**, per-**command enable/disable**, and a **default Aesthetic Pack**. The bot reads all of this live from PostgreSQL.

### Pack Resolution

Packs are presets, not overrides. Explicit user choices always win:

```text
Explicit command option → selected Pack → server default Pack
→ server default aesthetic/mood → normal command behavior
```

---

## The Studio

A web workspace at [`studio/`](studio/) — Vinext (React Server Components) deployed to Cloudflare Workers, authenticated with Discord OAuth. Users see only servers they own or can manage (Administrator / Manage Server), and only where the bot is installed.

### Current pages

- **Create Studio** — prompt-driven aesthetic generation with reroll/regenerate
- **Palette Studio** — build and save color palettes
- **Aesthetics / Assets / Collections** — saved library with search and detail views
- **Discover** — community feed of shared aesthetics (likes + comments)
- **My Servers → Server Studio** — per-server Overview, Generation settings, Command management, and Aesthetic Packs management
- **Premium** — plan comparison, usage meters, Crowns balance, billing status

### Data access

Every Studio query goes through [`studio/lib/database.ts`](studio/lib/database.ts), which holds one `pg.Pool` per isolate and reads `HYPERDRIVE.connectionString`. Do not add a helper that opens its own `pg.Client`: connecting costs a TCP handshake plus backend startup plus auth, so a page that issued three queries would pay for three connections. Hyperdrive is designed to multiplex many pooled clients across isolates onto a small pool of real backends, so pooling is what makes it fast.

`withTransaction()` checks a client out of that pool for the duration of a `BEGIN`/`COMMIT` — Crown spending depends on it being atomic. Inside the callback use the `client` it hands you, never the module-level `query()`, which would run on a different connection outside the transaction.

### Premium, Crowns and feature gating

Entitlements, per-feature usage limits, and Crown prices live in a single registry: [`studio/lib/features.ts`](studio/lib/features.ts). **All numbers there are product placeholders** — change them there, never at call sites. Checkout is intentionally not connected; Premium is granted via provider webhook, Discord SKU, grandfathering, or dev-only grant routes (fail-closed behind `CROWN_DEV` / `BILLING_DEV` + `NODE_ENV=development` + Discord ID allowlists). See [`studio/README.md`](studio/README.md) for details.

The bot reads the same entitlements but cannot enforce every rule, so it enforces the one that matters where it can serve the goods: **Premium Assets**. [`src/services/entitlements/featureAccessService.js`](src/services/entitlements/featureAccessService.js) derives a user's plan from the `Entitlement` and `CrownUnlock` tables — it never stores a plan of its own, so revocations and grandfathered grants reach the bot the moment they reach the Studio. The two products present the lock differently on purpose: Studio shows premium sets to everyone with a crown badge and refuses to open them, because browsing is the upsell. The bot has no browse surface, so it keeps premium sets out of the pool and only mentions them when they were the *only* match for the user's filters. Which sets are premium is tagged in [`src/data/assetCatalog.json`](src/data/assetCatalog.json) and read by both.

A user who has never signed into Studio has no entitlement row and is therefore treated as FREE. That is deliberate — a paid feature should fail closed — but it means the bot cannot itself sell Premium or Crowns yet. [`src/commands/premium/premium.js`](src/commands/premium/premium.js) reports that status (`/premium`: plan, Crown balance, live unlocks, link to Studio) through [`src/services/entitlements/premiumStatusService.js`](src/services/entitlements/premiumStatusService.js), which reads the same tables and spends nothing.

---

## Tech Stack

| | |
|---|---|
| **Bot** | Node.js, discord.js v14, Prisma, PostgreSQL, Cloudflare R2, node-canvas, Ollama (self-hosted AI), PM2 |
| **Studio** | Vinext + Vite, React 19, TypeScript, Tailwind, Cloudflare Workers + Hyperdrive, Wrangler, Discord OAuth, Lucide |
| **Shared** | PostgreSQL (one schema, both apps), Cloudflare R2 asset bucket, Ollama |

---

## Getting Started

### Prerequisites

- Node.js 20+
- A PostgreSQL database (shared by bot and Studio)
- A Discord application (bot + OAuth2)
- A Cloudflare R2 bucket (PFP/banner assets)
- An Ollama instance reachable over HTTP (AI generation)

### 1. Configure environment

```bash
cp .env.example .env
```

| Variable | Used by | Purpose |
|---|---|---|
| `TOKEN` | Bot | Discord bot token |
| `CLIENT_ID` | Bot | Discord application ID |
| `DEV_GUILD_ID` | Bot | Guild for instant slash-command registration in dev |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET_NAME` | Bot, Studio | Asset storage |
| `R2_PUBLIC_URL` | Bot, Studio | Public bucket URL (`https://pub-<hash>.r2.dev` or custom domain) — required by `/profile` and `/theme` |
| `R2_ENDPOINT` | Bot | Optional endpoint override (defaults to the account's `r2.cloudflarestorage.com` host) |
| `OLLAMA_URL` / `OLLAMA_MODEL` | Bot, Studio | Self-hosted AI endpoint and model |
| `STUDIO_URL` | Bot | Optional Studio URL used in "unlock this" prompts; falls back to `NEXT_PUBLIC_APP_URL`, and to naming the path if neither is set |
| `DATABASE_URL` | Prisma | PostgreSQL connection string (migrations + bot) |
| `NODE_ENV` | Both | `development` enables dev-only tooling; anything else is treated as production |

Studio runs on Cloudflare Workers and reads its config from Wrangler bindings / `.dev.vars` (or `process.env`): `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `SESSION_SECRET`, `OAUTH_TOKEN_ENCRYPTION_KEY`, `HYPERDRIVE` connection string, `R2_PUBLIC_URL`, `OLLAMA_URL`, `OLLAMA_MODEL`, plus optional `GRANDFATHER_IDS`, `CROWN_DEV`, `BILLING_DEV`, `DEV_CROWNS_DISCORD_IDS`, `DEV_BILLING_DISCORD_IDS`. Never commit these.

### 2. Database

```bash
npx prisma migrate deploy   # or: npx prisma migrate dev
```

### 3. Run the bot

```bash
npm install
npm run dev                          # start the bot
npm run deploy                       # register slash commands (guild-scoped)
node scripts/deployGlobalCommands.js # publish commands globally
```

### 4. Run the Studio

```bash
cd studio
npm install
npm run dev      # local dev server
npm run build
npm run deploy   # deploy to Cloudflare Workers
```

### Tests & utilities

Standalone scripts in [`scripts/`](scripts/): `testDatabase.js`, `testR2.js`, `testOllama.js`, `testColors.js`, `testRenderer.js`, `testAestheticService.js`, `testPremiumGate.js`, `testPremiumStatus.js`, `testUserService.js`, `testSavedAestheticService.js`, plus asset catalog tooling (`generateAssetCatalog.js`, `seedAssetClassifications.js`, `tagAssetSet.js`) and command management (`clearGlobalCommands.js`, `clearGuildCommands.js`, `deleteGuildCommand.js`). Run individually, e.g. `node scripts/testDatabase.js`.

`node scripts/testPremiumGate.js` verifies the bot-side Premium Assets gate: that a free user is never handed a premium set (catalog path and R2 path), that an unlocked user still is, that premium-only filters produce the upsell rather than an empty-library reply, and that plans resolve from live entitlements.

`node scripts/testPremiumStatus.js` verifies `/premium`: Crown balance arithmetic, that expired unlocks and BOOST unlocks are excluded, that stacked purchases collapse to the latest expiry, and that the command renders for both plans. It seeds a fixture user and deletes it again.

---

## Security Model

- OAuth tokens are never stored in browser sessions; Discord OAuth credentials are encrypted at rest (`OAUTH_TOKEN_ENCRYPTION_KEY`)
- Studio sessions are signed (`SESSION_SECRET`); sensitive routes verify authorization independently
- Server management routes re-verify Discord ownership/permissions — client-supplied guild IDs are never trusted
- Server content is isolated per guild; private content never becomes community content automatically
- Dev routes that mint Premium/Crowns fail closed (production by default, empty allowlist denies all)

---

## Roadmap

The product direction is incremental. Current foundation: bot V2, aesthetic/mood system, R2 assets with color extraction, profile rendering, Ollama AI, Discord OAuth, PostgreSQL persistence, My Servers, Server Studio (generation settings, command management, Aesthetic Packs), Create/Palette Studio, Favorites, Collections, Discover feed, and the Premium/entitlement framework.

| Phase | Focus |
|---|---|
| **1** | Finish meaningful Pack integration across `/profile`, `/theme`, `/palette`, `/symbols`, `/status`, `/username` (not `/bio`); improve Pack defaults |
| **2** | Complete Server Studio: Overview, Appearance, Access, Analytics |
| **3** | Asset Explorer — searchable R2 library with aesthetic/mood/color metadata, tags, filters, profile sets |
| **4** | Profile Builder — visual Discord-style profile construction with live preview |
| **5** | Complete My Profile — coordinate a full identity from one starting element (PFP, banner, palette, aesthetic…) |
| **6** | Finalize Free/Premium boundaries and the Crowns economy (earn via community participation, Top.gg votes; spend on individual premium actions) |
| **7** | Community — publish Packs/profiles to Discover, creator profiles, search/filters, remixing with attribution, creator analytics |

### Design constraints

- **Stay focused.** No moderation suites, music, tickets, generic leveling, or generic AI chat. Before adding a feature, ask: *does this help someone create, discover, manage, share, or use a better Discord identity?*
- **Free stays useful.** Premium enhances creativity (Image-to-Aesthetic, advanced Profile Builder, premium assets, advanced exports, deeper analytics) rather than locking away the core product.
- **AI is an assistant, not the product.** Self-hosted via Ollama where practical.

### North star

> *"I want my Discord profile to look better, but I don't know where to start."*

Aesthetic King takes a user from that sentence to a complete, saved, shareable identity — across Discord and Studio.

---

## License

ISC
