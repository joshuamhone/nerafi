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
- **Auto-lock.** The wallet locks 15 minutes after unlocking.
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
- **Chunked addresses.** Addresses are always shown in full, never truncated,
  grouped into four-character chunks with the `0x` prefix separated, and
  alternating between two colours so that a changed character is easier to spot.
  A screen reader receives the plain, unbroken address instead.
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
      pages/          Shell pages: Overview and Receive.
      shell/          Sidebar and the app-shell layout.
      AuthLayout.tsx  Split brand/task layout for the onboarding screens.
      context.tsx     Wallet state (balance, network) with refresh.
      router.ts       Hash routes: overview, send, receive.
    background.ts     Background service worker.
  components/         Shared UI (Button, Field, AddressText, Guilloche, ...).
  assets/styles/      Design tokens and base styles.
  lib/wallet/
    account.ts        Phrase generation, checksum validation, address derivation.
    confirm.ts        Random confirmation-word selection and answer checking.
    vault.ts          Password-based encryption and decryption of the phrase.
    storage.ts        chrome.storage wrappers for the vault and session.
    network.ts        Sepolia chain ID, RPC client, and balance lookup.
    send.ts           Recipient/amount parsing, review building, and signing.
    format.ts         Big-int formatting for display (down, up, exact).
    receive.ts        Receive URI (EIP-681) construction.
    input.ts          Recovery-phrase input normalization.
    account.test.ts   Tests for phrase generation and derivation.
    confirm.test.ts   Tests for confirmation-word selection and checking.
    vault.test.ts     Tests for encryption, decryption, and parsing.
    storage.test.ts   Tests for the storage wrappers.
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
