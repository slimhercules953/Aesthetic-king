# vinext app

This project was created with create-vinext-app.

## Scripts

- `pnpm run dev` starts the vinext dev server.

### Viewing from another device

`vite.config.ts` sets `server.host: true`, so the dev server listens on
every interface and is reachable from other devices on the network at
`http://<this machine's IP>:3000` (Vite prints the exact URL on start).
Windows needs an inbound allow rule for TCP 3000 on the Private
profile; one named "Aesthetic King Studio LAN" already exists.

Discord login follows the device. `resolveAppOrigin()` in `lib/auth.ts`
builds the OAuth `redirect_uri` from the URL the browser actually used,
so `localhost` and a LAN IP each get a matching `redirect_uri` instead
of everyone being bounced back to their own `localhost`. In production
the configured `NEXT_PUBLIC_APP_URL` is always used — trusting the
`Host` header there would let a forged header redirect a victim's auth
code to an attacker's origin.

Each origin still has to be registered. In the Discord developer portal
for client `1062520458416771092`, add every callback you want to use:

```
http://localhost:3000/api/auth/discord/callback
http://<this machine's IP>:3000/api/auth/discord/callback
```

An unregistered address fails at Discord's consent screen with
`Invalid OAuth2 redirect_uri`.

### Grandfathered Premium

`lib/grandfather.ts` keeps Premium on staff accounts that never buy it.
It writes a real `Entitlement` row (`source: "grandfather"`, no
`endsAt`) on login rather than special-casing the id at the check, so
there is still exactly one source of truth for the plan and the billing
page shows where the access came from.

The developer's id is built in. Extra ids can be added without a code
change with a comma-separated `GRANDFATHER_IDS` env var. The write is
idempotent (keyed on `externalEntitlementId`), it runs after the user
row is created, and a failure is logged but never blocks sign-in.

It is skipped when Premium is already active, so a grandfathered
account that later buys a subscription keeps the row it paid for
instead of having it replaced by a permanent grant.

- `pnpm run build` builds the Cloudflare Worker output.
- `pnpm run start` starts the built Worker locally with Wrangler.
- `pnpm run deploy` deploys the Cloudflare Worker.

## Running on a VPS instead of Cloudflare

The Studio targets Cloudflare Workers by default. It can also run as an
ordinary Node process behind a reverse proxy, which is what a self-hosted
VM needs:

```
npm run build:node     # builds with vite.config.node.ts
PORT=3100 npm run start:node   # serves dist/ on $PORT
npm run dev:node       # dev server on the Node config, port 3100
```

`vinext start` takes its port from `PORT` and falls back to 3000 if it is
unset, so always set it explicitly — the systemd unit does. The project uses
3100 rather than 3000 or 3001 to stay clear of the ports dev tooling defaults
to.

`vite.config.node.ts` differs from `vite.config.ts` in exactly three
places, and each has a Node equivalent wired up where it was used:

| Workers | Node |
| --- | --- |
| `responseStoreAdapter()` cache | vinext's default in-process cache |
| `imagesOptimizer()` | vinext's default local optimisation |
| the `cloudflare()` plugin | nothing — the RSC/SSR bundle is plain Node |

Five modules (`lib/database.ts`, `lib/ollama.ts`, `lib/devTools.ts`,
`lib/discordBot.ts`, `lib/botInvite.ts`) read configuration from Workers
bindings. `lib/nodeWorkersShim.ts` is aliased over `cloudflare:workers` in
the Node config and answers the same named imports from `process.env`, so
no call site has to know which platform it is on. `HYPERDRIVE` is
synthesised from `DATABASE_URL` (a Hyperdrive binding is only a connection
string in a wrapper), and `OLLAMA` — a service binding, so an object with
`fetch()` rather than a string — rewrites `http://ollama.internal` onto
`OLLAMA_URL`. A missing binding throws when it is read, not at import, so a
bad environment fails one request instead of the whole process.

The Workers manifest is named `wrangler.cloudflare.jsonc` rather than
`wrangler.jsonc` because vinext detects the target platform by looking for
a default-named manifest in the project root and refuses to build a Node
bundle when it finds one. `vite.config.ts` points the Cloudflare plugin at
the new name explicitly, so the Workers build is unaffected.

### Environment on a VPS

```
DATABASE_URL=postgresql://user:pass@host:5432/dbname
OLLAMA_URL=http://127.0.0.1:11434
NEXT_PUBLIC_APP_URL=https://<your domain>
SESSION_SECRET=...              # must match the old host
OAUTH_TOKEN_ENCRYPTION_KEY=...  # must match the old host
```

`SESSION_SECRET` and `OAUTH_TOKEN_ENCRYPTION_KEY` have to be byte-identical
to the previous deployment or every stored Discord OAuth token becomes
undecryptable and all users are logged out. `NEXT_PUBLIC_APP_URL` is inlined
at *build* time, so changing the domain means rebuilding, not just editing
the env file. Add `https://<your domain>/api/auth/discord/callback` to the
Discord developer portal for client `1062520458416771092`.

`lib/database.ts` requires TLS for any non-private host and skips it for
localhost/LAN, so a remote database over a private network works without
extra config; append `?sslmode=...` to the URL to override.


## Premium, usage and Crowns

`lib/features.ts` is the single source of truth for every limit and
Crown price. Change a number there, never at a call site.

- `lib/entitlements.ts` derives the plan from active `Entitlement`
  rows. The plan is never stored on the user.
- `lib/usage.ts` counts consumption. Some features are counted by
  counting existing rows (`derived`), some by a `FeatureUsage` ledger.
  Features nothing writes yet report `tracked: false` so the UI says
  "not tracked yet" instead of a false `0 of N`.
- `lib/crowns.ts` is an append-only ledger. Balance is always
  `SUM(amount)`; `spendCrowns` is the only safe way to debit.
