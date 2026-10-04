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
| `/color` | Members claim a coloured name role for themselves — free, opt-in per server (see below) |
| `/premium` | Read-only Premium plan, Crown balance and active unlocks, with a link to Studio |
| `/ping` | Diagnostic (always available, never Pack- or config-affected) |

Every generation command except `/bio` accepts a `pack` option (autocomplete over the server's enabled Packs) and honors the server's default Pack, so a configured Pack reaches all of them rather than `/aesthetic` alone.

All responses are **embed-first**: polished Discord embeds rather than plain text, including errors, permission denials, and configuration confirmations. Generated creative content is public; anything directed at one person — permission denials, errors, and every "you need Premium" upsell — is ephemeral, so nobody is called out in channel for hitting a lock. Because Discord fixes ephemerality when a response is sent, a command must evaluate the entitlement check *before* it defers; `buildPremiumLockedReply()` in `src/components/embeds/premiumLocked.js` is the only sanctioned way to answer a lock. `/premium` is the deliberate exception — a plan and Crown balance are nothing to hide, and its link to the unlock page is worth showing to the whole channel.

### Server Configuration

Servers are configured from the Studio (see below), and the bot reads all of it live from PostgreSQL — no restart, and changes apply to the next command rather than to messages already sent.

- **Generation** — a channel that restricts generation commands, plus a default aesthetic/mood.
- **Commands** — enable or disable any command per server.
- **Aesthetic Packs** — curated presets, with one set as the server default.
- **Appearance** — embed color, footer text, and which parts of a reply are shown.
- **Access** — allow/deny rules by role or channel.
- **Analytics** — usage over the last 30 days.

### Member Color Roles

`/color` is the one command that writes to the member list, so it is off until a server opts in, and it is deliberately built so that no path lets a member hand themselves privileges.

- `/color set <color> [name]` — claim a colour (`#C084FC` or a colour name). Free for everyone; no Premium gate.
- `/color remove` / `/color show` — take it back, or see what you hold and what is available. `remove` works even after a server disables the feature, because taking a colour back should never be blocked.
- `/color palette` — the server's approved colours, when the server is in palette mode.
- `/color config enable|disable|mode|palette-add|palette-remove` — owner/admin only (`ManageGuild`), checked in-handler rather than with `default_member_permissions`, which Discord only supports per-command and would have hidden the member half of the command.

Two invariants are re-checked against live Discord state at the moment of assignment, not just when the role was made:

1. **A receipt must exist.** A colour role is only self-assignable if a `GuildCosmeticRole` row records it as such — created by `/color`, by the Studio's Appearance tab, or explicitly approved into the palette. The bot never adopts a role it did not authorise, so an owner's pre-existing `Admin` role cannot be claimed by typing its hex.
2. **The role must still be harmless.** Zero permissions, not managed, not `@everyone`/`@here`. A receipt is not a permanent guarantee — if anyone later grants the role permissions, it stops being claimable.

Roles are shared per hex (everyone who picks `#C084FC` shares one `#C084FC` role) to stay under Discord's 250-role cap, and `#000000` is refused rather than mapped, because Discord reserves colour `0` for "this role has no colour".

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
- **Discover** — community feed of shared aesthetics, palettes, asset sets, composed Profiles and server Aesthetic Packs (likes, comments and **remixes**), with filter chips per type and public search over captions, tags, creators, aesthetic names, profile names and bios, pack names, descriptions and palette colors. Remixing copies a post into your own library and credits the original creator on the card
- **Creator profiles** — `/u/[discordId]`, a public projection of everything one account has published; every author name and avatar in the feed links to it. It lives outside the signed-in area on purpose, so a link works for someone who has never used the Studio
- **Creator Analytics** — `/dashboard/analytics` (Premium), reach and impressions per post over a 7/30/90-day window, with a daily trend. A "view" is a signed-in account, not a page load, and never the author
- **My Servers → Server Studio** — per-server Overview, Generation settings, Command management, Aesthetic Packs, Appearance (reply styling and a hex-code cosmetic role maker), Access, and Analytics
- **Profile Builder** — build a Discord identity against a live card preview, with **Complete My Profile** filling the whole thing from one seed element (a set, an aesthetic, a color, or your own palette)
- **Premium** — plan comparison, usage meters, Crowns balance, billing status

### Server Studio

Every Server Studio tab is backed by real state — the Overview reports what is actually configured ("Generation locked to #general", "3 packs created", "2 deny rules", "17 generations in 30 days") rather than static copy, and links to all six areas.

**Appearance** changes how the bot's replies look in one server: embed color, footer text, and whether the pack badge, generated images, and reroll buttons are shown. Rather than touching every reply site, [`src/services/database/guildAppearanceService.js`](src/services/database/guildAppearanceService.js) wraps `reply`/`editReply`/`update`/`followUp` once per interaction. When nothing is customized, `applyGuildAppearance()` returns the *identical* payload object, so the patch costs nothing in the overwhelmingly common case. Two details are worth knowing before editing it: `EmbedBuilder.setImage(null)` writes `image: null`, which the Discord API rejects, so image removal deletes the key instead; and when a custom footer replaces a builder's own footer the expiry notice is re-added to the description, but only if the previous footer actually mentioned expiry.

The same tab also turns a hex code into a **cosmetic role** for the server, through [`studio/lib/guildRoles.ts`](studio/lib/guildRoles.ts) and `createGuildRole()` in [`studio/lib/discordBot.ts`](studio/lib/discordBot.ts). The role is decoration and nothing else: the payload is hard-coded to `permissions: "0"`, `hoist: false`, `mentionable: false`, and the API route forwards only a name and a color, so no request can widen it. `permissions: "0"` is load-bearing — omitting it gives a new role Discord's default derived permissions, which would turn a coloured name into a privilege. Two behaviours are deliberate: `#000000` is refused rather than accepted, because Discord reserves colour `0` for "no role colour" and renders black as default grey; and recording the role in `GuildCosmeticRole` is **best-effort**, because the role already exists on Discord by then, so reporting a failed insert as a failed create would make the owner press the button again and create a second role. Deleting an entry forgets the receipt and never deletes the Discord role. This is the only moderation-flavoured permission in the invite bitfield, so **existing installs must re-run the invite once** for Manage Roles to take effect; until they do, the card says so and links to the invite instead of failing.

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
| `STUDIO_URL` | Bot | Optional **public** Studio URL used in "unlock this" prompts and Studio footer links; falls back to `NEXT_PUBLIC_APP_URL`, and to naming the path if neither is set. A localhost/LAN address is ignored (it would be unreadable to whoever sees the embed) unless `STUDIO_URL_ALLOW_PRIVATE=true` |
| `DATABASE_URL` | Prisma | PostgreSQL connection string (migrations + bot) |
| `NODE_ENV` | Both | `development` enables dev-only tooling; anything else is treated as production |

Studio runs on Cloudflare Workers and reads its config from Wrangler bindings / `.dev.vars` (or `process.env`): `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `SESSION_SECRET`, `OAUTH_TOKEN_ENCRYPTION_KEY`, `HYPERDRIVE` connection string, `R2_PUBLIC_URL`, `OLLAMA_URL`, `OLLAMA_MODEL`, plus optional `GRANDFATHER_IDS`, `CROWN_DEV`, `BILLING_DEV`, `DEV_CROWNS_DISCORD_IDS`, `DEV_BILLING_DISCORD_IDS`, `TOPGG_WEBHOOK_SECRET` and the Stripe variables below. Never commit these.

#### Stripe checkout

Checkout is off until it is configured, and it stays honest while off: the billing page says checkout is unavailable instead of showing plans it cannot sell, and `/api/billing/checkout` answers 404. To switch it on:

1. Create one **recurring** price for Premium Monthly and one-time prices for the Quarter and Annual passes in Stripe, and copy each `price_…` id into `PREMIUM_MONTHLY_PRICE_ID`, `PREMIUM_QUARTER_PRICE_ID` and `PREMIUM_ANNUAL_PRICE_ID`. A plan with an empty id is not offered, so plans can be enabled one at a time.
2. Set `STRIPE_SECRET_KEY` (`sk_test_…` until you mean it).
3. Subscribe a webhook to `https://<your-app>/api/webhooks/stripe` for `checkout.session.completed`, `invoice.paid`, `customer.subscription.deleted` and `charge.refunded`, and set `STRIPE_WEBHOOK_SECRET` to the signing secret it gives you.
4. Set `NEXT_PUBLIC_APP_URL` to the app's public origin — checkout builds its redirect URLs from it and refuses to trust the `Host` header in production.

`PAYMENT_PROVIDER` selects the adapter and defaults to `stripe`; an unrecognised value disables checkout rather than guessing. `PREMIUM_*_DISPLAY_PRICE` override the price text shown on each card, which is copy only — the amount charged always comes from the Stripe price object, never from the browser.

Money moves in one direction only: the browser is redirected to a Stripe-hosted page, and the only thing the app trusts afterwards is the signature-verified webhook payload. The Discord id being credited is read back from that payload, not from the checkout form, and every delivery is claimed once by `(provider, externalEventId)` so a retry cannot grant Premium twice.

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

Standalone scripts in [`scripts/`](scripts/): `testDatabase.js`, `testR2.js`, `testOllama.js`, `testColors.js`, `testRenderer.js`, `testAestheticService.js`, `testPremiumGate.js`, `testPremiumStatus.js`, `testUserService.js`, `testSavedAestheticService.js`, `testStudioPhase2.js`, `testAssetExplorer.js`, `testProfileBuilder.js`, `testCompleteProfile.js`, `testGuildSettingsPatch.js`, `testCrownEarning.js`, `testCreatorProfiles.js`, `testRemix.js`, `testResolvedSetAttributes.js`, `testCreatorAnalytics.js`, `testGuildRoles.js`, `testDevTools.js`, plus asset catalog tooling (`generateAssetCatalog.js`, `seedAssetClassifications.js`, `tagAssetSet.js`, `tagAssetCatalog.js`) and command management (`clearGlobalCommands.js`, `clearGuildCommands.js`, `deleteGuildCommand.js`). Run individually, e.g. `node scripts/testDatabase.js`.

`node scripts/testPremiumGate.js` verifies the bot-side Premium Assets gate: that a free user is never handed a premium set (catalog path and R2 path), that an unlocked user still is, that premium-only filters produce the upsell rather than an empty-library reply, that plans resolve from live entitlements, and that every upsell is answered ephemerally. The ephemerality section runs the real `/profile`, `/theme` and reroll-button handlers against a fake interaction with the entitlement and pick steps stubbed, so it catches a call site that defers before gating — not just source text that happens to look right.

`node scripts/testPremiumStatus.js` verifies `/premium`: Crown balance arithmetic, that expired unlocks and BOOST unlocks are excluded, that stacked purchases collapse to the latest expiry, and that the command renders for both plans. It seeds a fixture user and deletes it again.

`node scripts/testStudioPhase2.js` covers the Server Studio features against the real database without needing Discord: access-rule evaluation (open by default, deny precedence, allow-list behavior, role and channel targets), the appearance patch (color, footer, pack badge, image stripping, reroll-button removal, and that default settings return the identical payload), usage-event logging, and a "Studio SQL" section that runs the Studio's hand-written queries — the appearance upsert, rule upsert/delete, analytics aggregates — against the real schema, since the Studio has no Prisma client and nothing else checks that SQL. It creates a throwaway guild and deletes it again.

`node scripts/testAssetExplorer.js` covers the Asset Explorer query layer (`studio/lib/assetQuery.ts`) without a browser or a database: that every catalog set is tagged, that filter and sort state round-trips through the URL, that values within a facet are OR'd while facets are AND'd, that every sort is a permutation of its input, and that facet counts preview the narrowing a chip would cause. It transpiles the TypeScript module with the Studio's own esbuild, so it tests shipped code rather than a copy.

`node scripts/testProfileBuilder.js` covers the Profile Builder model (`studio/lib/profileModel.ts`) the same way, also without a browser or a database: that text clamping counts code points so emoji survive, that hex/palette/symbol/discriminator normalization dedupes, caps and preserves palette order, that a save truncates noise but refuses a profile that could not be drawn, that the preview's text color clears WCAG contrast on every derived background, and that the free-tier version limit bites at exactly one profile.

`node scripts/testCompleteProfile.js` covers Complete My Profile (`studio/lib/profileComposer.ts` and `studio/lib/profileCompletion.ts`) without a browser or a database: that every aesthetic and every catalog color in the catalog produces a profile with all seven fields filled, that the bio describes the aesthetic it was built from rather than the mood, that a palette is anchored to the seed color, that a seed the composer does not know degrades instead of failing, that the exact JSON the Builder posts parses — the layer where a camelCase `kind` once made every profile-set seed 400 in the browser while the composer tests stayed green — and, with Ollama stubbed, that the AI prompt names the seeded aesthetic with its catalog description rather than the chosen set's tags, and that the username guard keeps Discord-legal names like `cupcake_puff` while rejecting handles, dots and stray underscores.

`node scripts/testGuildSettingsPatch.js` covers the server settings PATCH (`studio/lib/guildSettings.ts`) against the real database: that one save writes channel, aesthetic and mood together, that patching one column preserves the others, that an explicit `null` clears a column, that repeated saves update the row rather than adding one, and that an empty patch or an uninstalled guild is refused. It also checks the generated SQL directly — the guild id is always the first parameter, only patched columns appear in the statement, and `createdAt`/`updatedAt` are always written. It creates a throwaway guild and deletes it again.

`node scripts/tagAssetCatalog.js` regenerates the `tags` array on every catalog set from the aesthetics, moods and colors already in `src/data/assetCatalog.json`. It is deterministic and safe to re-run after `generateAssetCatalog.js`; pass `--dry-run` to preview. See *Catalog tags* in [`studio/README.md`](studio/README.md).

`node scripts/testCrownEarning.js` covers the Crowns earn layer (`studio/lib/crownEarning.ts`) without a database, against a fake `database` module that is a real in-memory ledger rather than a set of canned answers: that each source pays its configured amount, that per-source caps and the daily total cap bite at exactly the right award, that a repeated event is refused by its idempotency key, that self-likes and self-comments pay nothing, that a like and a comment still pay the *author* when someone else acts, that an unknown Discord id invents no row, and that a failed award is swallowed instead of thrown. Its last section drives the actual Top.gg webhook route with `next/server` stubbed, checking that an unconfigured deployment answers 404, a missing or wrong secret 401, a malformed body 400, that `test` and `revote` deliveries are acknowledged but pay nobody, that a real vote pays the voter exactly once even when Top.gg retries the delivery, and that a vote from an unknown account creates nothing, and that a source which cannot fire on the current deployment (a Top.gg vote with no webhook configured) is left off the Earn page rather than advertised — while a source with rows already paid under it stays visible so the history never silently shrinks.

`node scripts/testCreatorProfiles.js` covers the Phase 7 creator surface (`studio/lib/creator.ts`, `studio/lib/creatorHref.ts`, `studio/lib/feedSearch.ts`) — the first code that takes a URL string and uses it to select other people's content. Offline it asserts that a non-snowflake ID never reaches SQL, that a search term is only ever a bound parameter with its `ILIKE` wildcards escaped, that each search match branch carries its own item-type guard (without one, the `LEFT JOIN`ed item rows make every post match every term), and that every `$n` placeholder has a parameter. Against the real database — skipped, not failed, when none is reachable — it seeds a throwaway user with two posts and checks the profile's counts and tag aggregation, creator lookup by display name and by tag, and that a term matching only internal IDs leaks nothing.

`node scripts/testRemix.js` covers remixing with attribution (`studio/lib/remix.ts`). Offline, over a fake adapter, it checks the order of operations — a missing post, a self-remix and an asset post are all refused before any `INSERT`, and the asset refusal happens before the premium lookup — and inspects the copy's SQL: the source post id and the author's internal id are bound rather than concatenated, the owner is resolved from `discordId` rather than trusted from the caller, both timestamps are written, and `generationId` is a literal `NULL` because the column is `UNIQUE`. It also asserts the reward and the notice are written only *after* the copy exists. Against the real database with nothing stubbed, it proves what a fake cannot: that the Crown idempotency key `remix_received:<post>:<remixer>` really does make a repeat remix free while a second remixer still pays, that the notification's `dedupeKey` unique index holds, that a remix is not auto-published, and — the check the schema exists for — that unsharing the original leaves the copy in the remixer's library still crediting its author. It skips rather than fails when no database is reachable.

`node scripts/testCreatorAnalytics.js` covers the creator analytics data layer (`studio/lib/creatorAnalytics.ts`). Offline it inspects the write and reads directly: that the view upsert targets the `(userId, postId)` key and bumps a counter rather than inserting a second row, that it leaves `firstViewAt` alone so history is not rewritten, that the author is excluded *inside* the statement rather than with a second round trip, that a malformed viewer id or empty post id never reaches SQL, that a no-op write is classified as `self` or `not-found` from one lookup, that a database failure propagates instead of being reported as a recorded view, and that the window is clamped to 1..90 everywhere it is bound (a `NaN` there would otherwise reach a `::int` placeholder and throw). Against the real database it proves the thing a fake cannot: that repeat views really do collapse into one row while still counting as multiple impressions, that the author's own view is refused, that reach counts people while views count lookings, and that a 30-day trend returns thirty buckets with quiet days present as zeroes — the check that caught `generate_series` running backwards and returning an empty chart. It skips rather than fails when no database is reachable.

`node scripts/testPublishToDiscover.js` covers publishing Profiles and server Aesthetic Packs to the Discover feed — the change that widens the polymorphic `SharedPost` feed with two new `SharedItemType` members, `PROFILE` and `PACK`. Offline (a fake `database` adapter, `next/server` stubbed, the real pure `features.ts` loaded) it checks the enum and its migration, that `assertPublishableItem` refuses to publish someone else's item and rejects `PACK` on the generic path (a pack's entitlement is a Discord permission, so it publishes only through the guild-scoped route), that the ownership probe joins `User` rather than trusting a caller id, that hydration returns flat cards with each item's media under `.media` and `null` for a deleted source row, that FeedCard renders the pack and profile shapes, that the search SQL guards every match branch by item type and binds the term as a parameter, that the Discover chips expose both new types, that creator counts include both, and that a publish pays Crowns once per item under a `publish:<type>:<id>` key that survives unshare-and-republish. Against the real database it runs the whole round trip — publish, re-publish reuses the row, wrong-owner and wrong-guild are refused, hydration, search by name/colour/caption/tag, creator counts, the Crown ledger, and unpublish/delete cleanup — and checks that the Discover chip indexes exist and are actually used by a filtered, sorted query. It skips rather than fails when no database is reachable, and finishes with a `tsc --noEmit` type-check of the Studio.

