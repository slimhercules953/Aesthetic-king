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
except `topgg_vote` is wired into the product, so it is always live; a
Top.gg vote can only arrive through the webhook, so the source is hidden
until `TOPGG_WEBHOOK_SECRET` is set — the same condition the route uses
to answer 404. Advertising "10 Crowns for voting" when no vote can be
received is a promise the product cannot keep. Hiding a source hides the
offer only: rows already awarded under it still appear in the history
and still count toward today's total.

Product code never calls `awardCrowns` directly — it calls one of
`awardForPublish`, `awardForLike`, `awardForComment`,
`awardForDailyVisit` or `awardForTopggVote`. Three rules those hooks
enforce, all of them anti-farming:

- **An idempotency key per event, not per call.** `publish:<itemType>:<itemId>`
  (not the post id — unsharing and re-sharing mints a new post id, which
  would otherwise be a way to re-earn), `like_received:<postId>:<liker>`
  (unliking and re-liking pays once), `comment_received:<commentId>`,
  `daily_visit:<UTC day>`, `topgg_vote:<voter>:<UTC day>`. The unique
  index on `(userId, idempotencyKey)` is what actually enforces this.
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

**Top.gg votes.** Not live yet — the Studio has no public origin to
receive webhooks, so nothing can earn this source and the Earn page hides
it (see `isEarnSourceLive` above). The route is built and tested so that
turning it on is a config change, not a code change.

`app/api/webhooks/topgg/route.ts` receives vote webhooks at
`POST /api/webhooks/topgg`. Set `TOPGG_WEBHOOK_SECRET` to the webhook
authorization token you configure on Top.gg; requests are compared
against it in constant time. Without the variable the route answers `404`
so an unconfigured deployment exposes nothing. Only `type: "upvote"` pays
— `test` and `revote` are acknowledged and ignored, so Top.gg's "Test
Webhook" button verifies the URL and secret without minting Crowns — and
the vote pays the *voter*, not the bot owner. An unknown Discord id is
acknowledged with `200` but invents no account and no balance.

`node scripts/testCrownEarning.js` covers all of it without a database,
including the webhook route itself (82 assertions).

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
`/dashboard/u/[discordId]` renders `getCreatorProfile()` +
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