- `lib/crownEarning.ts` is the only way Crowns come into existence.
  See "Earning Crowns" below.
- `lib/gate.ts` enforces limits server-side. Every protected route
  calls `requireFeature` — hiding a button is not a limit.

Pages: `/dashboard/premium`, `/premium/usage`, `/premium/crowns`,
`/premium/billing`.

### Earning Crowns

A `CrownTransaction` row is the only record of a Crown, so earning is
just writing a positive row. There is no balance column and no counter
table to keep in sync — the daily caps are counted out of the ledger
itself, which means the numbers on the page can never disagree with the
rows behind them.

`CROWN_EARN_RULES` in `lib/crownEarning.ts` holds every amount and cap:

| Source | Amount | Per day | Paid to |
| --- | --- | --- | --- |
| `publish` | 5 | 3 | whoever shares to Discover |
| `like_received` | 1 | 10 | the post's author |
| `comment_received` | 2 | 10 | the post's author |
| `remix_received` | 3 | 5 | the post's author |
| `daily_visit` | 3 | 1 | the visitor |
| `topgg_vote` | 10 | 1 | the voter |

`CROWN_EARN_DAILY_TOTAL_CAP` (25) is a second ceiling on top of the
per-source ones, so no combination of sources can exceed it.

### The one-month rule

The amounts are not free-floating. `CROWN_MONTH_MAX_EARN` is the cap
times 31 — the most a single account could possibly bank in a month —
and `CROWN_MONTH_MIN_COST` is twice that. Every Crown-buyable period of
access has to cost at least the floor, and `testCrownEarning.js` asserts
it, so a future price change cannot quietly break the rule.

The reason is a specific kind of leak: if a month of Premium costs less
than a month of farming, then paying stops being the way to get it. Worse,
a user who saves up can buy several months back to back and spend the
following months inside Premium while earning nothing. Pricing at 2× the
ceiling means the most dedicated account on the platform still has to
either pay or keep working for it.

Two consequences live in the code, not just the numbers:

- TIMED unlocks do not stack. `purchaseUnlock` refuses the purchase
  unless the existing unlock is inside `TIMED_RENEWAL_WINDOW_DAYS` (3) of
  expiring, and the `ON CONFLICT` update sets
  `expiresAt = NOW() + period` rather than extending what was there. You
  can renew early and forfeit a few days; you cannot pre-buy a run of
  months.
- BOOST unlocks are exempt from the floor because they cannot be banked —
  they are keyed to the reset period and simply stop applying when it
  rolls over. The test checks the other direction instead: maxing out a
  BOOST with Crowns still lands under what the Premium plan itself
  grants.

`isEarnSourceLive()` decides what the Earn page offers. Every source
except `topgg_vote` is wired into the product, so it is
always live; a vote can only arrive through the matching webhook, so that
source is hidden until `TOPGG_WEBHOOK_SECRET` is set — the same condition the
route uses to answer 404. Advertising "10 Crowns for voting" when no vote can
be received is a promise the product cannot keep. Hiding a source hides the
offer only: rows already awarded under it still appear in the history
and still count toward today's total.

Product code never calls `awardCrowns` directly — it calls one of
`awardForPublish`, `awardForLike`, `awardForComment`,
`awardForDailyVisit` or `awardForTopggVote`. Three rules
those hooks enforce, all of them anti-farming:

- **An idempotency key per event, not per call.** `publish:<itemType>:<itemId>`
  (not the post id — unsharing and re-sharing mints a new post id, which
  would otherwise be a way to re-earn), `like_received:<postId>:<liker>`
  (unliking and re-liking pays once), `comment_received:<commentId>`,
  `daily_visit:<UTC day>`, `topgg_vote:<voter>:<UTC day>`. The unique index on
  `(userId, idempotencyKey)` is what actually enforces this.
- **You cannot pay yourself.** Self-likes and self-comments award
  nothing. The check lives in `crownEarning.ts` rather than in the API
  route so any future like surface inherits it.
- **Awarding never breaks the thing that earned it.** `awardCrowns`
  catches everything and returns `{ awarded: false }`; a failed award is
  logged, never thrown at a publish or comment that already succeeded.

Awards take a `FOR UPDATE` lock on the user row inside the transaction,
the same way `spendCrowns` does, so an earn and a spend cannot both read
the same daily total. Because the daily-visit hook fires on every
dashboard page load, there is a cheap duplicate read *before* the
transaction so the common "already awarded today" case costs no lock.

`/dashboard/premium/crowns` shows what is left today per source via
`getEarnStatus`.

**Vote webhooks.** `app/api/webhooks/topgg/route.ts` receives vote webhooks
at `POST /api/webhooks/topgg`. Set `TOPGG_WEBHOOK_SECRET` to the authorization
token you configure on Top.gg; requests are compared against it in
constant time. Without the variable the route answers `404` so an
unconfigured deployment exposes nothing.

Top.gg sends `type`, and only `upvote` pays — `test` and `revote` are
acknowledged and ignored, so Top.gg's "Test Webhook" button verifies the URL
and secret without minting Crowns. The voter id is validated as a snowflake
before it is used, so a malformed body fails closed with `400` rather than
crediting somebody arbitrary.

The vote pays the *voter*, not the bot owner, and an unknown
Discord id is acknowledged with `200` but invents no account and no balance.

`node scripts/testCrownEarning.js` covers all of it without a database,
including the webhook route.

## Server Studio

`/dashboard/servers/[id]` has seven tabs: Overview, Generation, Commands,
Aesthetic Packs, Appearance, Access and Analytics. Each is a server
component that reads real state, so the Overview reports actual
configuration rather than static copy.

