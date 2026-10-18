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
- **Milestone 7 — complete:** a local address book, recipient classification on
  the send form and review cheque, and lookalike (address-poisoning) warnings
  that require an explicit acknowledgement before sending.
- **Milestone 8 — complete:** a manual ERC-20 token list with read-only
  balances, and internal-transfer and token-transfer rows in Activity. No token
  sending, no approvals, no automatic token discovery.
- **Milestone 9 — complete:** advisory risk findings on the review cheque ("Before
  you sign") and a Security Center page. No score, and no claim that anything is
  safe.
- **Milestone 10 — complete:** a read-only Approvals page listing the active ERC-20
  token approvals the account has granted, each checked against current on-chain
  state. No Revoke button yet.

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
  unlock, lockout, password/account/auto-lock changes, address mismatch, restore,
  contact changes, token changes, lookalike and risk acknowledgements) are recorded locally with
  fixed-format details only — never addresses, amounts, names, passwords, or
  phrases.

**Milestone 7 — address book and recipient safety**

- **Address book.** Save up to 100 named contacts locally (`nerafi.contacts`),
  managed on an "Address book" page (add, rename, remove). Contacts are display
  labels with no security meaning and need no password.
- **Recipient classification.** When you type a recipient, Nerafi says whether it
  is one of your accounts, a saved contact, a lookalike, an address you have sent to
  before, or a first-time (unknown) address, in that priority order. A lookalike
  outranks "sent before", so one acknowledged send to a poisoning address never
  makes it trusted. A first-time address is never
  trusted just because it appears in your history.
- **Lookalike (address-poisoning) warnings.** A different address that matches the
  first and last three hex characters of a known address — or five at either end —
  raises an alert. Both addresses are shown in full with the differing characters
  highlighted, and sending requires ticking "I have checked every character.".
- **Address-poisoning notes in Activity.** An incoming sender that resembles a
  known address is annotated with a warning, and known counterparties are shown by
  name. History still never drives a signature.
- **Local sent-recipient memory.** Addresses this wallet has sent to (last 500,
  `nerafi.sentRecipients`) are remembered so a repeat recipient is recognised, and
  are written only by the send flow after a broadcast succeeds.

**Milestone 8 — tokens and richer history**

- **Manual token list.** Add an ERC-20 token by its contract address on the
  Overview ("Add token"). Nerafi checks that the address is a contract on Sepolia
  and that it answers `decimals`, `symbol` and `name`, then shows the full
  contract address with the sentence "Anyone can create a token with any name. The
  contract address is its identity." Nothing is saved until you confirm. Up to 50
  tokens (`nerafi.tokens`); removing one asks for confirmation. Tokens are never
  added automatically, and a transfer in Activity never adds one.
- **Sanitised token text.** A token's symbol and name are attacker-controlled, so
  hidden and bidirectional control characters are removed and the text is
  shortened before it is shown or stored. Two listed tokens with the same symbol
  are both flagged.
- **Balances.** `balanceOf` for the active account is read from the same RPC as
  the ETH balance and refreshed with it. A failed read shows "Couldn't load",
  never 0; tiny non-zero amounts show `< 0.000001`.
- **Internal and token transfers in Activity.** Rows for ETH moved by contracts
  and for ERC-20 transfers, sorted with transactions. A token that is not in your
  list is labelled "Unlisted token" and its contract address is in the detail
  view. Listed tokens format amounts with the decimals stored when you added them;
  for an unlisted token with no usable decimals the amount reads "Amount
  unavailable". A failed internal transfer is shown as such, with no amount.
  An incoming zero-value token transfer carries a warning that these are used to
  plant lookalike addresses.
- **Partial failure is visible.** Transactions, internal transfers and token
  transfers load separately; if one fails the others are shown with a note naming
  the part that failed. Internal and token lists are first page only, and the page
  says when the list may be incomplete.
- **Native ETH is not a token.** On Sepolia, Blockscout also lists each ETH transfer as
  an "ERC-20" transfer from the system address `0xffff…fffe`. Nerafi recognises that
  exact address and leaves those events out of token rows and token counts.
- **Counterparties checked, never trusted.** Counterparties of these transfers get
  the same known-name and address-poisoning check as transactions. Nothing read
  from Blockscout is added to the known set.

**Milestone 9 — risk findings and the Security Center**

- **"Before you sign" on the cheque.** A short list of findings under the recipient
  classification, danger first, each with what it means and what to do. Rules cover
  a lookalike recipient, a burn address, sending ETH to a token contract from your
  list, a recipient that is a contract, a first-time recipient, a send of 90% or
  more of your balance, a fee above 10% of the amount, and sending to yourself.
  With nothing to report it says "No warnings found. This is not a guarantee."
- **Advisory, with no score.** There is no number and no "safe" verdict. Findings
  never change what is signed. Any danger finding needs one acknowledgement (a
  single checkbox naming the danger) before "Sign and send" is enabled, in the
  button and again in the send handler.
