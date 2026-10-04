# Privacy Policy for Aesthetic King
Last updated: **October 2, 2026**

Welcome to the Privacy Policy for Aesthetic King. This document explains what the bot and the Aesthetic King Studio website actually store, why it is stored, how long it is kept, and how to get it removed.

Earlier versions of this policy said the bot "does not store any data." That was true of the original command-only bot, but it is no longer accurate: saving aesthetics, building collections, sharing to the community feed, and Premium all require an account, and an account means records. This version describes the system as it exists today.

---

## 1. Information We Collect

### 1.1 Account and identity data

When you sign in to Aesthetic King Studio with Discord (OAuth2, `identify` and `guilds` scopes) we create an account containing:

- Your **Discord user ID** — the permanent identifier we use to look your account up.
- Your **username / display name** and **avatar hash**, copied from Discord so the site can show who you are. These refresh when you sign in again.
- Your **Discord OAuth2 access and refresh tokens** and the granted scope list, so the site can act as you (for example, to list the servers you are in). These are stored so the session survives a page reload, and you can revoke them at any time (see §6).

We do not ask for your email address, phone number, or date of birth, and we do not collect them.

### 1.2 Content you create

Anything you save in the Studio is stored so you can come back to it:

- **Saved aesthetics and saved color palettes** — the text, styles, and color values you generated or entered.
- **Collections and the items inside them**, plus **favourited assets**.
- **Generated output** produced by the AI features, kept so you can review or reuse it.

### 1.3 Community feed data

If you publish something to the Discover feed, the post (its content, your caption, and any tags) is stored and shown to other users, together with:

- **Likes** you give — stored as a (you, post) pair so the same post cannot be liked twice.
- **Comments** you write, with their timestamp.

Anything you publish to the feed is visible to other users. Treat captions and comments as public.

### 1.4 Server (guild) data

For server-side features we store the server ID, the server's name, and the settings you or another admin configure for it (enabled aesthetic packs, default pack, command settings). We read your server list from Discord when you open the server pages; we do not store a copy of your member list, roles, or message content.

### 1.5 Premium, usage, and payment records

If you buy Premium or use Crown-funded features, we keep:

- **Entitlement records** — the plan you hold, when it started and when it ends, how it was obtained, and (for store purchases) the store SKU and the payment provider's own reference for the purchase.
- **Crown transactions** — an append-only ledger of every Crown credit and debit, including purchases, spends, refunds, and an idempotency key so a double-submitted request cannot be charged twice.
- **Feature usage counters** — how much of a metered feature you have used in the current period, so free and Premium limits can be enforced.

We do **not** store card numbers, wallet details, or other payment instrument data. Card details are handled entirely by the payment provider (Discord's store or our processor); only the provider's transaction reference reaches us.

### 1.6 Information we do not collect

We do not collect message content, direct messages, friend lists, precise geolocation, or browsing history outside this site. We do not run third-party advertising trackers.

---

## 2. How We Use Your Information

Your data is used only to operate the product:

- To recognise you across requests and keep you signed in.
- To save and restore the aesthetics, palettes, and collections you create.
- To attribute community posts, likes, and comments to you.
- To enforce free-tier limits and unlock features you have paid for.
- To charge correctly, prevent duplicate charges, and honour refunds.
- To apply per-server configuration where a server admin has enabled the bot.
- To provide support when you contact us, and to keep the service secure and abuse-free.

We do not sell your personal data, and we do not use your content to train third-party AI models.

---

## 3. Data Storage & Retention

Data is stored in our own Postgres database hosted for this application. It is not written to Discord, and Discord itself only sees the standard OAuth handshake.

Retention works as follows:

- **Account, saved content, collections** — kept until you delete them or ask us to close your account.
- **OAuth tokens** — kept until they expire or you revoke them; revoking at Discord makes the stored copy useless within minutes.
- **Community posts, likes, comments** — kept until you delete them, or until your account is deleted (deleting your account removes your posts, likes, and comments).
- **Entitlement records** — kept after they expire. A record of what you once purchased is what lets us restore access, answer billing questions, and process a refund against the right purchase.
- **Crown transactions** — kept indefinitely. The ledger is append-only by design: transactions are reversed with a compensating entry rather than erased, which is what makes the balance auditable.
- **Feature usage counters** — reset at the end of each usage period.

If you request deletion, we remove your account and content. Where a payment record must be retained for accounting, tax, or dispute handling, only the minimum needed for that purpose is kept, and it is detached from your profile.

---

## 4. Sharing Your Information

We do not sell, rent, or trade personal data.

We share data only in these narrow circumstances:

- **With the services that run the product** — our hosting and database providers process data on our behalf under their own terms, and Discord's API is called to authenticate you and read your server list.
- **With a payment provider** — when you buy something, the provider receives the transaction data it needs to process the payment.
- **Publicly, because you chose to** — anything you publish to the Discover feed is visible to other users.
- **When legally required** — we may disclose data if compelled by a valid legal request, or where strictly necessary to protect users, prevent abuse, or protect our own rights.

---

## 5. Security Measures

- OAuth tokens are stored server-side and are never exposed to the browser.
- The session cookie is signed, `HttpOnly`, and `Secure`; it contains only your Discord ID, username, and avatar hash — never your plan, balance, or tokens.
- Every Premium, limit, and Crown check is re-verified against the database on each request, so a tampered cookie cannot grant access.
- Crown debits happen inside a database transaction with an idempotency key, so a network retry cannot spend your balance twice.
- Database access is restricted to the application, and we follow Discord's platform and developer requirements.

No system is perfectly secure. If you believe an account has been compromised, tell us in the support server and revoke the bot's access from your Discord **Authorized Apps** settings.

---

## 6. Your Rights & Control

You can:

- **Revoke access immediately** — open Discord **User Settings → Authorized Apps** and remove Aesthetic King. This invalidates the tokens we hold.
- **Delete your content** — remove saved aesthetics, palettes, collections, feed posts, and comments from the Studio at any time.
- **Export or delete your account** — ask us in the support server and we will provide the data tied to your account and/or delete it.
- **Cancel Premium** — cancelling at the store stops future renewals; access continues until the period you already paid for ends.

---

## 7. Children's Privacy

Aesthetic King is not directed at children under 13 (or the minimum age of digital consent in your country). Discord's own terms set a minimum age for the platform. If we learn that a child has provided personal data, we delete it.

---

## 8. Changes to This Policy

This policy will be updated as the product changes. Changes will be:

- Announced in our support server.
- Reflected here with a new "Last Updated" date.

Material changes to what we collect will be announced before they take effect.

---

## 9. Contact Us

For questions, concerns, deletion requests, or feedback, please contact us:

- Username: P4rz1val
- Support Server: [Authentic Aesthetics](<https://discord.gg/gWVNterjmH>)

Thank you for using **Aesthetic King**!