Authorization is the same everywhere and is never inferred from the URL:
pages call `requireManagedGuild(guildId)` (`lib/guildAccess.ts`) and API
routes call `guardGuildAccess(request, guildId)`. Both resolve the
session, fetch the caller's guild list from Discord, and require owner,
Administrator or Manage Server. A page answers `notFound()` so that a
guild belonging to someone else is indistinguishable from one that does
not exist; an API client gets 401/403/502 so it can tell the difference.

- `lib/guildAppearance.ts` — per-server embed color, footer and display
  toggles on `GuildSettings`. A server with no settings row is not an
  error; the defaults are returned so the form renders.
- `lib/guildAccessRules.ts` — ordered allow/deny rules over roles and
  channels. Semantics match the bot exactly: no rules is open, a
  matching DENY denies, any ALLOW present requires a match, otherwise
  open.
- `lib/guildAnalytics.ts` — five aggregate queries over `GuildUsageEvent`.
- `lib/guildRoles.ts` — the hex-code cosmetic role maker on the Appearance tab.
  Validation, hex↔integer conversion, a WCAG readability warning and the
  `GuildCosmeticRole` receipt table. The Discord write itself lives in
  `discordBot.ts`, because that module owns the bot-token REST client.
  Those receipts are also what the bot's `/color` command will hand out: a
  colour role is only claimable by members if a receipt exists for it, so the
  Appearance tab and `/color` share one table rather than keeping separate
  lists. Rows written here default to `source = "STUDIO"` and
  `selfAssignable = false` — a Studio role is claimable in the bot's FREE mode
  but is not offered in PALETTE mode until an owner marks it approved with
  `/color palette-add`, which is what keeps a curated palette curated.
- `lib/guildSettings.ts` — `getGuildSettingsByDiscordId()` and a single
  `updateGuildSettings(guildId, patch)` that writes any combination of the
  patchable columns in one upsert. The settings API validates every field in
  the request before writing anything, so a bad value cannot save part of a
  form; per-column updaters were removed because a PATCH carrying two fields
  had to call two of them and the second overwrote the first's result.
- `lib/discordBot.ts` — `getGuildSnapshot()` supplies the role and channel
  pickers from the live guild. It needs `DISCORD_BOT_TOKEN`; without it
  the Access tab falls back to manual snowflake entry rather than
  failing.

### Writing Studio SQL

There is no ORM here — queries are hand-written `pg` SQL. **Qualify every
column reference in a joined query.** Most Studio queries join `"Guild" g`
to turn a Discord ID into an internal one, and `Guild`, `GuildSettings`,
`GuildAccessRule` and `GuildUsageEvent` all have `createdAt`/`updatedAt`.
An unqualified `"createdAt"` inside such a query is a
`column reference ... is ambiguous` runtime error that TypeScript cannot
see, so it has to be caught by loading the page.

Server components may pass real `Date` objects to client components, but
the same shape arriving over JSON has ISO strings. Client components
should type those `string | Date` and normalize, as
`components/servers/ServerAnalytics.tsx` does.

**Always list `createdAt` and `updatedAt` in an `INSERT`.** `@updatedAt` in
the Prisma schema is a client-side convention, so the column is `NOT NULL`
with no database default. Postgres checks `NOT NULL` when it builds the
candidate tuple — *before* `ON CONFLICT` runs — so an upsert that omits
`updatedAt` fails with `23502` even when it resolves to the update branch.
`scripts/testStudioPhase2.js` has a "Studio SQL" section that runs these
statements against the real schema for exactly that reason.

**Truncate timestamps in UTC.** `createdAt` columns are `timestamp without
time zone` holding UTC wall-clock values, because that is how a JS `Date` is
serialised on write. `NOW()` is a `timestamptz`, so `date_trunc('day', NOW())`
truncates in the *session* zone — `America/New_York` on this database — and
produces local midnights that never equal the UTC midnights the rows
truncate to. Any day-bucketed query must therefore say
`date_trunc('day', NOW() AT TIME ZONE 'UTC')` to match its own rows;
`getGuildAnalytics()` does this in its daily series. Comparisons like
`createdAt >= NOW() - $2::interval` are fine unmodified, since Postgres
converts the naive column to an instant for the comparison.

### Dev server notes

The first request for a route cold-compiles and can exceed the Miniflare
request timeout, which leaves the runtime answering
"The Workers runtime canceled this request" for every later request until
the server is restarted. A 500 in the browser is therefore not always a
code bug — retry once, and restart `npm run dev` if it wedges.

Bursting many requests in parallel also exhausts the pool
(`max: 10` per isolate against a remote Hyperdrive backend), which shows
up as `timeout exceeded when trying to connect`. Probe routes one at a
time.

### Dev-only flags

Unset in production. Two routes mint paid value — Crowns and Premium
entitlements — so they are guarded by three conditions that must *all*
hold. A flag alone is never enough:

- `CROWN_DEV="true"` enables `POST /api/crowns/dev-grant`
- `BILLING_DEV="true"` enables `POST /api/billing/dev-entitlement`
  (grant/revoke Premium, so you can test the paid tier without a
  payment provider)

In addition, and regardless of the flags:

- `NODE_ENV` must be `development` or `test`. Anything else — including
  an unset `NODE_ENV`, which is the default under Workers — is treated
  as production and the routes answer 404.
- Your Discord user ID must appear in `DEV_CROWNS_DISCORD_IDS` /
  `DEV_BILLING_DISCORD_IDS` (comma separated). An unset or empty list
  denies everyone, so a missing allowlist fails closed.

The flags are read from Cloudflare bindings *and* `process.env`, so
either `.dev.vars` or a real environment variable works.

`node scripts/testDevTools.js` asserts all of the above by trying to get
the guard to return `true` in every way an operator might plausibly
misconfigure a deploy.

### Store provenance

`Entitlement` carries two nullable columns that only matter once real
selling starts:

- `skuId` — the Discord store SKU the purchase came from.
- `externalEntitlementId` — the provider's own entitlement id, unique.
  Passing it to `grantEntitlement` makes the write idempotent, so a
  replayed webhook updates the existing row instead of stacking a
  second one, and `revokeEntitlementByExternalId` is what a refund
  webhook should call.

Both are null for manual and dev grants, and nothing invents SKU
constants until the store actually exists. When it does, the
SKU → `EntitlementType` + duration mapping belongs in
`lib/features.ts`, and the source string must be one of `PAID_SOURCES`
in `lib/entitlements.ts` or Premium will be labeled promotional.

### Checkout

`lib/payments/` is where money becomes an entitlement. It is split so that
the provider is a detail:

- `types.ts` — the whole contract. A provider is exactly two operations:
  create a checkout session, and verify a webhook delivery. Nothing else in
  the app is allowed to know Stripe exists.
- `catalog.ts` — which plans are sellable and which provider price backs
  each one. A plan whose `PREMIUM_*_PRICE_ID` is unset is not offered, so
  checkout can be enabled one plan at a time. Also the only definition of
  `addMonths`, which clamps to the last day of the target month (a bare
  `setUTCMonth` turned "one month after Jan 31" into Mar 3).
- `stripe.ts` — the Stripe adapter, written against `fetch` and Web Crypto
  instead of the SDK so it runs on Workers without the dependency. Signature
  verification is an HMAC-SHA256 over `"{t}.{body}"` with a five-minute
  tolerance and a constant-time compare against *every* `v1` value, so a
  secret can be rotated without dropping in-flight deliveries.
- `applyPaymentEvent.ts` — the only code that writes an entitlement from a
  payment. `index.ts` picks the provider from `PAYMENT_PROVIDER`.

Money moves in one direction. The browser is redirected to a Stripe-hosted
page; the app never sees card data and never trusts a browser-supplied
amount or Discord id. The id being credited is read back from the
signature-verified payload, and the amount comes from the provider's price
object.

Delivery is idempotent by `(provider, externalEventId)`: a claim is inserted
before anything is granted, so a retry grants nothing twice. If applying then
throws, the claim is deleted again — otherwise Stripe's retry finds the row
already claimed and a paying customer silently gets nothing.

