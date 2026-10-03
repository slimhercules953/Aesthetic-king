# 👑 Aesthetic King

**Aesthetic King** is a Discord-focused creative identity platform built around profile customization, aesthetics, coordinated visual identities, and creative inspiration.

What began as an aesthetic Discord bot is evolving into a larger ecosystem consisting of:

- 🤖 **Aesthetic King Bot** — fast, Discord-native creation and generation
- 🎨 **Aesthetic King Studio** — the full web-based creative workspace
- 🏰 **Server Studio** — server-specific aesthetic configuration and management
- 📦 **Aesthetic Packs** — reusable coordinated visual identities
- 🖼️ **Asset Library** — searchable PFPs, banners, palettes, and visual assets
- 👤 **Profile Builder** — visual Discord profile creation
- ✨ **Complete My Profile** — automatically coordinate an entire profile from one starting element
- 🌎 **Aesthetic King Community** — discover, publish, remix, save, and reuse aesthetic identities
- 👑 **Premium & Crowns** — optional advanced tools while keeping the core product useful for free users

> **Aesthetic King should never become another generic Discord utility bot.**

Every feature should contribute to aesthetics, creativity, profiles, visual identity, inspiration, or community customization.

---

# 🌌 Product Vision

Aesthetic King is becoming a **creative identity platform for Discord**.

The long-term experience should allow someone to start with something as simple as:

- a color
- an aesthetic
- a mood
- a PFP
- a banner
- a palette
- an existing profile
- an Aesthetic Pack

…and turn it into a complete coordinated Discord identity.

The ecosystem should eventually support the complete creative loop:

```text
Discover
   ↓
Create
   ↓
Customize
   ↓
Save
   ↓
Publish
   ↓
Share
   ↓
Remix
   ↓
Use on Discord
```

The Discord bot and Studio are not separate products.

They are two interfaces into the same Aesthetic King ecosystem.

---

# 🤖 Aesthetic King Bot

The Discord bot provides quick access to Aesthetic King's creative tools directly inside Discord.

## Current Commands

### `/aesthetic`

The flagship Aesthetic King experience.

Generates a coordinated aesthetic profile concept using:

- aesthetic
- mood
- color direction
- PFP
- banner
- palette
- symbols
- username
- bio
- status
- Aesthetic Packs

The command supports interactive rerolling and coordinated profile generation.

### `/profile`

Creates coordinated Discord profile concepts.

Long-term, `/profile` should become tightly connected with:

- Aesthetic Packs
- Profile Builder
- saved profiles
- PFP/banner assets
- Complete My Profile

### `/theme`

Creates coordinated aesthetic themes.

Aesthetic Packs should provide reusable theme direction.

### `/palette`

Creates aesthetic color palettes.

Pack palettes will allow server identities and user creations to remain visually consistent.

### `/symbols`

Provides aesthetic symbols appropriate for different visual styles.

Aesthetic Packs can provide preferred symbol sets.

### `/status`

Generates Discord status ideas based on aesthetic and mood.

Pack integration should provide aesthetic/mood direction without forcing unrelated Pack properties into the command.

### `/username`

Generates aesthetic username ideas.

Pack integration should provide relevant aesthetic/mood context.

### `/bio`

Generates aesthetic Discord bios.

`/bio` is intentionally not part of the current Aesthetic Pack rollout.

### `/ping`

Diagnostic command.

`/ping` remains independent from aesthetic configuration and Packs.

---

# 🎯 Bot Design Philosophy

Aesthetic King should remain focused.

The bot should **not** expand into unrelated Discord utility categories such as:

- generic moderation
- music
- economy
- leveling
- tickets
- generic server administration
- unrelated AI chat

Other Discord bots may be studied for dashboard quality, onboarding, usability, or infrastructure ideas, but Aesthetic King's actual features should remain centered around creative identity.

---

# 🖼️ Embed-First Responses

Aesthetic King uses an **embed-first response system**.

Bot-facing responses should use polished Discord embeds whenever practical instead of plain text.

Examples include:

- command disabled
- wrong generation channel
- permission denied
- configuration confirmation
- errors
- warnings
- generation results

Generated creative content is generally public.

Administrative messages, restrictions, errors, and configuration responses are generally ephemeral.

---

# 📦 Aesthetic Packs