`node scripts/runAllTests.js` runs every `scripts/test*.js` in one pass and prints a pass/fail table. It deliberately does not stop at the first failure — one broken suite used to hide the state of the twenty that followed it. Pass a substring to run a subset, e.g. `node scripts/runAllTests.js Payments`. `npm test` is the same thing.

`node scripts/testNotifications.js` covers the notification surface (`studio/lib/notifications.ts`, `NotificationsList.tsx`) without a browser: that an in-app notification is written for the events worth interrupting someone for and not for the rest, that a recipient can only read and dismiss their own, that unread counts drop as items are read, and that a notification for a deleted item still renders rather than throwing.

`node scripts/testFormAccessibility.js` scans the Studio's forms for controls with no accessible name — the kind of thing that only shows up if someone tries to use the page with a screen reader. It fails on a missing `label`/`aria-label`/`aria-labelledby` rather than warning, because a warning here has historically meant "nobody looks at it".

`node scripts/testPayments.js` covers the payment layer (`studio/lib/payments/`) end to end without a network call: that plan ids resolve only to prices actually configured, that a webhook body is rejected unless its `Stripe-Signature` HMAC verifies within the tolerance window (and that a signature under *either* secret passes, so a secret can be rotated without dropping deliveries), that one provider event can imply several app events, that a replayed delivery grants nothing twice, and that a failed grant releases its claim so the provider's retry can still succeed. It also asserts the security shape directly: the webhook verifies before it parses, `discordId` is only ever read from the verified payload and never from the browser, and nothing in the layer touches card data — checkout is a redirect to a provider-hosted page.