Routes: `POST /api/billing/checkout` (session-gated; 404 when no provider is
configured, 303 to the provider's URL) and `POST /api/webhooks/stripe`
(404 unconfigured, 401 unsigned, 500 only when applying failed and a retry is
worth having). An unconfigured deployment answers 404 rather than 5xx on
purpose: a 5xx makes the provider retry a plain misconfiguration for days.

`scripts/testPayments.js` in the repository root covers all of it offline.

### Migrations

Premium needs all pending migrations applied:

```
npx prisma migrate deploy
```

## Asset Explorer

`/dashboard/assets` is a searchable library over the R2 asset sets. The
whole query layer lives in `lib/assetQuery.ts` — parsing and building the
URL, filtering, sorting and facet counts — because the component is a thin
renderer over it and the semantics are worth testing without a browser.

**Filter semantics.** Values *within* one facet are OR'd; facets are
AND'd. `?aesthetics=cyber,dark&colors=purple` means "a cyber or dark set
that is also purple". Facets are `tags`, `aesthetics`, `colors`, `moods`,
plus free text in `q` and `favorites=1`.

**The URL is the state.** `AssetLibrary.tsx` holds no filter `useState`;
`useSearchParams()` is the single source of truth and every change is a
`router.replace()`. That makes a filtered view reloadable and shareable,
which is the point of the page. Search text is the one exception — a local
draft commits on form submit so typing does not push a history entry per
keystroke.

Facet values are comma-separated in a single param rather than repeated
params, so hand-written links stay short. The default sort is omitted from
the URL so the common case produces an empty query string.

**Facet counts.** A chip's count is how many sets match `[that value]`
under the *other* facets, with its own facet narrowed to just it. Selected
and unselected chips are therefore counted identically and the numbers are
comparable — an unselected chip previews what choosing it would do. Chips
showing `0` are dimmed, never hidden, because hiding them makes a filter
impossible to explore.

### Catalog tags

`src/data/assetCatalog.json` carries a `tags` array per set alongside
`aesthetics`, `moods` and `colors`. Tags are the loose, useful vocabulary
(`neon`, `cozy`, `premium-pick`, `dark-palette`) that does not fit the
narrower three facets.

They are generated, not hand-written: `node scripts/tagAssetCatalog.js`
derives them from the metadata already in the file and is safe to re-run
after `generateAssetCatalog.js`. Every rule is a claim about existing
metadata, never about image pixels — nothing opens the R2 objects, so the
script cannot honestly know what a set looks like. Curator-pinned tags go
in `MANUAL_TAGS` in that script so they survive regeneration. Pass
`--dry-run` to preview.

### Testing it

The Studio has no test runner, so `node scripts/testAssetExplorer.js`
(from the repo root) transpiles `lib/assetQuery.ts` with the Studio's own
esbuild and asserts against the real shipped module rather than a
JavaScript copy that could drift.

## Profile Builder

`/dashboard/profile` builds a Discord profile — display name, username,
pronouns, bio, status, palette, symbols, accent color and an optional
asset set — against a live preview of the card.

**The preview is DOM, not canvas.** The bot draws profiles with
`node-canvas` in `src/services/rendering/profileRenderer.js`, and the
Studio runs on Workers, which has no canvas binding. So
`components/profile/ProfilePreview.tsx` renders the card in markup. It is
a server component with no state and no handlers: every color and string
arrives already resolved in a `ProfilePreviewState`, which is why the
fallback rules (what shows when the name is blank, what color text goes
on a mid-tone background, how a one-color palette is padded) live in
`lib/profileModel.ts` where they can be asserted rather than in JSX. It
is a likeness of Discord's card, not a pixel copy.

**A `Profile` is not a `SavedAesthetic`.** They overlap in fields and
share nothing in code. A saved aesthetic is a palette someone kept out of
the library; a profile is the identity they present, with its own text,
its own active flag and its own renderer. Splitting them keeps the
aesthetic library from growing a bio column every time the card gains a
field.

**Everything is clamped on the way in.** `parseProfileInput` in
`lib/profileModel.ts` enforces `PROFILE_LIMITS` and normalizes colors,
symbols and the discriminator before anything reaches SQL, and
`lib/profiles.ts` runs the same function on create *and* update. The
limits match the bot's renderer, so a profile that saves is a profile
that renders. Text is clamped by code point, not `.length`, because an
emoji is one visible character and two or more UTF-16 units.

**One field per patch.** `parseProfileInput` rejects a profile with
neither a palette nor a set — a sensible rule about a whole profile and a
nonsense one about a patch carrying only `name`. So `PATCH` does not call
it; each route validates what it was actually sent.

**Free users get one version.** `canCreateMoreProfiles(count, unlocked)`
is the whole rule, and `unlocked` comes from
`access.PREMIUM_ASSETS.allowed`, never from the plan column. Premium
assets are also crown-unlockable, and a Crown holder's `User.plan` still
reads `FREE`, so gating on the plan would lock out people who paid.

**Exactly one active profile.** `isActive` is maintained in a
transaction: the create path clears the previous active row in the same
transaction it inserts, and `setActiveProfileForDiscordUser` clears the
others before setting one. Two active profiles would make the bot's
"what do I render" question unanswerable, so it is never a legal state
even briefly.

### Testing it

`node scripts/testProfileBuilder.js` (from the repo root) has two halves.
The first asserts the pure model — clamping, normalization, contrast,
preview fallbacks, completeness. The second connects to the real
database and runs `lib/profiles.ts`'s SQL against the real schema,
because the Studio has no Prisma client: every statement is hand-written
text, so a wrong column name is only discoverable as a 500 in a browser.
It skips itself when the database is unreachable rather than failing.

## Complete My Profile

`/dashboard/profile/new` opens with a panel that builds a whole identity
from one thing the user likes: a profile set, an aesthetic, a color, or
the palette they have already painted. It fills whatever is still empty
and leaves anything they typed alone.

**Composition is deterministic; AI only rewrites text.**
`lib/profileComposer.ts` picks the set, palette, symbols, username, bio,
status and accent color out of the catalogs with an injected `random`,
so a given seed and seed-value always produce the same profile. Nothing
in it reads a database, a session or the clock. `lib/profileCompletion.ts`
is the half that is allowed to do those things: it resolves the seed,
calls the composer and then optionally asks Ollama to rewrite the three
text fields. Keeping them apart is what makes the interesting part
testable — `scripts/testCompleteProfile.js` sweeps every aesthetic and
color in the catalog and asserts the result is a complete, coherent
profile, which would be impossible if the maths depended on a live
request.

**A failed AI call is not a failed request.** The composer has already
produced a good draft by the time Ollama is asked. If the model is down,
times out, or returns prose instead of JSON, `generateAiCopy` swallows it
and the deterministic text ships. The response reports `ai: false` and
the panel says so. A user who ticks "Rewrite the text with AI" is asking
for better copy, not for an error page when the model is offline.

**The prompt describes the seed, never the chosen set.** The first version
also pasted in the chosen set's own aesthetic and mood tags, and the model
followed those instead: a Kawaii seed that happened to land on a set tagged
"dreamcore, soft" produced "hiding in the static. secrets bloom in the
dark." The prompt now names the aesthetic with the catalog's own one-line
description (`getAestheticDescription`), gives the palette, and says nothing
about the set's tags. It also asks for `format: "json"` on the Ollama
request, which removed the intermittent "reply was not JSON" fallback, and
the username guard accepts underscores — Discord allows them and the model
reaches for `cupcake_puff` constantly, so the stricter rule was quietly
throwing away good answers. `scripts/testCompleteProfile.js` section 10
pins all three with a stubbed Ollama.

**The quota is spent before the work and refunded on failure.**
`POST /api/profiles/complete` parses the body *before* `requireFeature`,
so a malformed request cannot burn a generation. It then records usage
and only refunds it if the composition throws. `remaining` in the
response is re-read after `recordUsage` rather than taken from the
pre-flight check, because a Crown boost can expire mid-request.

**`lib/completionColors.ts` exists to keep the client bundle clean.**
The panel needs the catalog color names to build its dropdown, but
`profileComposer.ts` imports `apiError.ts`, which imports `next/server`.
Importing the composer from a client component would drag the server
runtime into the browser. The color table therefore lives in its own
leaf module that both sides import.

### Testing it

`node scripts/testCompleteProfile.js` covers the composer across every
aesthetic and color, the coherence rules (a bio describes the aesthetic
it uses, a palette is anchored to the seed color), and the wire format —
the exact JSON the panel posts. That last section is not decoration: the
parser lowercases `kind` and once compared it against the camelCase
literal, so every profile-set seed 400'd in the browser while the
composer tests stayed green.

## Creator profiles & public search

Phase 7's first slice: a public page per creator, and a search box on
Discover. Both take a string straight out of the URL and use it to select
*other people's* content, which is a new kind of exposure for the Studio.

**A creator page is a projection, not a new surface.**
`/u/[discordId]` renders `getCreatorProfile()` +
`getCreatorTopTags()` + `getFeedPostsByAuthorDiscordId()`, and every one of
those reads `SharedPost`. Nothing from a private library — unshared
aesthetics, palettes, profiles, collections — is reachable through
`lib/creator.ts`. That is the whole privacy argument for the page: it shows
what is already visible to any signed-in user in the feed, grouped by
author. A Discord user who has never signed into the Studio has no `User`
row, so the page 404s rather than rendering an empty profile.

**`lib/creatorHref.ts` exists so `FeedCard` can link authors.**
The ID validation and the href builder have to be importable from a client
component, but `lib/creator.ts` talks to the database — importing from it
would drag `pg` into the browser bundle. Same reason
`lib/completionColors.ts` exists. `normalizeDiscordId()` is a
`/^\d{5,25}$/` test: snowflakes are digits, and the lower bound rejects
junk without trying to bound the top, because snowflake values grow with
time and a hard upper digit count would eventually reject real IDs.
`creatorProfileHref()` returns `null` for anything else, so a malformed
author ID renders plain text instead of a link to a 404.

**Public search is a separate module from `lib/search.ts` on purpose.**
`searchStudio()` answers "what have *I* saved" and its docstring says it
deliberately does not scan the feed. `lib/feedSearch.ts` answers "what has
the community published", where every row belongs to somebody else. It
reuses `FEED_SELECT_SQL` (exported from `sharedFeed.ts`) so the like-this-
viewer-has-already-liked subquery is defined once.

The match lives in its own exported fragment, `FEED_SEARCH_MATCH_SQL`,
because the obvious version of it is wrong. The item joins are `LEFT JOIN`s,
so writing `sa.id IS NOT NULL OR caption ILIKE $2` makes **every** aesthetic
and palette post match **every** term. Each branch therefore carries its own
`sp."itemType" = '…'` guard. A side benefit: a post whose underlying item
has since been deleted matches nothing and drops out of search, instead of
turning up as a card with no media.

Two other rules worth keeping:

- The term is always a bound parameter, never concatenated. `escapeLike()`
  escapes `\`, `%` and `_` so a search for `100%` means `100%` rather than
  silently broadening.
- Terms shorter than two characters return `[]` without querying. A
  one-letter `ILIKE` would scan the feed and return noise.

`searchFeedCreators()` only returns accounts with at least one post
(`INNER JOIN "SharedPost"`). An account that has never published has no
public surface, so listing it would leak the existence of a Studio account
through a search box.

**Discover's search is a plain GET form.** The page already holds all the
state in its URL (`type`, `sort`, `tag`), so a `<form method="get">` with
hidden inputs for the current filters is the cheapest thing that keeps
results shareable and reload-safe — no client component, no fetch, no new
state to desynchronise.

### Testing it

`node scripts/testCreatorProfiles.js` transpiles the three real modules and
asserts both halves. Offline: that a non-snowflake never reaches SQL, that
the term appears only in the parameter list, that both match branches are
type-guarded, that every `$n` placeholder has a parameter, and that filters
and sort produce the expected SQL. Against the database (skipped, not
failed, when none is reachable): the profile's counts and tag aggregation,
creator lookup by name and by tag, and — the check that matters most — that
a term matching only internal IDs leaks no posts.

## Remixing with attribution

Phase 7's second slice: a **Remix** button on any feed post. It copies the
published item into the remixer's library, records who it came from, credits
them on the card, and pays them Crowns.

**The copy carries its own artwork; it does not point at the original.**
`POST /api/feed/[id]/remix` runs an `INSERT … SELECT` that writes a new
`SavedAesthetic` / `SavedPalette` row owned by the remixer. This is the
difference between a remix and a bookmark. The remixer can rename it,
re-share it, or delete the original without their copy breaking — and the
original author cannot reach into it, because it is not theirs.

Provenance is two nullable columns on both tables:
`remixedFromPostId` and `remixedFromUserId`, both `ON DELETE SET NULL`.

**Both columns exist because one of them is a lie waiting to happen.**
`remixedFromPostId` is the interesting link, but `SharedPost` rows are
deleted every time someone unshares. If the credit were resolved by joining
through the post, unsharing would silently erase the attribution from every
copy ever made — and the copies would stay in people's libraries, uncredited.
So `remixedFromUserId` is what `getAttributionsForPosts()` actually keys on,
and the post id is only ever used to build a link. `testRemix.js` asserts
this directly: it unshares the original, publishes the copy, and requires the
credit to survive with `sourcePostId === null`.

`SET NULL` (rather than `CASCADE`) is also what makes deleting an account
safe. The person's own library rows cascade away; the provenance columns on
*other people's* copies go null instead of deleting their work.

**ASSET posts are not remixable.** An asset post points at a catalog set,
not at anything the poster made. Copying it would credit someone for
authorship they do not have. `REMIXABLE_ITEM_TYPES` is `AESTHETIC` and
`PALETTE` only, and `isRemixableItemType()` is a real type guard — narrowing
that property is what lets `remixFromPost()` branch without a cast. Note that
the guard has to *rebuild* the row (`{ ...post, itemType }`) for the
narrowing to reach the object type; narrowing a property does not narrow the
containing object.

**A remix is not auto-published.** The button writes a library row and
nothing else. Sharing is a separate, deliberate act with its own
`SAVED_PROFILE_LIMIT` and `publish` reward, and letting one click both copy
and publish would let someone republish someone else's work into the feed
without ever looking at it.

**Premium is checked twice.** The route asks `getFeatureAccess("PREMIUM_ASSETS")`
so it can return a proper upsell, and `remixFromPost()` refuses again on
`premiumUnlocked` rather than trusting its caller — the same belt-and-braces
`toggleSharedPostLike()` uses for `SHARED_FEED_INTERACTION`. The gate is read
from the *source item's* `profileSetId` via `premiumSetForPost()`, because
that is the artwork the copy carries. A palette post can never be premium, so
the lookup is scoped to `itemType = 'AESTHETIC'`.

**The reward cannot be farmed.** `awardForRemix()` keys the ledger row
`remix_received:<sourcePostId>:<remixerDiscordId>`, and
`@@unique([userId, idempotencyKey])` does the rest. Remixing the same post
twice makes two copies and pays once; a second remixer pays again; a
self-remix is refused before anything is written. 3 Crowns at a daily cap of
5 — above a comment, below a publish, and capped low because one popular post
could otherwise be farmed to the daily ceiling by a few accounts.

The `Notification` is written with `dedupeKey = remix:<postId>:<remixer>`, so
the repeat-remix case cannot stack notices either. Its title names the
*remixer*, looked up from their own row — the post row carries the author's
name, and the author is the one reading the notice.

### Two bugs this slice's tests found

Both were pre-existing and neither was visible in the UI, because both layers
swallow their errors by design.

- **`createNotification()` never inserted a row.** `Notification.id` is
  `@default(cuid())` in Prisma, which is a *client-side* default — the column
  has no database default at all. Every raw-SQL insert from `lib/notifications.ts`
  was failing on the NOT NULL constraint and being caught by the
  `catch` that keeps notices from failing their caller. It now supplies
  `gen_random_uuid()::text` like every other raw insert in `lib/`.
- **`remixFromPost()` addressed the notice to the wrong person.** It built
  the title from the post row, which is the author, producing
  "you remixed your own palette". Fixed to look up the actor, matching the
  like path.

A notice that silently never arrives looks identical to a notice that was
never earned. Anything wrapped in a "never let this fail" `catch` needs a
test that asserts the row exists.

### Testing it

`node scripts/testRemix.js` (67 assertions) runs the real module twice.

Offline, over a fake adapter, it inspects the SQL and the order of
operations: that a missing post, a self-remix and an asset post are all
refused before any `INSERT` (the asset refusal before the premium lookup),
that the copy's insert binds the source post id and the author's internal id
rather than concatenating them, that it resolves the owner from
`discordId` rather than trusting a passed-in id, that it writes both
timestamps, and that it writes a literal `NULL` for `generationId` — which is
`UNIQUE`, so copying it would collide. Also that the reward and the notice
happen *after* the copy exists, and that a throwing reward surfaces instead
of being hidden.

Against the database, with nothing stubbed, it proves the things a fake
cannot: that the idempotency keys actually hold under the unique indexes,
that the copy is not auto-published, that the credit survives the source
being unshared, and that `getCreatorProfile().remixesReceived` counts copies
and not distinct remixers. It skips rather than fails when no database is
reachable.

## Creator analytics

Phase 7's last unbuilt piece: `/dashboard/analytics`, a Premium page that
tells a creator how their published work is doing. `lib/creatorAnalytics.ts`
is the whole data layer — `recordPostView()` on the write side,
`getCreatorAnalytics()` on the read side.

**A "view" is a person, not an impression.** `SharedPostView` keeps one row
per `(post, viewer)` and upserts it: `views` grows, `lastViewAt` moves,
`firstViewAt` stays put. That single table answers both questions a creator
asks — `COUNT(*)` is honest reach, `SUM(views)` is impressions — without an
append-only log. A raw log would be the only unbounded table in the product,
and it would let one tab refreshing on a feed invent a four-figure audience.
Reach is the number the page leans on, and reach is exact.

**There is no denormalized `viewCount` on `SharedPost`.** `likeCount` and
`commentCount` live there because every feed card reads them; views are read
only by the analytics page, which aggregates across posts anyway. A counter
column nobody on the hot path reads is just another thing that can drift out
of sync.

**The author never gets a row, and that is enforced in SQL.** The upsert is
one statement — `INSERT … SELECT viewer CROSS JOIN post … WHERE post."userId"
<> viewer.id ON CONFLICT … DO UPDATE … RETURNING`. A creator scrolling their
own published work would otherwise be their own biggest audience, which makes
every number on the page meaningless. Doing the check in the `WHERE` costs
nothing; a second round trip to fetch the author would double the price of
every scroll. When zero rows come back, one cheap lookup distinguishes
`"self"` from `"not-found"`.

**The write path is deliberately forgiving.** `PostViewTracker.ts` reports a
card once it is 60% visible for 1.2 seconds, guarded by a module-scoped
`Set` so filter changes and `router.refresh()` remounts don't re-report. The
route answers `204` for every outcome and swallows write failures — the
reader is not waiting on an answer, and a view is not worth an error toast.
The lib, by contrast, lets a database failure propagate: the route may
ignore it, but the lib must not *claim* a view that never landed.

**The window moves some numbers and not others.** `getCreatorAnalytics(id,
{days})` clamps `days` to 1..90 and passes it only to the per-post window
column and the trend. The totals are lifetime figures on purpose — a creator
who published last month still has the same likes when they switch to "last
7 days". `Number.isFinite` guards the clamp: `Math.floor(NaN)` is `NaN`,
`NaN` survives both `Math.min`/`Math.max`, and it would otherwise bind
straight into a `::int` placeholder and throw.

**The trend is generated, not derived from rows.** `generate_series` fills
every day in the window so quiet days show as zeroes instead of vanishing.
It is bucketed on `firstViewAt` for reach and `lastViewAt` for impressions,
which is approximate for the latter by design — the row only remembers its
most recent view, so a viewer who looked Monday and Thursday lands in
Thursday's bucket twice.

### Two bugs this slice's tests found

`testCreatorAnalytics.js` runs the real module against the real database, and
both of these surfaced immediately — neither was visible offline.

- **The trend was always empty.** `generate_series($2 - 1, 0, 1)` counts
  *up* from 29 to 0, which is no rows at all, so every window returned zero
  buckets. Fixed to `generate_series(0, $2 - 1, 1)` with the offset
  subtracted in the `SELECT`.
- **`windowViews` counted viewers, not impressions.** It used `COUNT(*)`
  over the view rows, so one person who looked four times in the window read
  as one — sitting right next to a "Views" column that meant something else.
  Fixed to `SUM(views)`.

A chart that renders empty and a stat that quietly undercounts both look
exactly like "you don't have traffic yet". Anything that aggregates needs a
test that puts a known number in and asks for it back.

### Testing it

`node scripts/testCreatorAnalytics.js` (85 assertions) covers the write and
read halves. Offline, over a recording adapter, it inspects the SQL: that the
upsert targets the `(userId, postId)` key and bumps the counter rather than
inserting, that it leaves `firstViewAt` alone, that the author is excluded
inside the statement, that neither id is interpolated, that a malformed
viewer id or empty post id never reaches SQL, that a no-op write is
classified `self` or `not-found` from one lookup, that a throwing write
propagates, and that every `$n` placeholder has a parameter. Against the
database it proves what a fake cannot: that repeat views collapse into one
row while still counting as multiple impressions, that the author's own view
is refused, that reach counts people while views count lookings, and that a
30-day trend returns thirty buckets with quiet days present as zeroes. It
skips rather than fails when no database is reachable.

---

## Publishing Profiles and Packs to Discover

Phase 7's last slice widened the feed itself. `SharedPost` is polymorphic —
`(itemType, itemId)` points at whatever was published — and it used to know
about three things. It now knows five: `PROFILE` (a Profile Builder
composition) and `PACK` (a server Aesthetic Pack).

**Two item types, two entitlements, so two routes.** A profile is owned by a
user, so it publishes through the ordinary `POST /api/feed` like everything
else. A pack is owned by a *server*, and the right to publish it is a Discord
permission, not an ownership row — so `PACK` is explicitly rejected on the
generic path ("Aesthetic Packs are published from Server Studio.") and has its
own guild-scoped `POST`/`DELETE /api/servers/[id]/packs/[packId]/publish`.
That route resolves the pack with `getPackInGuild(guildId, packId)` before
publishing, which is what makes `publishVerifiedItemToFeed()` (the variant
that skips the ownership check) safe: a pack fetched through a guild-scoped
query cannot be a pack from a server the publisher does not manage.

**`assertPublishableItem()` is the security boundary.** `(itemType, itemId)`
comes from a request body, so before anything is written the generic path runs
one `UNION ALL` over `SavedAesthetic`/`SavedPalette`/`Profile` joined to
`"User"` on the publisher's `discordId`. No row means 403 — *you can only
publish something of your own*. Without it, any signed-in account could
publish anyone's profile by guessing an id, since `Profile.id` is the only
thing the feed needs.

**Hydration returns flat cards.** `hydrateFeedPosts()` maps each post to
`{...post, media, attribution}` — `caption` and `authorDiscordId` are top
level, everything presentational (`title`, `palette`, `guild`, `kind`, …) is
under `.media`. A post whose source row has been deleted is *not* dropped; it
comes back with `media: null` and `FeedCard` renders a "this no longer
exists" fallback, so a like count never disappears with the thing it counted.

**The chip rename.** The old "Profiles" chip filtered `AESTHETIC`. With a real
`PROFILE` type in the feed that label became ambiguous, so the chips now read
"Aesthetics" (saved looks) and "Profiles" (Builder compositions), matching
`SHARED_ITEM_LABELS` on the cards.

**Publishing pays once per item, ever.** The Crown key is
`publish:<itemType>:<itemId>` — the *item*, not the post row. `shareItemToFeed`
upserts on `(userId, itemType, itemId)`, but deleting a post and re-sharing
mints a fresh post id; keying on that would turn unshare-and-republish into a
daily Crown farm.

**Six chips changed what the feed needs from the index.** Every chip and every
filtered search is `WHERE "itemType" = $n ORDER BY "createdAt" DESC LIMIT 18`.
The old `SharedPost_itemType_itemId_idx` can find the type but its second key is
`itemId`, so the rows come back unordered and each page sorts;
`SharedPost_createdAt_idx` gives the order but ignores the filter, so a narrow
chip like "Server packs" walks most of the feed backwards to fill one page.
`20261005130000_add_discover_item_type_sort_indexes` adds
`(itemType, createdAt)` and `(itemType, likeCount, createdAt)` — equality column
first, then the `ORDER BY` columns in precedence order — so the scan returns
rows already sorted and `LIMIT` stops at one page. Both are declared `ASC` even
though the feed sorts `DESC`: Postgres walks a btree backwards, so one index
serves either direction, and matching the schema keeps `prisma migrate diff`
quiet.

### Testing it

`node scripts/testPublishToDiscover.js` (267 assertions) covers the slice.
Offline, over a fake adapter with `next/server` stubbed and the real pure
`features.ts` loaded, it checks the enum and its migration, that
`assertPublishableItem` refuses another owner's item and rejects `PACK`, that
the ownership probe joins `"User"` rather than trusting a caller id, that
hydration produces flat cards with `null` media for a deleted source, that
`FeedCard` renders the pack and profile shapes, that every search match branch
is type-guarded and the term only ever travels as a parameter, that the
Discover chips expose both new types, that creator counts include both, and
that a publish pays once per item under a key that survives unshare-and-
republish. Against the real database it runs the whole round trip: publish,
re-publish reuses the row, wrong-owner and wrong-guild are refused, hydration,
search by name/colour/caption/tag, creator counts, the Crown ledger, and
unpublish/delete cleanup. It also asserts the chip indexes exist in the applied
schema and, with sequential scans disabled, that a filtered recent query really
does use `(itemType, createdAt)` and needs no `Sort` node — an index the planner
never picks is decoration. It finishes with a `tsc --noEmit` of the Studio, and
skips the database section rather than failing when none is reachable.