Aesthetic Packs are becoming one of Aesthetic King's core systems.

An Aesthetic Pack is a reusable preset representing a coordinated visual identity.

Example:

```text
Crimson Cathedral

Aesthetic: Gothic
Mood: Mysterious

Palette:
#09090B
#51182F
#8E405D
#C6A4B2

Symbols:
✦ ☾ ♱ †
```

## Pack Contents

A Pack can currently contain:

- Name
- Description
- Base Aesthetic
- Mood
- Color Palette
- Symbols
- Enabled/Disabled state
- Server ownership
- Created timestamp
- Updated timestamp

Future Packs may additionally contain:

- PFPs
- banners
- AI generation guidance
- asset associations
- creator information
- tags
- usage statistics
- Community publishing information

---

# ⚙️ Pack Resolution

Aesthetic Packs are presets rather than hard overrides.

Command options should always respect explicit user choices.

The resolution order is:

```text
Explicit Command Option
        ↓
Explicitly Selected Pack
        ↓
Server Default Pack
        ↓
Server Default Aesthetic / Mood
        ↓
Normal Command Behavior
```

A Pack should only fill information the user did not explicitly provide.

---

# 🧠 Meaningful Pack Integration

Aesthetic Pack support should **not** be added to commands simply because Packs exist.

A command should consume Pack properties only when those properties meaningfully improve the command.

Current direction:

```text
/aesthetic   ✅ Full Pack integration
/profile     🔜 Aesthetic + Mood + Colors + Symbols
/theme       🔜 Aesthetic + Mood + Colors + Symbols
/palette     🔜 Aesthetic + Mood + Colors
/symbols     🔜 Aesthetic + Mood + Symbols
/status      🔜 Aesthetic + Mood
/username    🔜 Aesthetic + Mood

/bio         ❌ No current Pack integration
/ping        ❌ No Pack integration
```

This prevents Packs from becoming unnecessary complexity.

---

# 🎨 Aesthetic King Studio

Aesthetic King Studio is the web-based creative workspace for the entire ecosystem.

The Studio is intended to handle workflows that would be awkward or impossible through Discord commands alone.

Its long-term role can be summarized through three major pillars:

```text
CREATE
DISCOVER
MANAGE
```

---

# ✨ CREATE

Studio should provide advanced creation tools.

Current and planned systems include:

- Create Studio
- Palette Studio
- Aesthetic Packs
- Profile Builder
- Complete My Profile
- AI-assisted generation
- asset selection
- profile customization

The goal is to allow users to visually construct complete identities rather than repeatedly generating isolated pieces.

---

# 🔎 DISCOVER

Users should be able to discover:

- PFPs
- banners
- palettes
- aesthetic combinations
- Aesthetic Packs
- profile designs
- creators
- seasonal content
- official Aesthetic King content
- Community creations

Discovery should eventually become one of the primary reasons to use Studio.

---

# ⚙️ MANAGE

Studio should also provide management for:

- Favorites
- Collections
- saved creations
- Aesthetic Packs
- servers
- server configuration
- published content
- Crowns
- Premium
- creator content

---

# 🏰 My Servers

Users authenticate through Discord and can see servers they have permission to manage.

The system checks whether the user:

- owns the server
- has Administrator
- has Manage Server

It also verifies whether Aesthetic King is actually installed.

Installed servers can be opened in **Server Studio**.

---

# 🛠️ Server Studio

Server Studio is the management center for Aesthetic King's server-specific functionality.

The planned information architecture is:

```text
Server Studio
│
├── Overview
├── Generation
├── Commands
├── Aesthetic Packs
├── Appearance
├── Access
└── Analytics
```

---

# 🏠 Server Overview

The future Overview should provide a quick picture of the server's Aesthetic King configuration.

Potential information includes:

- bot status
- generation channel
- default aesthetic
- default mood
- default Pack
- enabled commands
- Pack count
- recent generation activity
- configuration warnings
- quick actions

The Overview should answer:

> "How is Aesthetic King configured in this server?"

---

# 🎨 Generation Settings

Generation settings currently allow servers to configure:

- generation channel
- default aesthetic
- default mood

The bot reads these settings from the shared PostgreSQL database.

If a generation channel is configured, aesthetic-generation commands can be restricted to that channel.

