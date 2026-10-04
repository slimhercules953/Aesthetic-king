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

Every generation command except `/bio` accepts a `pack` option (autocomplete over the server's enabled Packs) and honours the server's default Pack, so a configured Pack reaches all of them rather than `/aesthetic` alone.

All responses are **embed-first**: polished Discord embeds rather than plain text, including errors, permission denials, and configuration confirmations. Generated creative content is public; anything directed at one person — permission denials, errors, and every "you need Premium" upsell — is ephemeral, so nobody is called out in channel for hitting a lock. Because Discord fixes ephemerality when a response is sent, a command must evaluate the entitlement check *before* it defers; `buildPremiumLockedReply()` in `src/components/embeds/premiumLocked.js` is the only sanctioned way to answer a lock. `/premium` is the deliberate exception — a plan and Crown balance are nothing to hide, and its link to the unlock page is worth showing to the whole channel.

### Server Configuration

Servers are configured from the Studio (see below), and the bot reads all of it live from PostgreSQL — no restart, and changes apply to the next command rather than to messages already sent.

- **Generation** — a channel that restricts generation commands, plus a default aesthetic/mood.
- **Commands** — enable or disable any command per server.
- **Aesthetic Packs** — curated presets, with one set as the server default.
- **Appearance** — embed colour, footer text, and which parts of a reply are shown.
- **Access** — allow/deny rules by role or channel.
- **Analytics** — usage over the last 30 days.

### Pack Resolution

Packs are presets, not overrides. Explicit user choices always win:

```text
Explicit command option → selected Pack → server default Pack
→ server default aesthetic/mood → normal command behavior
```

A Pack influences generation in two different ways, and the distinction matters:

- **Filters** (`aestheticId`, `moodId`) are *defaults* that sit below whatever the person typed on the command line.
- **Content** (`colors`, `symbols`) *replaces* the aesthetic's own output — curated colors drive `/palette` mixes and `/theme` swatches (when at least two are set), and curated symbols lead `/symbols` and the AI symbol prompts. `/username` deliberately ignores pack symbols because usernames forbid decorative characters.

`src/services/aesthetics/packContextService.js` implements this ladder once (`resolveGenerationContext`) and every generation command calls it. A Pack the person named explicitly but which no longer resolves produces an ephemeral "that Pack is unavailable" reply rather than silently generating unrelated content. Reroll buttons carry the resolved Pack in short-lived interaction state, so "Generate Another" keeps the Pack.

---

## The Studio

A web workspace at [`studio/`](studio/) — Vinext (React Server Components) deployed to Cloudflare Workers, authenticated with Discord OAuth. Users see only servers they own or can manage (Administrator / Manage Server), and only where the bot is installed.

### Current pages

- **Create Studio** — prompt-driven aesthetic generation with reroll/regenerate
- **Palette Studio** — build and save color palettes
- **Aesthetics / Assets / Collections** — saved library with search and detail views
- **Discover** — community feed of shared aesthetics (likes + comments)
- **My Servers → Server Studio** — per-server Overview, Generation settings, Command management, Aesthetic Packs, Appearance, Access, and Analytics
- **Profile Builder** — build a Discord identity against a live card preview, with **Complete My Profile** filling the whole thing from one seed element (a set, an aesthetic, a colour, or your own palette)
- **Premium** — plan comparison, usage meters, Crowns balance, billing status

### Server Studio

Every Server Studio tab is backed by real state — the Overview reports what is actually configured ("Generation locked to #general", "3 packs created", "2 deny rules", "17 generations in 30 days") rather than static copy, and links to all six areas.

**Appearance** changes how the bot's replies look in one server: embed colour, footer text, and whether the pack badge, generated images, and reroll buttons are shown. Rather than touching every reply site, [`src/services/database/guildAppearanceService.js`](src/services/database/guildAppearanceService.js) wraps `reply`/`editReply`/`update`/`followUp` once per interaction. When nothing is customised, `applyGuildAppearance()` returns the *identical* payload object, so the patch costs nothing in the overwhelmingly common case. Two details are worth knowing before editing it: `EmbedBuilder.setImage(null)` writes `image: null`, which the Discord API rejects, so image removal deletes the key instead; and when a custom footer replaces a builder's own footer the expiry notice is re-added to the description, but only if the previous footer actually mentioned expiry.

**Access** decides who may use the bot, as ordered allow/deny rules over roles and channels. The semantics are identical in both codebases and are worth stating once: no rules means open; a matching DENY denies unconditionally; if any ALLOW exists the member must match one; otherwise it is open. The bot fails **open** on a database error — losing the bot briefly is better than locking a whole server out of a broken query — while the Studio returns 502 so the owner sees the failure.

**Analytics** reads a `GuildUsageEvent` append-only log written by the bot after a command resolves. That table deliberately has **no foreign keys** and `recordUsageEvent()` swallows every error, because logging must never be able to fail a user's command.

All three are guarded by `requireManagedGuild()` (pages) and `guardGuildAccess()` (API routes), which re-verify Discord ownership or Manage Server on every request — a client-supplied guild ID is never trusted.

### Data access

Every Studio query goes through [`studio/lib/database.ts`](studio/lib/database.ts), which holds one `pg.Pool` per isolate and reads `HYPERDRIVE.connectionString`. Do not add a helper that opens its own `pg.Client`: connecting costs a TCP handshake plus backend startup plus auth, so a page that issued three queries would pay for three connections. Hyperdrive is designed to multiplex many pooled clients across isolates onto a small pool of real backends, so pooling is what makes it fast.

`withTransaction()` checks a client out of that pool for the duration of a `BEGIN`/`COMMIT` — Crown spending depends on it being atomic. Inside the callback use the `client` it hands you, never the module-level `query()`, which would run on a different connection outside the transaction.

Because these are hand-written queries, **qualify every column in a joined query**. `Guild`, `GuildSettings`, `GuildAccessRule` and `GuildUsageEvent` all carry `createdAt`/`updatedAt`, and most Studio queries join `"Guild" g` to resolve a Discord ID — an unqualified `"createdAt"` there is a runtime `500` that TypeScript cannot see.

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

Standalone scripts in [`scripts/`](scripts/): `testDatabase.js`, `testR2.js`, `testOllama.js`, `testColors.js`, `testRenderer.js`, `testAestheticService.js`, `testPremiumGate.js`, `testPremiumStatus.js`, `testUserService.js`, `testSavedAestheticService.js`, `testStudioPhase2.js`, `testAssetExplorer.js`, `testProfileBuilder.js`, `testCompleteProfile.js`, `testGuildSettingsPatch.js`, `testCrownEarning.js`, plus asset catalog tooling (`generateAssetCatalog.js`, `seedAssetClassifications.js`, `tagAssetSet.js`, `tagAssetCatalog.js`) and command management (`clearGlobalCommands.js`, `clearGuildCommands.js`, `deleteGuildCommand.js`). Run individually, e.g. `node scripts/testDatabase.js`.

`node scripts/testPremiumGate.js` verifies the bot-side Premium Assets gate: that a free user is never handed a premium set (catalog path and R2 path), that an unlocked user still is, that premium-only filters produce the upsell rather than an empty-library reply, that plans resolve from live entitlements, and that every upsell is answered ephemerally.

`node scripts/testPremiumStatus.js` verifies `/premium`: Crown balance arithmetic, that expired unlocks and BOOST unlocks are excluded, that stacked purchases collapse to the latest expiry, and that the command renders for both plans. It seeds a fixture user and deletes it again.

`node scripts/testStudioPhase2.js` covers the Server Studio features against the real database without needing Discord: access-rule evaluation (open by default, deny precedence, allow-list behaviour, role and channel targets), the appearance patch (colour, footer, pack badge, image stripping, reroll-button removal, and that default settings return the identical payload), usage-event logging, and a "Studio SQL" section that runs the Studio's hand-written queries — the appearance upsert, rule upsert/delete, analytics aggregates — against the real schema, since the Studio has no Prisma client and nothing else checks that SQL. It creates a throwaway guild and deletes it again.

`node scripts/testAssetExplorer.js` covers the Asset Explorer query layer (`studio/lib/assetQuery.ts`) without a browser or a database: that every catalog set is tagged, that filter and sort state round-trips through the URL, that values within a facet are OR'd while facets are AND'd, that every sort is a permutation of its input, and that facet counts preview the narrowing a chip would cause. It transpiles the TypeScript module with the Studio's own esbuild, so it tests shipped code rather than a copy.

`node scripts/testProfileBuilder.js` covers the Profile Builder model (`studio/lib/profileModel.ts`) the same way, also without a browser or a database: that text clamping counts code points so emoji survive, that hex/palette/symbol/discriminator normalisation dedupes, caps and preserves palette order, that a save truncates noise but refuses a profile that could not be drawn, that the preview's text colour clears WCAG contrast on every derived background, and that the free-tier version limit bites at exactly one profile.

`node scripts/testCompleteProfile.js` covers Complete My Profile (`studio/lib/profileComposer.ts` and `studio/lib/profileCompletion.ts`) without a browser or a database: that every aesthetic and every catalog colour in the catalog produces a profile with all seven fields filled, that the bio describes the aesthetic it was built from rather than the mood, that a palette is anchored to the seed colour, that a seed the composer does not know degrades instead of failing, that the exact JSON the Builder posts parses — the layer where a camelCase `kind` once made every profile-set seed 400 in the browser while the composer tests stayed green — and, with Ollama stubbed, that the AI prompt names the seeded aesthetic with its catalog description rather than the chosen set's tags, and that the username guard keeps Discord-legal names like `cupcake_puff` while rejecting handles, dots and stray underscores.

`node scripts/testGuildSettingsPatch.js` covers the server settings PATCH (`studio/lib/guildSettings.ts`) against the real database: that one save writes channel, aesthetic and mood together, that patching one column preserves the others, that an explicit `null` clears a column, that repeated saves update the row rather than adding one, and that an empty patch or an uninstalled guild is refused. It also checks the generated SQL directly — the guild id is always the first parameter, only patched columns appear in the statement, and `createdAt`/`updatedAt` are always written. It creates a throwaway guild and deletes it again.

`node scripts/tagAssetCatalog.js` regenerates the `tags` array on every catalog set from the aesthetics, moods and colors already in `src/data/assetCatalog.json`. It is deterministic and safe to re-run after `generateAssetCatalog.js`; pass `--dry-run` to preview. See *Catalog tags* in [`studio/README.md`](studio/README.md).

`node scripts/testCrownEarning.js` covers the Crowns earn layer (`studio/lib/crownEarning.ts`) without a database, against a fake `database` module that is a real in-memory ledger rather than a set of canned answers: that each source pays its configured amount, that per-source caps and the daily total cap bite at exactly the right award, that a repeated event is refused by its idempotency key, that self-likes and self-comments pay nothing, that a like and a comment still pay the *author* when someone else acts, that an unknown Discord id invents no row, and that a failed award is swallowed instead of thrown. Its last section drives the actual Top.gg webhook route with `next/server` stubbed, checking that an unconfigured deployment answers 404, a missing or wrong secret 401, a malformed body 400, that `test` and `revote` deliveries are acknowledged but pay nobody, that a real vote pays the voter exactly once even when Top.gg retries the delivery, and that a vote from an unknown account creates nothing, and that a source which cannot fire on the current deployment (a Top.gg vote with no webhook configured) is left off the Earn page rather than advertised — while a source with rows already paid under it stays visible so the history never silently shrinks.

---

## Security Model

- OAuth tokens are never stored in browser sessions; Discord OAuth credentials are encrypted at rest (`OAUTH_TOKEN_ENCRYPTION_KEY`)
- Studio sessions are signed (`SESSION_SECRET`); sensitive routes verify authorization independently
- Server management routes re-verify Discord ownership/permissions — client-supplied guild IDs are never trusted
- Server content is isolated per guild; private content never becomes community content automatically
- Dev routes that mint Premium/Crowns fail closed (production by default, empty allowlist denies all)

---

## Roadmap

The product direction is incremental. Current foundation: bot V2, aesthetic/mood system, R2 assets with color extraction, profile rendering, Ollama AI, Discord OAuth, PostgreSQL persistence, My Servers, Server Studio (generation settings, command management, Aesthetic Packs, Appearance, Access, Analytics), Asset Explorer (URL-persisted filters, tags, sorting), Create/Palette Studio, Favorites, Collections, Discover feed, Profile Builder (live-preview Discord profile composition), Complete My Profile (deterministic identity composition from one seed element, optional AI copy), and the Premium/entitlement framework.

| Phase | Focus |
|---|---|
| **1** ✅ | Finish meaningful Pack integration across `/profile`, `/theme`, `/palette`, `/symbols`, `/status`, `/username` (not `/bio`); improve Pack defaults |
| **2** ✅ | Complete Server Studio: Overview, Appearance, Access, Analytics |
| **3** ✅ | Asset Explorer — searchable R2 library with aesthetic/mood/color metadata, tags, filters, profile sets |
| **4** ✅ | Profile Builder — visual Discord-style profile construction with live preview |
| **5** ✅ | Complete My Profile — coordinate a full identity from one starting element (PFP, banner, palette, aesthetic…) |
| **6** 🔄 | Finalize Free/Premium boundaries and the Crowns economy — earn via community participation and Top.gg votes; spend on individual premium actions. Earn side shipped: `studio/lib/crownEarning.ts` is the only path Crowns enter the ledger through (publish, likes, comments, daily visit), with per-source and daily-total caps counted out of the ledger itself and an idempotency key per event so nothing can be farmed. Top.gg votes are built and tested but stay hidden until the Studio has a public URL for the webhook. Spend side shipped: prices are set against a deliberate rule — a month of Crown-buyable access costs at least twice the most an account could possibly earn in a month, so nobody farms a free month or saves up for a run of them, and timed unlocks cannot be stacked in advance. `testCrownEarning.js` asserts the rule |
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