- **One network check.** Nerafi asks the existing RPC whether the recipient is a
  contract. The cheque appears immediately with "Checking this address..." and
  signing waits for the answer or an eight-second timeout. A failed check is
  reported as "could not check", never as "not a contract".
- **Security Center** (`#/security`). Wallet-level checks on what is already stored
  or loaded, with no requests of its own: long auto-lock, recent failed password
  attempts, zero-value and lookalike senders in loaded Activity, token symbol
  clashes, unlisted tokens that sent to you, and the extension's own report of its
  permissions. It also lists five threats and says plainly what Nerafi does and does
  not do about each; phishing sites and malicious approvals are not covered yet.

**Milestone 10 — the Approvals page**

- **Active token approvals.** `#/approvals` lists the ERC-20 allowances this account has
  granted. Blockscout's event log points at (token, spender) pairs; the Sepolia RPC
  then says what each allowance is *now*, and only a current allowance above zero is
  listed. Each row shows the token symbol, the full token contract address, the full
  spender address (marked contract or wallet) and the allowance ("Unlimited" at 2^255
  and above).
- **Plain-language findings, no score.** A spender that looks like an address you know
  is a danger finding; an unlimited allowance, an ordinary-wallet spender and details
  that could not be read are cautions; an unlisted token is a note.
- **Honest limits.** The list may be incomplete and does not cover Permit2 or signed
  permits. Blockscout returns at most 1,000 logs per request, oldest first, so Nerafi
  continues from the last block seen for up to three requests; if the last one is still
  full, the page says newer approvals may be missing. Discovery has one 60-second budget
  and runs only when you open the page or press Refresh (disabled for 10 seconds after a
  press). A rate limit, a timeout or any failure part-way fails the whole load and shows
  only the error, never a partial list and never "none". While it runs the page says
  which request it is on.
- **Read-only.** There is no Revoke button: "Removing an approval is not available
  yet." No signing, transaction building or write calldata was added.
- **Security Center.** One more check counts unlimited approvals from what is already
  loaded, and tells you to open Approvals if nothing is.

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
      pages/          Shell pages: Overview, Receive, Activity, Settings, and
                      Address book.
      shell/          Sidebar, app-shell layout, account switcher, recipient
                      picker, and dialogs.
      AuthLayout.tsx  Split brand/task layout for the onboarding screens.
      context.tsx     Wallet state (balance, network, accounts) with refresh.
      router.ts       Hash routes: overview, activity, send, receive, settings,
                      contacts.
    background.ts     Background service worker.
  components/         Shared UI (Button, Field, AddressText, RecipientNotice,
                      Guilloche, ...).
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
    contacts.ts       Local address book (up to 100): parsing, CRUD, validation.
    sentRecipients.ts Local list of addresses already sent to (last 500).
    tokens.ts         Manual ERC-20 token list, verification, and balances.
    tokenText.ts      Sanitising of attacker-controlled token symbols and names.
    risk/
      assess.ts       Pure transaction findings engine (the cheque's rules).
      gather.ts       The one contract lookup, and the token-list comparison.
      gate.ts         canSignReport, the shared acknowledgement wording.
      posture.ts      Pure wallet-level findings for the Security Center.
      threats.ts      The five threats and what Nerafi does and does not do.
    approvals/
      fetch.ts        The Blockscout Approval-log requests (paging, 60 s budget).
      parse.ts        Strict parser for the getLogs reply (ERC-20 vs ERC-721 style).
      candidates.ts   Distinct (token, spender) pairs, newest first, capped at 100.
      verify.ts       Read-only on-chain checks: allowance, token details, spender code.
      findings.ts     Plain-language findings for each active approval.
      store.ts        In-memory result bound to the account; cleared on lock/switch.
    lookalike.ts      Lookalike detection and per-character address diffing.
    recipientSafety.ts  Known-set construction and recipient classification.
    network.ts        Sepolia chain ID, RPC client, and balance lookup.
    send.ts           Recipient/amount parsing, review building, and signing.
    format.ts         Big-int formatting for display (down, up, exact).
    receive.ts        Receive URI (EIP-681) construction.
    history/
      types.ts        Activity types and the history-provider interface.
      blockscout.ts   Strict Blockscout API parsing, pagination, and timeouts.
      transfers.ts    Strict parsers for internal transactions and token transfers.
      combined.ts     Independent loading of the three lists, merge and failure notes.
      display.ts      Token amounts, listed/unlisted labels, zero-value warning.
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
    contacts.test.ts  Tests for address-book parsing, CRUD, and limits.
    sentRecipients.test.ts  Tests for the sent-recipient list and its bounds.
    lookalike.test.ts  Tests for lookalike detection and address diffing.
    recipientSafety.test.ts  Tests for the known set and recipient classification.
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