---

# 🎛️ Command Management

Server administrators can independently enable or disable Aesthetic King commands.

Managed commands include:

- `/aesthetic`
- `/bio`
- `/palette`
- `/profile`
- `/status`
- `/symbols`
- `/theme`
- `/username`

`/ping` remains available as a diagnostic command.

Commands remain globally registered with Discord.

Disabled commands are blocked by Aesthetic King when executed rather than repeatedly registering/unregistering Discord commands.

---

# 📦 Server Aesthetic Packs

Server administrators can create reusable visual identities for their server.

Current functionality includes:

- create
- edit
- delete
- enable
- disable
- set Default Pack
- select aesthetic
- select mood
- configure colors
- configure symbols

Future improvements include:

- Pack assets
- Pack previews
- seasonal Packs
- AI-assisted Pack creation
- advanced Pack fields
- Pack analytics
- Community publishing
- Personal Packs
- Official Packs

---

# 🎭 Pack Types

The long-term Pack ecosystem should support multiple contexts.

## Server Packs

Created specifically for one Discord server.

## Personal Packs

Created by an individual and available across their Aesthetic King experience.

## Official Packs

Curated and maintained by Aesthetic King.

## Community Packs

Published creations that other users can discover, save, remix, or use.

The exact ownership and publishing model should remain explicit so private server content never becomes public automatically.

---

# 🖼️ Asset Explorer / Library

Aesthetic King's existing Cloudflare R2 PFP/banner collection should evolve into a proper **Asset Explorer**.

Assets should eventually have structured metadata including:

- aesthetic
- mood
- dominant colors
- tags
- keywords
- PFP/banner relationship
- profile set
- associated Pack
- creator/source
- usage information

Instead of browsing raw files, users should browse meaningful visual content.

Example:

```text
Gothic Profile Set

Aesthetic:
Gothic

Mood:
Mysterious

Palette:
Black • Crimson • Silver

Includes:
PFP
Banner
```

---

# 👤 Profile Builder

Profile Builder should become one of Studio's flagship features.

Users should be able to visually construct a Discord-style profile using:

- PFP
- banner
- username
- display name
- bio
- status
- palette
- accent colors
- aesthetic
- mood
- symbols
- Aesthetic Pack

The interface should provide a visual Discord-style preview while editing.

Instead of generating isolated pieces, users can see how everything works together.

---

# ✨ Complete My Profile

**Complete My Profile** should allow someone to start with one piece of their identity and have Aesthetic King coordinate the rest.

Examples:

```text
Start with a PFP
        ↓
Find matching banner
        ↓
Generate palette
        ↓
Determine aesthetic
        ↓
Determine mood
        ↓
Suggest username
        ↓
Suggest status
        ↓
Suggest symbols
        ↓
Complete Profile
```

Other starting points could include:

- banner
- palette
- aesthetic
- mood
- Pack
- existing profile

This should combine Aesthetic King's asset library, AI, palettes, Packs, and Profile Builder into one workflow.

---

# ❤️ Favorites

Users can save content they want to return to later.

Favorites should eventually work across the ecosystem rather than existing as an isolated feature.

Potential favorite types include:

- assets
- Packs
- Community Profiles
- palettes
- creators

---

# 📚 Collections

Collections allow users to organize inspiration.

Example:

```text
Dark Gothic Inspiration

├── Crimson Cathedral Pack
├── Gothic Profile
├── Black/Red Palette
├── PFP
└── Banner
```

Community, Asset Explorer, Profile Builder, and Packs should reuse the existing Collections system rather than creating separate organizational systems.

---

# 🤖 AI

Aesthetic King uses AI as a creative assistant rather than making AI the entire product.

AI can assist with:

- aesthetic recommendations
- usernames
- statuses
- bios
- Pack generation
- profile coordination
- matching assets
- Complete My Profile
- creative recommendations

The project is moving toward local/self-hosted AI through **Ollama** where practical.

Image-to-Aesthetic analysis is planned as a Premium capability.

---

# 🌎 Aesthetic King Community

Aesthetic King Community is the long-term discovery and sharing layer for the platform.

It should answer:

> **"I want inspiration for my Discord identity. What can I discover, save, remix, or use?"**

It should NOT become:

> **"What random social posts are people making today?"**

