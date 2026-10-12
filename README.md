# Nerafi

Testnet-only Chrome extension wallet that explains transactions before you sign.

[![CI](https://github.com/joshuamhone/nerafi/actions/workflows/ci.yml/badge.svg)](https://github.com/joshuamhone/nerafi/actions/workflows/ci.yml)

> **Warning:** Nerafi is an educational portfolio project. It is testnet only.
> **Never use it with real funds or a real recovery phrase.** It has not been
> audited, and it makes no security guarantees.

## Status

- **Milestone 1 — complete:** wallet creation and recovery-phrase onboarding.
- **Milestone 2 — complete:** encrypted vault (password-based encryption,
  lock/unlock).
- **Milestone 3 — complete:** Sepolia balance, plain-English transaction review,
  signing, and sending.
- **Milestone 4 — complete:** app shell with sidebar navigation, overview and
  receive pages, a locally rendered QR code, and one consistent way of showing
  big-int numbers.
- **Milestone 5 — complete:** activity history: an Activity page and a
  transaction detail view fed by the public Blockscout explorer API, a
  recent-activity panel on the Overview, and local sent records that show as
  pending until the explorer indexes them.
- **Milestone 6 — complete:** multiple accounts under one phrase, a Settings page
  (auto-lock interval and change password), unlock backoff, a local security log,
  and a sidebar account switcher.

## Features

**Milestone 1 — onboarding**

- **BIP-39 12-word phrase generation.** 128 bits of entropy drawn from
  `crypto.getRandomValues` via viem and `@scure/bip39`.
- **Checksum validation.** Phrases are checked against the BIP-39 English
  wordlist and checksum before use.
- **BIP-44 derivation** at `m/44'/60'/0'/0/0`.
- **Full-page onboarding** in a dedicated tab: generate, reveal, confirm three
  random words, then set a password.

**Milestone 2 — encrypted vault**

- **Password-encrypted vault.** The phrase is encrypted with PBKDF2-HMAC-SHA256
  (600,000 iterations and a 16-byte random salt) and AES-256-GCM (a 12-byte
  random IV) before it is saved to `chrome.storage.local`.
- **Lock and unlock.** The wallet unlocks with the password and keeps only the
  wallet address and an expiry time in `chrome.storage.session` (in memory only)
  while it is open; the recovery phrase is not kept there.
- **Auto-lock.** The wallet locks 15 minutes after unlocking by default; the
  interval (1/5/15/30/60 minutes) is chosen on the Settings page.
- **Restore.** An existing recovery phrase can be restored, with a confirmation
  that this replaces the saved wallet.
- **One extension permission.** The manifest requests only `storage`.

**Milestone 3 — send test ETH**

- **Sepolia balance.** The unlocked screen shows the wallet's balance, with a
  Refresh button.
- **Plain-English review.** Before signing, Nerafi explains the transfer and
  shows the exact recipient, amount, maximum fee, and total.
- **Password re-entry.** Sending requires the password again, even while the
  wallet is unlocked.
- **Sepolia-only signing.** The RPC's chain ID is checked immediately before
  every signature, and transactions are signed with chain ID 11155111 (EIP-155),
  so they cannot be replayed on mainnet.
- **Local signing.** The private key is derived only at signing time and never
  leaves the extension; only the signed transaction is sent to the RPC.
- **One RPC endpoint.** Balance lookups and sends use a single keyless public
  Sepolia endpoint.

**Milestone 4 — wallet shell, overview, and receive**

- **Sidebar navigation.** The unlocked wallet uses sidebar navigation with
  simple hash routes (`#/overview`, `#/send`, `#/receive`): a fixed sidebar at
  wider widths, collapsing to a compact top bar below 900 px.
- **Overview.** The opening page shows the balance (rounded down, see Display
  numbers below), an address card, a live Sepolia network panel (chain ID,
  latest block, RPC host), and a quiet loading skeleton while the RPC responds.
- **Receive page.** Your address in chunked form, an inline QR code of the
  EIP-681 URI `ethereum:<address>@11155111`, and a user-initiated copy button.
- **Local QR generation.** The QR is rendered on the page with the
  zero-dependency `qr` package — bundled locally, no network request, no API
  key.
- **Consistent numbers.** All display amounts go through one big-int formatter:
  balances round down, limits round up ("at most"), and typed amounts are shown
  in full.

**Milestone 5 — activity history**

- **Activity page.** Sent, received, and self transfers grouped by local day,
  with a segmented filter (All / Sent / Received) and a search box that matches
  hashes and addresses, case-insensitively.
- **Transaction detail.** Every activity row links to a detail view showing the
  hash, status, direction, full from/to addresses, the amount and network fee in
  full precision, block, nonce, time (local and ISO), the data source, and a
  Sepolia Etherscan link. A failed transaction's reason text from Blockscout is
  shown, and a contract creation shows the created contract's address when
  Blockscout returns one.
- **Recent activity on the Overview.** The five newest transactions appear under
  the address card, linking to the full Activity page.
- **Blockscout as the data source.** History is read on demand from the public
  `eth-sepolia.blockscout.com` API — no API key, and no standing permissions.
  Status, labels and amounts come from Blockscout and are not independently
  verified by Nerafi. Loading more is always user-initiated ("Load more"), never
  automatic.
- **Local sent records.** The last 50 sent transactions are mirrored on the
  device (`nerafi.localTx`) and shown as "Pending" with "Sent from Nerafi · not
  yet indexed by Blockscout" until Blockscout returns the same hash, which
  deletes the local copy. After 30 minutes the note warns that the transaction
  may have been dropped. The mirror exists only to cover the gap before
  indexing.
- **Never truncated addresses.** Every activity row and the detail view render
  the full counterparty and transaction addresses with the same chunked display
  used everywhere else, so a changed character stays easy to spot.

**Milestone 6 — accounts and session security**

- **Multiple accounts.** Up to ten accounts are derived from the one recovery
  phrase at `m/44'/60'/0'/0/{index}`. The sidebar switcher shows each account by
  name and full address; adding an account asks for the password, renaming only
  changes the local label. Activity and self-send hints follow the active
  account.
- **Settings page** (`#/settings`). Choose the auto-lock interval, rename accounts,
  add an account, and change the password. Shortening the auto-lock applies to the
  current session at once; lengthening it waits for the next unlock so a session
  can never be extended without the password.
- **Unlock backoff.** After five consecutive wrong passwords, unlocking is delayed
  (30 seconds, doubling, capped at 15 minutes); the field is disabled with a live
  countdown, and a refused attempt does not derive a key or count again.
- **Change password.** The current password is verified, the new one must meet the
  policy and differ, and the vault is re-encrypted with a fresh salt and IV that is
  verified to round-trip before it replaces the old one.
- **Local security log.** The last 200 events (unlock, lock, auto-lock, failed
  unlock, lockout, password/account/auto-lock changes, address mismatch, restore)
  are recorded locally with fixed-format details only — never addresses, amounts,
  names, passwords, or phrases.

## Design

The wallet is styled like a security document. The one irreversible action —
signing — is presented as a paper cheque you sign, while the rest of the wallet
stays on a dark, restrained surface. The goal is to make signing feel deliberate
and to keep everything being approved on one calm page.

- **The cheque review.** The review screen is a paper-coloured document with a
  guilloché border band, a plain-English memo, and a rule-lined field list (pay
  to, amount, maximum fee, total, network). The password field is drawn as a
  signature line, labelled "Sign with your password", and the confirm button uses
  an ink-on-foil treatment. The guilloché lines are generated procedurally from
  deterministic sine/cosine maths, with no randomness, and are decorative only.
- **The auth seal.** The onboarding brand seal is the same procedural guilloché,
  drawn in a brighter engraved line, `--intaglio-light` (`#5A8A85`, 3.75:1 on
  `--surface`). It is decorative only — never text or focus — and is scoped to
  the onboarding layout, so the cheque and the sidebar logo keep the shared
  guilloché treatment.
- **Chunked addresses.** Addresses are always shown in full, never truncated,
  grouped into four-character chunks with the `0x` prefix separated, and
  alternating between two colours so that a changed character is easier to spot.
  A screen reader receives the plain, unbroken address instead. This rule
  applies everywhere, including compact activity rows.
- **Activity comes from a public explorer.** History is read from
  `eth-sepolia.blockscout.com` when the Activity page or the Overview asks for
  it, so it can lag the network by a few seconds. The explorer is a third party
  and its labels are untrusted, which is why the page calls out scam labels
  without endorsing them.
- **Numbers, never rounded silently.** Balances, limits, and amounts share one
  big-int-only format module (`lib/wallet/format.ts`). Balances round down to
  six decimals so the screen never claims more than you hold; fees and totals
  round up to six decimals so "at most" never understates what can leave; the
  amount you type keeps its full precision everywhere on the cheque and the
  receipt. Each value's exact form is available in a hover tip and in the
  review screen's "Exact values" details.
- **Bundled fonts and icons.** IBM Plex Sans (UI) and IBM Plex Mono (addresses
  and hashes, with tabular numerals for amounts) are bundled locally through
  Fontsource; the icons are inline SVG. Nothing is fetched from a CDN, so the
  interface makes no network request to render.
- **Reduced motion.** The confirmed-transaction stamp and the pending indicator
  are the only non-user-triggered animations, and both sit inside
  `@media (prefers-reduced-motion: no-preference)`, so they are disabled when the
  operating system asks for reduced motion.

## Getting test ETH

To try sending, you need Sepolia test ETH on the address for your test recovery
phrase. Use a Sepolia faucet and paste that address in.

> **Never use a real wallet or a real recovery phrase.** Nerafi is for testnet
> play only. Use a throwaway phrase, and treat any address and phrase it shows as
> disposable.

## Getting started

Prerequisites: Node 20+ and Chrome.

Run these commands inside the `extension/` directory:

- `npm install` — installs the extension's dependencies.
- `npm run dev` — launches Chrome with the extension loaded and reloads it as
  you edit.
- `npm test` — runs the unit tests with Vitest.
- `npm run compile` — type-checks the project without emitting files.
- `npm run build` — produces a production build in `.output/`.

## Project structure

```
extension/
  entrypoints/
    popup/            Popup with the "Open wallet" button.
    wallet/           Full-page UI shell and state machine (App.tsx).
      screens/        Full-screen views (welcome, reveal, review, send, ...).
      pages/          Shell pages: Overview, Receive, Activity, and Settings.
      shell/          Sidebar, app-shell layout, account switcher, and dialogs.
      AuthLayout.tsx  Split brand/task layout for the onboarding screens.
      context.tsx     Wallet state (balance, network, accounts) with refresh.
      router.ts       Hash routes: overview, activity, send, receive, settings.
    background.ts     Background service worker.
  components/         Shared UI (Button, Field, AddressText, Guilloche, ...).
  assets/styles/      Design tokens and base styles.
  lib/wallet/
    account.ts        Phrase generation, checksum validation, address derivation.
    confirm.ts        Random confirmation-word selection and answer checking.
    vault.ts          Password-based encryption and decryption of the phrase.
    storage.ts        chrome.storage wrappers for the vault and session.
    accounts.ts       Multiple accounts, names, migration, and the account session.
    settings.ts       Auto-lock interval settings and their persistence.
    unlock.ts         Central password check (openVault) and unlock backoff.
    securityLog.ts    Local security-event log (last 200, fixed-format details).
    network.ts        Sepolia chain ID, RPC client, and balance lookup.
    send.ts           Recipient/amount parsing, review building, and signing.
    format.ts         Big-int formatting for display (down, up, exact).
    receive.ts        Receive URI (EIP-681) construction.
    history/
      types.ts        Activity types and the history-provider interface.
      blockscout.ts   Strict Blockscout API parsing, pagination, and timeouts.
      local.ts        Local sent-transaction records (last 50) and merging.
      blockscout.test.ts  Parser tests against the recorded fixture.
      local.test.ts       Local-record and merge tests.
      fixtures/       A recorded Blockscout transaction plus variants.
    input.ts          Recovery-phrase input normalization.
    account.test.ts   Tests for phrase generation and derivation.
    confirm.test.ts   Tests for confirmation-word selection and checking.
    vault.test.ts     Tests for encryption, decryption, and parsing.
    storage.test.ts   Tests for the storage wrappers.
    accounts.test.ts  Tests for account storage, migration, and switching.
    settings.test.ts  Tests for auto-lock settings and their effects.
    unlock.test.ts    Tests for the password check and unlock backoff.
    securityLog.test.ts  Tests for the security log and its bounds.
    network.test.ts   Tests for the Sepolia chain-ID check.
    send.test.ts      Tests for parsing, review math, and signing.
    format.test.ts    Tests for number formatting bounds and properties.
    receive.test.ts   Tests for receive-URI construction.
    input.test.ts     Tests for phrase input normalization.
  vitest.config.ts    Vitest config (WXT plugin with a fake browser API).
  wxt.config.ts       WXT and manifest configuration.
  package.json        Scripts and dependencies.
docs/
  security-model.md   What Nerafi does and does not protect against.
KNOWN_ISSUES.md       Accepted issues and their rationale.
```

## Documentation

- [Security model](docs/security-model.md)
- [Known issues](KNOWN_ISSUES.md)

## License

MIT