`node scripts/testGuildRoles.js` covers the cosmetic role maker (`studio/lib/guildRoles.ts`, the roles route and `ServerRoleMaker.tsx`) with the Discord layer stubbed. The central claim is that the feature paints names and grants nothing, so the assertions are all attempts to smuggle a permission through: the payload handed to Discord always carries `permissions: "0"`, `hoist: false` and `mentionable: false`, the lib forwards only a name and a colour, the route reads only `name` and `color` from the body, and the UI sends only those two keys. It also covers the hex handling (`#000000` refused because Discord reserves colour 0, three-digit shorthand expanded, non-strings rejected), the readability warning at WCAG AA 4.5:1 — including that every preset swatch passes it, since the card used to open showing its own warning — and that forgetting a role never issues a Discord call.

`node scripts/testDevTools.js` covers `studio/lib/devTools.ts`, the guard in front of the two routes that mint paid value. It is the smallest file in the Studio with the largest blast radius: if it ever returns `true` in production, any signed-in account can grant itself Premium or a Crown balance by posting to a URL, and the traffic would look legitimate. Every assertion is an attempt to get a `true` that should be a `false` — an unset allowlist, a dev flag left on in a production deploy, a `NODE_ENV` that is merely absent, a flag in Cloudflare bindings rather than `process.env`, a value of `1` or `TRUE` instead of `true` — plus checks that both routes call the guard before minting and read no dev flag themselves. Flipping the production default from a deny to an opt-in fails eleven of its assertions.