Community should remain focused on creativity and identity.

---

# 🌐 Community Loop

The central Community loop should be:

```text
Create
   ↓
Publish
   ↓
Discover
   ↓
Save
   ↓
Use
   ↓
Remix
```

Existing Studio systems should feed directly into this loop.

---

# 👤 Community Profiles

Users should eventually be able to publish complete Discord-style identities.

Community Profiles can include:

- PFP
- banner
- username
- bio style
- status
- palette
- aesthetic
- mood
- symbols
- Aesthetic Pack
- creator
- tags

The profile should be displayed using a visual Discord-style profile preview.

Community Profiles should support useful actions such as:

- Use Palette
- Use Bio Style
- Save PFP
- Save Banner
- Use Pack
- Add to Collection
- Remix

---

# 🎨 Community Discover

The Community Discover experience may include:

```text
Community
│
├── Featured
├── New
├── Profiles
├── Aesthetic Packs
├── Creators
├── Official
└── Seasonal
```

Users should eventually be able to filter by:

- aesthetic
- mood
- color
- tags
- content type
- creator
- newest
- popularity

Search should support Packs, Profiles, creators, aesthetics, moods, and tags.

---

# 👑 Creator Profiles

Creators should eventually have public Aesthetic King profiles.

A creator page may show:

- display name
- avatar
- creator bio
- published profiles
- published Packs
- featured creations
- public Collections
- favorite aesthetic
- creator statistics

The primary purpose is to answer:

> **"What has this person created?"**

It should not become a generic social-media profile.

---

# 🔄 Remixing

Community should encourage creative reuse.

A user may discover another profile or Pack and use it as inspiration for their own creation.

Remixes should preserve attribution to the original creator where appropriate.

Long term, remix usage may contribute to creator rewards.

---

# ❤️ Community Reactions

Community can support positive feedback such as **likes**.

The current direction does not require downvotes.

The goal is to recognize good creations without turning Community into a competitive voting system.

---

# 👑 Crowns

**Crowns** are a planned Aesthetic King reward currency.

Users may eventually earn Crowns through meaningful participation such as:

- creating useful Community content
- having creations used by others
- remix attribution
- Community participation
- voting for Aesthetic King on services such as Top.gg

Crowns should reward participation without encouraging spam.

Potential uses include:

- individual Premium actions
- advanced generation
- premium creative tools
- temporary unlocks
- eventually earning costly Premium time

The exact economy must be carefully balanced before implementation.

---

# 💎 Premium

Aesthetic King should maintain a useful free experience.

Premium should enhance creativity rather than lock away the basic product.

## Free Direction

Free users should retain meaningful access to:

- core bot commands
- Studio
- basic profile creation
- basic Packs
- palettes
- Favorites
- Collections
- Community browsing
- Community participation

## Premium Direction

Potential Premium capabilities include:

- Image-to-Aesthetic
- advanced Profile Builder features
- more Packs
- advanced Pack fields
- premium assets
- advanced editing
- enhanced AI generation
- additional saved content
- advanced exports
- creator customization
- deeper analytics
- advanced server customization

Crowns may eventually provide limited access to individual Premium actions without requiring a recurring subscription.

---

# 📊 Analytics

Analytics should remain focused on useful aesthetic/product information.

Potential Server Studio analytics:

- command usage
- most-used aesthetics
- most-used moods
- most-used Packs
- generation counts
- popular palettes

Potential creator analytics:

- profile views
- saves
- Pack uses
- remixes
- Community engagement

Avoid adding analytics simply for the sake of having charts.

---

# 🔐 Security

Aesthetic King Studio uses Discord OAuth.

Security principles include:

- OAuth tokens are never stored in browser sessions
- OAuth credentials are encrypted at rest
- sessions are signed
- sensitive routes verify authorization independently
- server management routes verify Discord ownership/permissions
- guild IDs supplied by clients are never blindly trusted
- server content remains isolated from unrelated servers
- private content should never become Community content automatically

Server authorization recognizes:

- server owner
- Administrator
- Manage Server

---

# 🗄️ Data & Infrastructure

Current infrastructure includes:

### Bot

- Node.js
- Discord.js
- JavaScript
- Prisma
- PostgreSQL
- Cloudflare R2
- Canvas
- Ollama
- PM2
- Raspberry Pi hosting

