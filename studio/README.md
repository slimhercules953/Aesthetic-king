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
- `lib/gate.ts` enforces limits server-side. Every protected route
  calls `requireFeature` — hiding a button is not a limit.

Pages: `/dashboard/premium`, `/premium/usage`, `/premium/crowns`,
`/premium/billing`.

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

- `lib/guildAppearance.ts` — per-server embed colour, footer and display
  toggles on `GuildSettings`. A server with no settings row is not an
  error; the defaults are returned so the form renders.
- `lib/guildAccessRules.ts` — ordered allow/deny rules over roles and
  channels. Semantics match the bot exactly: no rules is open, a
  matching DENY denies, any ALLOW present requires a match, otherwise
  open.
- `lib/guildAnalytics.ts` — five aggregate queries over `GuildUsageEvent`.
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
should type those `string | Date` and normalise, as
`components/servers/ServerAnalytics.tsx` does.

**Always list `createdAt` and `updatedAt` in an `INSERT`.** `@updatedAt` in
the Prisma schema is a client-side convention, so the column is `NOT NULL`
with no database default. Postgres checks `NOT NULL` when it builds the
candidate tuple — *before* `ON CONFLICT` runs — so an upsert that omits
`updatedAt` fails with `23502` even when it resolves to the update branch.
`scripts/testStudioPhase2.js` has a "Studio SQL" section that runs these
statements against the real schema for exactly that reason.

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
in `lib/entitlements.ts` or Premium will be labelled promotional.

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
pronouns, bio, status, palette, symbols, accent colour and an optional
asset set — against a live preview of the card.

**The preview is DOM, not canvas.** The bot draws profiles with
`node-canvas` in `src/services/rendering/profileRenderer.js`, and the
Studio runs on Workers, which has no canvas binding. So
`components/profile/ProfilePreview.tsx` renders the card in markup. It is
a server component with no state and no handlers: every colour and string
arrives already resolved in a `ProfilePreviewState`, which is why the
fallback rules (what shows when the name is blank, what colour text goes
on a mid-tone background, how a one-colour palette is padded) live in
`lib/profileModel.ts` where they can be asserted rather than in JSX. It
is a likeness of Discord's card, not a pixel copy.

**A `Profile` is not a `SavedAesthetic`.** They overlap in fields and
share nothing in code. A saved aesthetic is a palette someone kept out of
the library; a profile is the identity they present, with its own text,
its own active flag and its own renderer. Splitting them keeps the
aesthetic library from growing a bio column every time the card gains a
field.

**Everything is clamped on the way in.** `parseProfileInput` in
`lib/profileModel.ts` enforces `PROFILE_LIMITS` and normalises colours,
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
The first asserts the pure model — clamping, normalisation, contrast,
preview fallbacks, completeness. The second connects to the real
database and runs `lib/profiles.ts`'s SQL against the real schema,
because the Studio has no Prisma client: every statement is hand-written
text, so a wrong column name is only discoverable as a 500 in a browser.
It skips itself when the database is unreachable rather than failing.