### Linting

`npm run lint` runs ESLint over `src/` and `scripts/` using [`eslint.config.js`](eslint.config.js) (flat config; ESLint 9 ignores the old `.eslintrc.json`, so its rules are restated there). The legacy v1 bot — `index.js`, `events/`, `handler/`, `slash/`, `images/` — is excluded on purpose: linting code nobody intends to change produces a wall of findings that teaches everyone to ignore the linter. Stylistic rules are warnings rather than errors for the same reason, and can be promoted once they reach zero. The Studio is gated by `npm run typecheck` (`tsc --noEmit`) plus its suites instead of a second ESLint install.

### Continuous integration

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs two jobs on every push and pull request: the bot job starts a throwaway Postgres, applies the migrations, lints and runs all suites; the Studio job type-checks and builds. Diagnostics that need a real external service (R2, the renderer, Ollama) skip with an explicit notice when their credentials are absent, so CI stays green on something that is simply not configured there rather than on nothing at all.

---

## Security Model

- OAuth tokens are never stored in browser sessions; Discord OAuth credentials are encrypted at rest (`OAUTH_TOKEN_ENCRYPTION_KEY`)
- Studio sessions are signed (`SESSION_SECRET`); sensitive routes verify authorization independently
- Server management routes re-verify Discord ownership/permissions — client-supplied guild IDs are never trusted
- Server content is isolated per guild; private content never becomes community content automatically
- Dev routes that mint Premium/Crowns fail closed (production by default, empty allowlist denies all)
- Payments never see card data: checkout is a redirect to a provider-hosted page, and the only inbound path is a signature-verified webhook. The account being credited comes from that verified payload, never from the browser; deliveries are claimed once per `(provider, externalEventId)` so a retry cannot double-grant, and a failed grant releases its claim so the provider's retry can still succeed