### Studio

- Vinext
- Vite
- TypeScript
- Tailwind
- Cloudflare Workers
- Wrangler
- PostgreSQL
- Hyperdrive
- Discord OAuth
- R2
- Ollama
- Lucide React

---

# 🧭 Product Roadmap

The roadmap should remain incremental.

## Current Foundation

- Bot V2 architecture
- aesthetic system
- mood system
- R2 assets
- color extraction
- profile rendering
- Ollama integration
- Discord OAuth
- PostgreSQL
- secure Studio sessions
- My Servers
- Server Studio
- generation channel
- default aesthetic
- default mood
- Command Management
- system embeds
- Favorites
- Collections
- Palette Studio
- Create Studio
- Aesthetic Packs
- `/aesthetic` Pack integration

---

## Phase 1 — Finish Aesthetic Packs

Continue meaningful Pack integration with:

```text
/profile
/theme
/palette
/symbols
/status
/username
```

Do not add Pack support to `/bio` at this stage.

Then improve Pack management and defaults.

---

## Phase 2 — Expand Server Studio

Build:

```text
Overview
Generation
Commands
Aesthetic Packs
Appearance
Access
Analytics
```

Keep each section focused on Aesthetic King rather than generic Discord administration.

---

## Phase 3 — Asset Explorer

Transform the existing R2 collection into a searchable, categorized visual library.

Add:

- metadata
- aesthetic classification
- mood classification
- colors
- tags
- search
- filters
- Favorites
- Collections
- Pack associations

---

## Phase 4 — Profile Builder

Create the visual Discord profile construction experience.

Connect:

- assets
- palettes
- Packs
- aesthetics
- moods
- generated content
- Favorites
- Collections

---

## Phase 5 — Complete My Profile

Allow Aesthetic King to coordinate an entire identity from a single starting point.

---

## Phase 6 — Free / Premium / Crowns

Define clear boundaries before large Premium systems are implemented.

Introduce Premium only where it provides meaningful additional value.

Develop the Crown economy carefully before making rewards permanent.

---

## Phase 7 — Aesthetic King Community

Begin with structured, reusable creative content.

A sensible starting point is:

```text
Published Aesthetic Packs
        ↓
Discover
        ↓
Pack Details
        ↓
Save / Favorite
        ↓
Use / Remix
```

Then expand into:

- Community Profiles
- creator profiles
- published Profile Builder creations
- Complete My Profile publishing
- search
- filters
- official content
- seasonal content
- creator analytics

---

# 🚫 Features to Avoid

Aesthetic King should not drift into generic Discord-bot territory.

Avoid unrelated features such as:

- moderation suites
- music players
- ticket systems
- economy commands unrelated to Aesthetic King
- generic leveling
- generic AI chat
- unrelated server utilities

Before adding a feature, ask:

> **Does this help someone create, discover, manage, share, or use a better Discord identity?**

If the answer is no, it probably does not belong in Aesthetic King.

---

# ⭐ North Star

The long-term goal is not simply to have more Discord commands.

The goal is for a user to be able to say:

> **"I want my Discord profile to look better, but I don't know where to start."**

Aesthetic King should be able to take them from that point all the way to:

```text
Aesthetic
+
Mood
+
PFP
+
Banner
+
Palette
+
Username
+
Bio
+
Status
+
Symbols
+
Aesthetic Pack
+
Complete Profile
```

They should then be able to save it, use it, share it, discover other creations, and continue building their identity across both Discord and Aesthetic King Studio.

---

# 👑 The Future of Aesthetic King

Aesthetic King is evolving through three connected layers:

```text
                 AESTHETIC KING

        ┌──────────────┬──────────────┐
        │              │              │
        ▼              ▼              ▼
       BOT           STUDIO        COMMUNITY
        │              │              │
    Generate        Create         Discover
    Use Packs       Customize      Publish
    Quick Tools     Manage         Remix
    Discord         Servers        Creators
        │              │              │
        └──────────────┼──────────────┘
                       ▼
              CREATIVE IDENTITY
                    PLATFORM
```

The bot provides speed.

Studio provides depth.

Community provides discovery.

Aesthetic Packs connect the ecosystem.

And the user's Discord identity remains at the center of everything.