---

## Roadmap

The product direction is incremental. Current foundation: bot V2, aesthetic/mood system, R2 assets with color extraction, profile rendering, Ollama AI, Discord OAuth, PostgreSQL persistence, My Servers, Server Studio (generation settings, command management, Aesthetic Packs, Appearance with a hex-code cosmetic role maker, Access, Analytics), Asset Explorer (URL-persisted filters, tags, sorting), Create/Palette Studio, Favorites, Collections, Discover feed, Profile Builder (live-preview Discord profile composition), Complete My Profile (deterministic identity composition from one seed element, optional AI copy), and the Premium/entitlement framework.

| Phase | Focus |
|---|---|
| **1** ✅ | Finish meaningful Pack integration across `/profile`, `/theme`, `/palette`, `/symbols`, `/status`, `/username` (not `/bio`); improve Pack defaults |
| **2** ✅ | Complete Server Studio: Overview, Appearance, Access, Analytics |
| **3** ✅ | Asset Explorer — searchable R2 library with aesthetic/mood/color metadata, tags, filters, profile sets |
| **4** ✅ | Profile Builder — visual Discord-style profile construction with live preview |
| **5** ✅ | Complete My Profile — coordinate a full identity from one starting element (PFP, banner, palette, aesthetic…) |
| **6** 🔄 | Finalize Free/Premium boundaries and the Crowns economy — earn via community participation and Top.gg votes; spend on individual premium actions. Earn side shipped: `studio/lib/crownEarning.ts` is the only path Crowns enter the ledger through (publish, likes, comments, daily visit), with per-source and daily-total caps counted out of the ledger itself and an idempotency key per event so nothing can be farmed. Top.gg votes are built and tested but stay hidden until the Studio has a public URL for the webhook. Spend side shipped: prices are set against a deliberate rule — a month of Crown-buyable access costs at least twice the most an account could possibly earn in a month, so nobody farms a free month or saves up for a run of them, and timed unlocks cannot be stacked in advance. `testCrownEarning.js` asserts the rule |
| **7** ✅ | Community — publish Packs/profiles to Discover, creator profiles, search/filters, remixing with attribution, creator analytics. Shipped: public creator profiles (now at `/u/[discordId]`, moved out of the signed-in area after Phase 7) and public Discover search. A creator page is a *projection* of a user's already-published feed posts — `lib/creator.ts` reads only `SharedPost`, so nothing from a private library is reachable through it — and creator search only returns accounts that have published. Search covers captions, tags, creator names, aesthetic names, palette colors and asset-set facets, and every author name and avatar in the feed now links to its profile. Remixing with attribution also shipped: a Remix on any aesthetic or palette post copies it into the remixer's library with `remixedFromPostId`/`remixedFromUserId` provenance, credits the original creator on the card, and pays them 3 Crowns under an idempotency key that cannot be farmed. The credit keys on the author's *user id* rather than the source post, because unsharing deletes the post and must not erase attribution from copies already made. Creator analytics shipped too: `/dashboard/analytics` (Premium) reports reach and impressions per post over a 7/30/90-day window with a daily trend. A "view" is a *person*, not an impression — `SharedPostView` keeps one row per `(post, viewer)` and bumps a counter, so the same table answers "how many people saw this" (exact) and "how many times" without ever letting one refreshed tab invent an audience, and the author is excluded in the `INSERT ... WHERE` so a creator is never their own audience. Publishing to Discover shipped last: composed Profiles and server Aesthetic Packs now join the feed as new `PROFILE` and `PACK` `SharedItemType`s. A profile publishes through the same `/api/feed` path as everything else, guarded by `assertPublishableItem` (you can only publish your own item); a pack publishes through a guild-scoped `/api/servers/:id/packs/:packId/publish` route where the entitlement is a Discord permission, so `PACK` is rejected on the generic path. Both hydrate into flat Discover cards, are searchable, count toward creator profiles, and pay the once-per-item publish Crown. `testPublishToDiscover.js` covers it end to end |

| **8** ✅ | Monetization — real Premium checkout. `studio/lib/payments/` is provider-agnostic on purpose: `types.ts` defines a provider as exactly two operations (create a checkout session, verify a webhook delivery), `catalog.ts` is the single source of truth for which plans exist and which Stripe price backs each one, and `applyPaymentEvent.ts` is the only code that turns money into an entitlement. Stripe is the one adapter so far, written against `fetch` and Web Crypto rather than the SDK so it runs on Workers without a dependency. Entitlements are idempotent per external subscription id, so a renewal extends a period instead of stacking one, and a refund revokes through the same path. In-app notifications fire on grant and revocation. `testPayments.js` covers it without a network call |

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
