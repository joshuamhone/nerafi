# Security model

This document describes what Nerafi does, what it does not do, and where the
trust boundaries are. It is written in plain English on purpose. Nerafi is an
educational, testnet-only portfolio project, so this document is a description
of the current design, not a guarantee.

## Scope

Milestone 1 covers wallet creation and recovery-phrase onboarding. Milestone 2
adds a password-encrypted vault that persists the wallet on the local machine
and can be locked and unlocked. Milestone 3 adds Sepolia balance display and
sending test ETH. Milestone 4 adds the app shell with sidebar navigation, the
overview and receive pages, a locally rendered QR code, and one consistent way
of displaying amounts. Milestone 5 adds activity history from a public
explorer, a transaction detail view, and local sent records. Milestone 6 adds
multiple accounts under one recovery phrase, a Settings page (auto-lock and
change password), unlock backoff, and a local security log. Milestone 7 adds a
local address book, recipient classification on the send form and review
cheque, and lookalike (address-poisoning) warnings. Milestone 8 adds a manual
list of ERC-20 tokens with read-only balances, and internal-transfer and
token-transfer rows in Activity.

What Nerafi does today:

- Generates a 12-word BIP-39 recovery phrase on request.
- Validates the phrase's wordlist membership and checksum.
- Derives addresses at the BIP-44 path `m/44'/60'/0'/0/{index}`. The first
  account is `m/44'/60'/0'/0/0`; up to ten accounts share one phrase.
- Asks the user to confirm three randomly chosen words from their written copy.
- Encrypts the phrase with a password and saves the encrypted vault, plus the
  public address, in `chrome.storage.local`.
- Holds only the unlocked address, the verified account addresses, and an expiry
  time in `chrome.storage.session` (in memory only) so the wallet can stay open
  while unlocked, and clears it on lock, on browser close, and when its auto-lock
  window has passed. The window is 15 minutes by default and is chosen on the
  Settings page.
- Reads the wallet's Sepolia balance from one public RPC endpoint.
- Shows the balance and address on an overview page, refreshing them only on
  unlock or on the user pressing refresh.
- Renders a QR code for the receive address entirely on the page, and copies
  the address to the clipboard only when the user clicks "Copy address".
- Displays every amount with one big-int-only formatter: balances rounded down
  to six decimals, maximum fees and totals rounded up ("at most"), and typed
  amounts shown in full.
- Explains a transfer in plain English before signing it.
- Signs and sends a test-ETH transfer on Sepolia, after the password is entered
  again.
- Reads the wallet's transaction history from the public Blockscout explorer on
  demand and shows it on the Activity page and on the Overview.
- Keeps local copies of its own recent sends (`nerafi.localTx`, last 50) only
  until Blockscout indexes them, so they can surface as pending in the gap
  before indexing; after 30 minutes the note says the transaction may have been
  dropped.
- Keeps a local address book (`nerafi.contacts`, up to 100 contacts) and a local
  list of addresses it has sent to (`nerafi.sentRecipients`, last 500), and
  classifies a typed recipient as one of your accounts, a contact, a previous
  recipient, a lookalike, or an unknown address, in that priority order (see
  "Classification" below).
- Warns when a recipient or an incoming sender resembles a known address
  character-for-character at the start and end (address poisoning), and requires
  an explicit acknowledgement before sending to a lookalike.
- Connects to no network other than the Sepolia RPC endpoint and the Blockscout
  explorer described in "Sending test ETH" and "Transaction history" below.

What Nerafi does not do:

- It does not connect to any network other than the single Sepolia RPC endpoint
  described in "Sending test ETH" below and the Blockscout explorer described in
  "Transaction history" below.
- It does not sign or send on any chain other than Sepolia. Signing is refused if
  the RPC reports any other chain ID.
- It does not sign anything without a review and a password re-entry.
- It does not store the recovery phrase in session storage. While unlocked, the
  session holds only the address and an expiry time; the phrase is decrypted only
  during unlock and during signing.
- It does not run in the background; it acts only in response to the user.
- Transaction history never drives a signature or a funds decision. History is a
  record of what the explorer reports; the signing flow reads its values from the
  review the user approves, never from a history row. In particular, an address
  that has sent to you — which appears only in history — is never added to the
  known set used for recipient classification.
- It does not treat a local contact name as proof of identity. A name is a label
  the user typed. Choosing a contact copies the address stored in the local contact
  entry into the recipient field; the review cheque shows that address in full,
  and that is the address that gets signed. Contact entries are not
  integrity-protected, so a changed browser profile can change them.

## Standards and libraries

- **BIP-39** defines the recovery phrase: the wordlist, the entropy encoding, and
  the checksum. A 12-word phrase encodes 128 bits of entropy.
- **BIP-32** defines hierarchical deterministic key derivation.
- **BIP-44** defines the account path structure. Nerafi uses
  `m/44'/60'/0'/0/0`, the first Ethereum account.

The work is done by two established libraries rather than custom code:

- **viem 2.57.4** for BIP-39 phrase generation and address derivation (it uses
  `@scure/bip39` and `@scure/bip32` internally).
- **`@scure/bip39` 1.6.0** for checksum validation, pinned to the version viem
  already depends on. This keeps one deduplicated copy of the library handling
  every phrase operation instead of two copies that could drift apart.

No cryptography is written by hand here. Cryptographic primitives are easy to
get subtly wrong, so Nerafi relies on widely used, open-source implementations
and does not add its own.

`@scure/bip39` was independently audited by Cure53 in January 2022 (funded by
the Ethereum Foundation). That audit covered version 1.0.0; Nerafi uses 1.6.0,
so changes made since the audit are not covered by it. No audit claim is made
here for viem.

## Randomness

- The 128 bits of phrase entropy come from the platform's
  `crypto.getRandomValues`, through viem and `@scure/bip39`. This is the
  browser's cryptographically strong random source.
- The positions of the three words asked for during confirmation are chosen with
  `crypto.getRandomValues` in `extension/lib/wallet/confirm.ts`. The code uses
  rejection sampling (`limit = Math.floor(0x100000000 / max) * max`) so that
  every position is equally likely and modulo bias is avoided.
- `Math.random` is not used anywhere in Nerafi.

## Validation

`deriveAddress` refuses a phrase that fails `isValidMnemonic` instead of deriving
from it. This is deliberate: BIP-39 seed derivation accepts any input, so an
invalid phrase would silently derive a different, empty wallet and the user would
not know their real phrase was mistyped. Rejecting the phrase surfaces the error
at the point of entry.

The BIP-39 checksum is only 4 bits for a 12-word phrase. It catches most typo-
style errors but roughly 1 in 16 random errors can still pass. A phrase that
passes validation is not proof that it is the phrase the user intended.

## Onboarding protections

- The phrase is generated only in response to a user action ("Create new
  wallet"), not on page load.
- The phrase stays hidden until the user presses "Reveal phrase".
- There is no copy button. The system clipboard can be read by other software,
  and Windows keeps a clipboard history, so Nerafi does not offer one.
- The confirmation inputs set `autoComplete="off"`, `autoCorrect="off"`,
  `autoCapitalize="off"`, and `spellCheck={false}`. Chrome's Enhanced Spell
  Check can send typed text to Google, so spell-checking is disabled on those
  fields. The restore textarea sets the same attributes.
- After a successful confirmation, the page drops the per-word list
  (`setWords([])`) and carries the phrase only until it has been encrypted, after
  which that reference is dropped too (`setPendingPhrase('')`). This shortens how
  long the page holds it, but does not guarantee the bytes are erased from memory
  (see Known limitations).
- The phrase is never logged, and it is never placed in a URL or in
  `localStorage`.
- Error messages never include secret material. For example, `deriveAddress`
  throws the fixed string `Invalid recovery phrase`.

## Trust boundaries

The meaningful boundary is between the extension and web pages.

- The popup page, the wallet page, and the background service worker all run on
  the same `chrome-extension://` origin and share the same extension APIs.
  Keeping secrets out of the popup limits where they appear, but it is not a
  hard boundary between these contexts.
- `wallet.html` is not listed in `web_accessible_resources`, so a website cannot
  embed or frame it. This prevents clickjacking of the onboarding page.
- The manifest requests exactly one permission, `storage`
  (`permissions: ["storage"]`). Nerafi needs it to save the encrypted vault and
  the session. It requests no host permissions and no content scripts, so it has
  no standing access to any website. Opening the wallet tab uses
  `browser.tabs.create` with an extension-internal URL, which needs no
  permission.
- Nerafi makes network requests, but only to the single Sepolia RPC endpoint
  described below. It still requests no host permissions: the calls work from the
  extension page because the endpoint allows cross-origin requests. The RPC
  operator is a third party and sees the wallet address, the contents of each
  request, and the user's IP address.
- `chrome.storage.session` defaults to the `TRUSTED_CONTEXTS` access level, so
  the unlocked flag it holds is not reachable from content scripts or web pages.
- Every font and every icon is bundled inside the extension. There are no remote
  stylesheets, scripts, or images: the fonts are packaged from the local
  `@fontsource` packages and the icons are inline SVG. Loading the UI makes no
  request for assets, so the only network traffic is the Sepolia RPC calls
  described below.

Pages outside the extension origin cannot reach the extension's DOM or its
in-memory state directly.

## Known limitations

- JavaScript cannot reliably wipe secrets from memory. Setting a variable to a
  new value does not guarantee the old bytes are gone; garbage collection and the
  engine's internal copies are outside the program's control.
- A compromised browser, a compromised operating system, or another extension
  with broad permissions is out of scope. Any of these could observe the page or
  its memory, and Nerafi has no defense against that.
- Nerafi itself has not been externally audited.

## Encrypted vault (Milestone 2)

Milestone 2 stores the wallet as an encrypted vault. This section describes how
that works.

### What is stored, and where

- `chrome.storage.local["nerafi.vault"]` holds the encrypted vault: a versioned
  object with the key-derivation parameters, the AES-GCM IV, and the ciphertext.
- `chrome.storage.local["nerafi.address"]` holds the wallet address as plain
  text. This is deliberate: the address is public on-chain, and keeping it
  unencrypted lets the locked screen show which wallet is stored without asking
  for the password first. It is only a display hint for the locked screen: after
  unlock the address is always re-derived from the decrypted phrase, and the
  stored copy is overwritten if it differs, so a tampered address cannot survive
  an unlock.
- `chrome.storage.session["nerafi.session"]` holds only the unlocked address and
  an expiry timestamp. It never holds the recovery phrase. Session storage is in
  memory, is cleared when the browser closes, and is not exposed to content
  scripts or web pages. Nothing enters `localStorage`, `sessionStorage`, or
  IndexedDB.

The recovery phrase is never written to `chrome.storage.local` in plain text;
only the ciphertext is.

### Key derivation

- **PBKDF2-HMAC-SHA256**, with **600,000 iterations** (the OWASP
  recommendation for this algorithm) and a **16-byte random salt**.
- The salt comes from `crypto.getRandomValues` and is freshly generated on every
  save, so the same password produces a different key each time.
- The derived key is an **AES-256-GCM key created with `extractable: false`**,
  so the raw key bytes cannot be read back out of the Web Crypto object.

### Encryption

- The phrase is encrypted with **AES-256-GCM** and a **12-byte random IV**, also
  from `crypto.getRandomValues` and freshly generated on every save.
- The IV is not secret, but it must never repeat for a given key. Generating a
  new salt (and therefore a new key) and a new IV on every save keeps that true.
- The salt, IV, and ciphertext are stored as standard base64 strings.

### Versioned vault format

The vault carries an explicit `version` field, currently `1`. The full shape is:

```
{
  version: 1,
  kdf:     { name: "PBKDF2", hash: "SHA-256", iterations: 600000, salt: "<base64>" },
  cipher:  { name: "AES-GCM", iv: "<base64>" },
  ciphertext: "<base64>"
}
```

### Strict parameter checking

When unlocking, Nerafi validates the stored vault before deriving anything. It
checks the version, the KDF and cipher names, the hash, and that the iteration
count is exactly 600,000, and it checks that the salt decodes to exactly 16
bytes, the IV to exactly 12 bytes, and the ciphertext to non-empty base64. Any
mismatch is rejected with a fixed "Unsupported or damaged vault" error.

This strictness exists to prevent a **downgrade attack**: if an attacker could
edit the stored vault to claim a lower iteration count, Nerafi would derive a
weaker key. Pinning the exact expected parameters closes that door.

### Password policy

Before the phrase is encrypted, the password is checked and normalized:

- It is normalized with **NFKC** first, so two visually identical passwords
  typed in different Unicode forms (for example `é` as one code point versus
  `e` followed by a combining accent) produce the same key. The same
  normalization is applied when unlocking.
- Length is counted in **Unicode code points after normalization**, not UTF-16
  units, so an emoji counts as one character. The minimum is 12 and the maximum
  is 1,024.
- There are no composition rules (no "must include a symbol or a digit").
  Length is the only requirement.

### Session and unlock design

- While unlocked, `chrome.storage.session` holds only the wallet address and an
  expiry timestamp 15 minutes in the future. The recovery phrase is never written
  to the session.
- The phrase is decrypted from the vault only through one function, `openVault`,
  and only while checking a password: during unlock (to verify the password and
  derive the addresses), before signing, when adding an account, and when
  changing the password. Each time it is a local variable for the duration of
  that operation and is not kept afterwards. The JavaScript memory caveat applies
  during those windows (see "Known limitations").
- The wallet page reads the session address to decide whether it is unlocked. The
  unlocked screen itself does **not** keep the phrase.
- Pressing "Lock" removes the session entry immediately.

### Auto-lock

The auto-lock window is **15 minutes** by default and can be set to 1, 5, 15,
30, or 60 minutes on the Settings page (see `AUTO_LOCK_MS` and `autoLockMs`).
Expiry is enforced whenever the unlocked state is read: if the current time is at
or past the expiry, the session entry is removed and treated as locked. The
wallet page also re-checks once every 30 seconds while the unlocked screen is
open. Shortening the window applies to the current session immediately (the
expiry is pulled in to the shorter time); lengthening it takes effect only at the
next unlock, so the window can never be extended without the password. If no page
reads the session, the only thing that can outlive the window is the unlocked
address, the account addresses, and the expiry, not the phrase. A precise timer
would need the `alarms` permission, which Nerafi deliberately does not request;
the trade-off is noted in `KNOWN_ISSUES.md`.

### Failure behavior

- A wrong password and a corrupted vault produce the **same** error, "Incorrect
  password or damaged vault". AES-GCM authenticates the ciphertext as part of
  decryption but cannot tell whether the key was wrong or the data was damaged,
  so the messages are not distinguished. This is intentional.
- After a successful decryption, the recovered phrase is checked with the BIP-39
  validator. If it is not a valid phrase, the same generic error is shown, and
  the phrase is discarded.
- Errors never include the password, the phrase, the key, or the ciphertext.

### Restore flow

Restoring from a recovery phrase is available from the welcome screen and from
the locked screen ("Forgot password?"). The entered phrase is lowercased, split
on whitespace, has any leading list markers (such as `1.`, `2)`, or `#3`) and
number-only tokens stripped, collapsed to single spaces, then validated. If a
vault already exists, Nerafi warns that restoring replaces the saved wallet and
requires a confirmation checkbox before proceeding. The restored phrase then goes
through the same set-password and encryption flow as a newly created wallet,
producing a new salt, IV, and ciphertext.

### Why PBKDF2 and not scrypt or Argon2

Memory-hard password hashing functions (scrypt, Argon2) resist GPU- and ASIC-
based cracking better than PBKDF2, because they force each guess to use a large
amount of memory. They are not part of Web Crypto, though, so using one would
mean adding a third-party dependency. The hard constraint for this milestone is
no new dependencies, so Nerafi uses PBKDF2, which is native to the platform and
a standard, widely reviewed choice. The higher iteration count is the
compensating control.

## Sending test ETH (Milestone 3)

Milestone 3 shows the Sepolia balance and lets the user send test ETH. This
section describes how signing and sending work.

### Sepolia only

- The chain ID **11155111** (Sepolia) is hard-coded.
- Immediately before **every** signing, Nerafi calls the RPC's `eth_chainId` and
  refuses to sign if it is not 11155111.
- Every signed transaction embeds `chainId: 11155111` (EIP-155 replay
  protection). A signature produced for Sepolia is therefore not valid on
  Ethereum mainnet, so it cannot be replayed there.

### The RPC endpoint

Nerafi uses one keyless public endpoint:
`https://ethereum-sepolia-rpc.publicnode.com`. An API key would be pointless in a
browser extension: anything bundled with the extension is readable by anyone who
installs it, so the key would be public. The trade-off is privacy. The RPC
operator sees the wallet address, the contents of each request (for example the
balance lookup and the signed transaction), and the user's IP address.

### What you approve is what you sign

The review screen is built from one set of values. The exact recipient, value,
gas limit, `maxFeePerGas`, and `maxPriorityFeePerGas` shown on the review screen
are the values that get signed. Nothing is re-estimated between the review and
the signature.

### Password re-entry before every send

Signing requires the password again, even when the wallet is already unlocked.
An unlocked session holds only the address and an expiry time, so leaving the
wallet open does not expose the phrase. A transaction cannot be signed and sent
without the password, because the recovery phrase is decrypted from the vault
only at the moment of signing and is not kept afterwards.

### The key is derived only at signing time

The private key is derived from the decrypted recovery phrase inside a single
function, only after a send is confirmed, and it is not stored. The usual
JavaScript caveat applies: the key and the phrase exist in memory during signing
and cannot be reliably wiped afterwards.

### Signing is local; only the signed transaction leaves

Nerafi signs the transaction locally with viem. Only the signed transaction is
sent to the RPC endpoint. The recovery phrase, the password, and the private key
never leave the extension.

### The fee shown is a maximum

The review shows the maximum possible network fee, calculated as
`gas limit × maxFeePerGas`. The actual fee is usually lower, because the network
charges the base fee plus the priority fee that is actually needed.

## Receiving test ETH (Milestone 4)

The wallet needs an address and a way to receive test ETH on Sepolia.

- The Receive page shows the wallet's address in the chunked display and a QR
  code. The QR code encodes the EIP-681 URI `ethereum:<address>@11155111`. The
  chain id is part of the URI, so a scanner sees exactly where the funds should
  arrive on Sepolia and nothing else; the address is checksummed before
  encoding.
- The QR code is generated on the page with the `qr` package
  (`encodeQR(uri, 'svg', { border: 4 })`). `qr` is a zero-dependency module, so
  rendering makes no network request and needs no API key. The returned SVG is
  inserted inline and its dark modules are painted with the local paper-ink
  colour.
- Copying the address is the only clipboard write in the wallet. It happens
  only when the user clicks "Copy address", and the address itself is public
  on-chain. Unlike the recovery phrase (see "Onboarding protections"), the
  address is safe to hand to other software that can read the clipboard.

## Transaction history (Milestone 5)

### The short version

- History is read from `eth-sepolia.blockscout.com`, a third-party public
  explorer. It is not part of Nerafi and may lag the network.
- Each request sends the wallet's public address; Blockscout can link that
  address to the user's IP address. No keys, phrases or passwords are sent.
- Status, labels (including scam labels) and amounts shown in Activity come
  from Blockscout and are not independently verified by Nerafi. Balance still
  comes from the RPC node.
- Nerafi keeps a local copy of its own sends (`nerafi.localTx`, max 50) only
  until Blockscout indexes them; it stores hash, from, to, value, time, and a
  nonce field that is currently always empty (`null`) because the send flow
  does not yet return the nonce — it will be filled when speed-up/cancel is
  built. No secrets.
- A dropped transaction cannot currently be detected; Nerafi says so after 30
  minutes rather than guessing.

### The data source is a third-party explorer

- `https://eth-sepolia.blockscout.com` exposes an open, keyless JSON API.
- A request asks for the transactions of one address and, on later pages, the
  cursor Blockscout itself returned. No new permission is required: like the
  RPC call, the fetch works from the extension page without a host permission
  because the endpoint allows cross-origin requests.
- Blockscout can lag the network by a few seconds, and it can be temporarily
  unreachable. When that happens the wallet shows a fixed "Couldn't load
  history from Blockscout." message rather than a raw error.
- Loading more pages is always user-initiated ("Load more"), never automatic.

### Untrusted data and labels

Blockscout data is untrusted input, not part of the wallet's own state:

- Every item is parsed strictly by hand. Fields that fail their check (bad
  hash, bad address, non-numeric value, and so on) are dropped and counted, and
  the page reports "N entries couldn't be read and are not shown." A malformed
  entry is never thrown and never logged. A transaction that involves neither
  the wallet address as sender nor as recipient is likewise dropped and
  counted.
- Status is decided only from the explorer's `status` field: `ok` is shown as
  Confirmed, `error` as Failed, anything else as Pending. A failed
  transaction's `result` text, when present, is shown on the detail page as the
  reason (`"Reason reported by Blockscout: ..."`), truncated to 200 characters
  and rendered as plain text. The `result` field never decides the status.
- Scam labels and reputation scores come from Blockscout and are shown as
  Blockscout's claim — "Blockscout labels this address as a scam. Nerafi has
  not verified this label." — not as a wallet verdict. For a contract creation,
  the "To" row shows the created contract's address as "Created contract" when
  Blockscout returns one; the wallet's own address is never shown as the
  counterparty of an outgoing transaction.
- The amounts shown on rows and the exact values on the detail page use the
  same big-int formatter as the rest of the wallet. History display never
  changes wallet state, never triggers a re-sign, and never edits the vault.

### Local sent records

- The last 50 sent transactions are kept in `chrome.storage.local` under
  `nerafi.localTx`: hash, from, to, value in wei, nonce, and a local timestamp.
  The nonce is currently always empty (`null`) because the send flow does not
  yet return it; it will be filled when speed-up/cancel is built. A row is only
  ever written when this wallet has actually sent that transaction; nothing
  re-signs and the phrase is never read or decrypted for history.
- The records exist only to cover the gap before Blockscout indexes a send.
  Whenever any loaded page contains a hash that matches a local record, that
  record is deleted.
- On the first page, only records newer than the page's oldest item are shown
  when the explorer has more pages; when the first page is the whole history,
  all unmatched records are shown. An old unmatched record that is probably on
  an unloaded page is not guessed into the list.
- Records are validated on read and malformed entries are dropped. A local-only
  row shows as "Pending" with the note "Sent from Nerafi · not yet indexed by
  Blockscout". After 30 minutes the note changes to "Not seen by the network
  after 30 minutes. It may have been dropped. Check your balance before sending
  again." A local-only record is never marked failed.
- The list is capped at 50 entries, newest first.

### What Blockscout does not cover

- Since Milestone 8, internal transactions and ERC-20 transfers are read from
  their own Blockscout lists (see "Tokens and history (Milestone 8)"). The
  transaction list itself still does not contain them. Token types other than
  ERC-20 (NFTs, ERC-1155) are not requested and do not appear.
- Search and the All / Sent / Received filter apply to the pages already
  loaded; older pages that have not been loaded yet are not searched.

### Display numbers

All amounts are formatted with one big-int helper
(`extension/lib/wallet/format.ts`), and each context picks the mode that never
overstates what is true:

- **Balances** (the Overview) round **down** to six decimals, so the shown
  balance never claims more than the wallet holds.
- **The maximum network fee** and **the total, at most** on the cheque round
  **up** to six decimals, so the shown limit never claims less than can leave.
  The exact values appear in the field's hover tip and in the cheque's "Exact
  values" details.
- **The amount you typed** is parsed with its full 18-decimal precision, and
  the review screen and the sent receipt show that exact amount, so what you
  approved is what you see after signing.

A non-zero amount smaller than 0.000001 test ETH displays as `< 0.000001`.
Formatting works only on integers (`bigint`, wei) so no floating-point
arithmetic is ever done on balances or amounts.

## Accounts and session security (Milestone 6)

### Multiple accounts, one phrase

- Up to ten accounts are derived from the single recovery phrase at the BIP-44
  paths `m/44'/60'/0'/0/0` through `m/44'/60'/0'/0/9`. They all share the same
  phrase and private-key material; only the derivation index differs. There is no
  separate secret per account, so a name is never a security boundary.
- On every unlock, Nerafi re-derives all stored accounts from the decrypted
  phrase. If a stored account's address does not match its derived address, the
  stored copy is overwritten from the derived value and a tamper warning is
  recorded in the security log. A tampered address can therefore not survive an
  unlock.
- Local account names and their addresses live in
  `chrome.storage.local["nerafi.accounts"]`. These are a display convenience, not
  trusted state: the address used for signing is always re-derived from the
  phrase, and a strict parser drops any entry it cannot validate.
- `nerafi.activeAccount` remembers which account was last used. It is only a
  preference; on the next unlock it selects the starting account and falls back
  to the first one if the stored index is out of range. Switching accounts in an
  unlocked session updates the active address in the session entry **without**
  extending its expiry, so switching cannot be used to prolong a session.
- When the wallet page loads an existing session, the active account is the
  verified account that matches `nerafi.session.address`, not whatever
  `nerafi.activeAccount` says. If the session address is not in the verified list,
  the wallet locks instead of trusting it.
- The "Your account: <name>" hint on the send form and the review cheque is shown
  only when the recipient address is in the verified session list — the addresses
  the phrase actually derived at unlock. The name comes from local storage, but a
  local entry alone (for example, a tampered entry naming a stranger's address
  "Account 2") never produces a hint. The other recipient hints (contact, previous
  recipient, lookalike, unknown) are described in "Recipient safety and address
  poisoning" below.

### Adding an account needs the password

Adding an account derives a new address from the phrase, so it requires the
password, verified through the same `openVault` path as unlock. Renaming an
account changes only its local label and needs no password.

### Unlock backoff

Repeated wrong passwords trigger a delay instead of unlimited attempts:

- The first four consecutive failures carry no delay.
- From the fifth consecutive failure, the delay is
  `min(30 seconds × 2^(failures − 5), 15 minutes)`: 30 seconds, then 1 minute,
  then 2 minutes, and so on up to a 15-minute cap.
- While the delay is active, a further attempt is refused with a lockout error
  **without deriving a key or counting another failure**, so the delay cannot be
  reset by hammering the field. The unlock field and button are disabled and a
  live countdown is shown.
- A successful unlock resets the counter.
- Restoring a wallet (which does not use the stored vault) stays available and
  also resets the guard.

The counter is stored in `chrome.storage.local["nerafi.unlockGuard"]`. A throttled
delay slows guessing from the UI but is not a strong defense: an attacker who can
read the vault file directly can attempt decryption offline and is only limited
by PBKDF2's cost. The delay is also measured against the system clock, so changing
the system clock can shorten or end a lockout. This is stated plainly in
`KNOWN_ISSUES.md`.

### Security log

- `chrome.storage.local["nerafi.securityLog"]` keeps the most recent 200 events
  (older entries are dropped) with a type, a timestamp, and an optional short
  detail. The types are lock/unlock, auto-lock, failed unlock, lockout started,
  password changed, account added, account renamed, auto-lock changed, address
  mismatch, wallet restored, contact added, contact removed, contact renamed,
  lookalike acknowledged, token added, and token removed.
- Details are only fixed formats such as `"Account 3"` or `"5 minutes"`. The log
  never contains addresses, amounts, user-entered names, passwords, phrases, or
  keys. The contact and lookalike events are recorded with no detail at all, so a
  contact's name or address never enters the log.
- A failure to write the log is swallowed: logging never blocks, delays, or
  breaks the operation that triggered it.
- The log is local to this browser profile and is not a tamper-proof audit trail;
  anyone with access to the profile can read or clear it. There is deliberately no
  "clear log" button in the UI.

### Change password

Changing the password verifies the current one through `openVault` (so it counts
toward the unlock backoff), requires the new password to pass the same policy and
to differ from the current one, and encrypts the phrase again with a fresh salt
and IV. The new vault is decrypted once to confirm the new password really
round-trips before it is saved; that round-trip check is done inside the
encryption helper, which accepts a phrase and a new password and returns the
verified vault, so no exported function accepts an arbitrary vault plus a password
guess. Until the check passes, the existing vault is left untouched, so a failed
change never locks the user out. The stored address hint is left exactly as it
was — it always names the account that was active — so a password change never
moves the hint to another account.

## Recipient safety and address poisoning (Milestone 7)

Address poisoning is an attack where a sender moves a tiny amount of ETH from an
address whose first and last few characters match an address you already use, so
that the lookalike shows up in your history. The hope is that you later copy the
address from your history (or from a "recent recipient" list) and send funds to
the attacker instead of the real recipient. Nerafi's defence is to keep its own
small, user-controlled list of known addresses and to warn — loudly, and with the
differing characters highlighted — when a recipient only looks like one of them.

### The local address book

- Contacts live in `chrome.storage.local["nerafi.contacts"]`, are capped at 100,
  and need no password: they are local display labels with no security meaning,
  the same as account names. A strict parser drops any entry it cannot validate,
  so a tampered store cannot inject a malformed entry.
- Adding, removing, and renaming a contact are recorded in the security log as
  `contact added`, `contact removed`, and `contact renamed`, with **no detail**, so
  neither the contact's name nor its address ever enters the log. The address book
  is reachable from the sidebar as "Address book".
- A contact is only a convenience. Choosing a contact copies the address stored in
  the local contact entry into the recipient field, and the review cheque shows
  that address in full before anything is signed. Contact entries are not
  integrity-protected: anyone who can change the browser profile can change a
  stored address, so the full address on the review cheque is what the user must
  check.

### The known set

Recipient classification compares the typed address against a **known set** built
from three sources only:

1. The verified accounts from the current session — the addresses the phrase
   actually derived at unlock. A name comes from local storage, but a session
   entry alone is not enough: the address must be in the verified list.
2. Saved contacts (`nerafi.contacts`).
3. Addresses this wallet has sent to before (`nerafi.sentRecipients`, last 500),
   written by the send flow immediately after a broadcast returns a hash — the
   same place local sent records are written.

The known set deliberately **excludes** addresses that sent to you, Blockscout
labels, and anything else read from history. That is the whole point: an attacker
who can get their lookalike into your history must not be able to get it into
your known set as a side effect. Addresses are only trusted as known when you
saved them or sent to them yourself.

### Classification

A typed recipient is classified as exactly one of:

- **Your account** — matches a verified session account. Shown as
  "Your account: {name}". (The sentence "This is your {name}." is only the
  add-contact rejection.)
- **Contact** — matches a saved contact. Shown as "Contact: {name} · saved {date}".
- **Lookalike** — a different address that resembles a known address (see below).
  Shown as "This address looks like {label} but is a different address.".
- **Previous recipient** — matches an address already sent to, and resembles no
  other known address. Shown as "You have sent to this address before.".
- **Unknown** — none of the above. Shown as "First time sending to this address.
  Check it against a source you trust, not your transaction history.".

**Why lookalike outranks "sent before".** The order is own account → contact →
lookalike → previously sent → unknown. The lookalike check compares the candidate
against every known address except entries for the candidate itself, including
other sent recipients. One acknowledged send to a poisoning address must never
turn it into a trusted "sent before" address: a sent recipient that resembles an
account, a contact or another sent recipient is classified as a lookalike every
time, and a sent recipient that resembles nothing is "sent". The Activity
poisoning warning applies the same rule.

A malformed address is rejected earlier with "That is not a valid Ethereum
address.", and a mixed-case address that fails its EIP-55 checksum is rejected
with "This address has a checksum error — check it for typos.". Only a canonical
`0x` + 40 hex-character address is ever classified or compared.

### Lookalike detection

Detection compares the 40 hex characters after `0x`, case-insensitively. Two
different addresses are flagged as a lookalike when **either**:

- the first **3** and last **3** characters both match (`prefix ≥ 3` and
  `suffix ≥ 3`), or
- the first **5** characters match, or the last **5** characters match.

The false-positive rate is intentionally generous. For a random pair of
addresses, the chance that the first 3 and last 3 characters both match is
`16⁻⁶ ≈ 1 in 16.8 million`; the chance of a run of 5 at one specific end is
`16⁻⁵ ≈ 1 in 1,048,576`, and because either end counts, roughly `2 in 1,048,576`,
or about **1 in 524,000** per address compared. Being generous is deliberate: the
worst case of a false positive is one extra "check this address" prompt, while the
cost of a false negative is sending to an attacker. When more than one known
address matches, the strongest match (the largest combined prefix and suffix) is
shown.

### What the user sees

- On the send form and on the review cheque, a lookalike raises an alert that
  names the known address it resembles. Both addresses are shown in full with the
  differing characters marked with an underline and the alert colour, so the
  difference is visible character by character.
- Sending to a lookalike is blocked until the user ticks a required checkbox (the gate is the pure function
  `canSign`, used both for the Sign button and as the first check in the send
  handler, so it holds even without the UI),
  "I have checked every character. This is not {label}.", and the acknowledgement
  is recorded in the security log as `lookalike acknowledged` with no detail. The
  checkbox state resets whenever the recipient changes.
- In Activity, an incoming sender that resembles a known address is annotated:
  "Possible address poisoning: this sender looks like {label}. Never copy
  addresses from your history.". A known counterparty is also labelled by name.
  These annotations are shown next to Blockscout's data, which remains untrusted
  and still never drives a signature.

### Limitations

- Lookalike detection is a heuristic, not a proof. An attacker who cannot match
  three leading and three trailing characters, or five at one end, will not be
  flagged, and a flagged address may still be the real one.
- The known set is only as good as what the user has saved or sent. A first-ever
  recipient is always "unknown" and is never added to the known set just by
  appearing in history.
- The address book and the sent-recipient list live in `chrome.storage.local`, so
  anyone with access to the browser profile can read or alter them, exactly as with
  the security log. They are convenience state, not trusted state. The lookalike
  acknowledgement is in-memory UI state only: it resets when the recipient changes
  or the send flow resets, and it is never stored.

## Tokens and history (Milestone 8)

Milestone 8 adds read-only ERC-20 token balances and shows internal transfers and
token transfers in Activity. There is no token sending, no approval, and no
automatic token discovery. Signing, the vault, the session and the unlock design
are unchanged, and the manifest still requests only `storage`.

### A manual token list, and why there is no auto-discovery

- Tokens are added only by pasting a contract address on the Overview page.
  The list is stored in `chrome.storage.local["nerafi.tokens"]` (at most 50).
  Nothing is ever added because it appeared in history, in a token transfer, or
  in an explorer's token list.
- Auto-discovery would turn attacker-controlled data into trusted state. Anyone
  can send you a token for free, give it any name and symbol, and make it show up
  in an explorer. A wallet that lists "whatever it finds" lets an attacker choose
  what appears in your balance list. Nerafi lists only what you confirmed.
- A transfer in Activity never adds a token to the list and never changes it.

### The contract address is the identity

A token's name and symbol are text chosen by whoever deployed the contract, and
two different contracts can use the same one. The contract address is what
identifies a token.

- Before a token is saved, the confirm dialog shows the full contract address
  (in the same chunked form used everywhere else), the sanitised symbol and name
  as read from the contract, and this sentence: "Anyone can create a token with
  any name. The contract address is its identity." Nothing is saved until the
  user confirms.
- If two listed tokens share a symbol (compared case-insensitively after
  sanitising), both show "Another token in your list uses the same symbol. Check
  the contract address." The dialog shows the same warning when the token being
  added would clash.
- A transfer is matched to the list by contract address only. A token that is not
  in the list is labelled "Unlisted token" in rows, whatever symbol it claims; its
  contract address, and Blockscout's reported symbol and name (sanitised), appear
  in the detail view.

### Verification when adding

The pasted address must be a valid address (a mixed-case address with a bad
checksum is refused). Nerafi then confirms the RPC is on Sepolia, calls
`eth_getCode` and refuses an address with no code ("No contract at this address
on Sepolia."), and reads `decimals`, `symbol` and `name`. If any read fails, if
`decimals` is not an integer from 0 to 36, or if `symbol` or `name` is not a
plain string (old `bytes32` tokens), it is refused with "This does not look like a
standard ERC-20 token." These checks show that a contract answers like an ERC-20;
they do not show that the token is honest or valuable.

### Token text is attacker-controlled and is sanitised

Symbol and name come from the contract (and, in Activity, from Blockscout). Before
they are shown or stored they pass through one function (`tokenText.ts`): format
characters are removed first (this includes the bidi controls U+202A–202E and
U+2066–2069, the zero-width characters, the word joiner and the byte-order mark),
whitespace is collapsed, remaining control characters are removed, the symbol is
cut to 11 and the name to 40 characters, and an empty result becomes "Unknown
token". Stored entries must already be in sanitised form or they are dropped on
read. Sanitising prevents hidden or reordering characters; it does not make a
misleading name safe, which is why the contract address is the identity.

### Balances

`balanceOf` for the active account is read from the same Sepolia RPC endpoint as
the ETH balance, for each listed token, whenever the ETH balance refreshes. No
new network host is involved. The amounts use the token's own `decimals` and the
big-int formatter: rounded down to six decimals, and a non-zero amount below that
shows as `< 0.000001`, never as 0. A read that fails, or returns anything other
than a non-negative integer, shows "Couldn't load" rather than 0. The RPC is
trusted for these numbers, as it is for the ETH balance.

A token balance is whatever the token contract returns. A malicious token can
report any balance it likes, so a displayed token balance is not proof of
ownership or value. Nerafi's checks when a token is added show only that the
contract answers like an ERC-20.

Balances are read with at most four `balanceOf` calls in flight at once, so a
full list of 50 tokens does not send 50 simultaneous requests to the public RPC.
Each token succeeds or fails on its own; one failing read never affects the
others.

### Internal transfers and token transfers in Activity

- Activity now reads three first-page lists from the existing Blockscout host:
  transactions, internal transactions (`/addresses/{address}/internal-transactions`)
  and ERC-20 transfers (`/addresses/{address}/token-transfers?type=ERC-20`).
  Internal calls that moved no ETH (value 0) are parsed but not shown.
- All three are parsed strictly by hand against recorded real responses. An item
  that cannot be read is counted and reported with "N entries couldn't be read
  and are not shown."; regression tests require every item of each recorded
  response to parse.
- Token amounts need decimals. For a token in your list, the decimals stored when
  you added it (read from the contract on-chain) are always used, even if
  Blockscout reports different ones. Only for an unlisted token are Blockscout's
  decimals used, and if they are missing or unusable the row says "Amount
  unavailable"; Nerafi never guesses decimals.
- A failed internal transfer (Blockscout reports `success` false, or any error
  text) moved no ETH. It is shown as "Failed internal transfer" with no amount
  ("No ETH moved"), never as a transfer in or out; it does not count as received,
  does not appear under the Sent or Received filters, and does not trigger a
  balance refresh. A failed internal call with value 0 is hidden like any other
  zero-value call. A contract creation (`to` is null) names the new contract in
  `created_contract`; when that contract is the wallet's address the item is read
  as on the receiving side.
- The three lists fail independently. If one fails the others are still shown,
  together with a note naming the part ("Token transfers couldn't be loaded.") and
  a statement that what is shown is not the full picture. Partial history is never
  presented as complete, and an empty feed with a failed part never says "No
  transactions yet."
- Only the first page of the internal and token lists is read, and the page says
  so ("this list may be incomplete") when Blockscout reports more. The detail view
  of these rows carries the same first-page-only source note.

### Zero-value transfers

An incoming token transfer with value 0 is shown with: "Zero-value transfer.
Attackers use these to plant lookalike addresses in your history." Anyone can
trigger a transfer of nothing from an address that resembles one you use, so that
it appears in your history. An outgoing zero-value transfer gets no warning.

### Blockscout data never enters the known set

The counterparty of every internal and token transfer goes through the same
`activityCounterpartyInfo` check as a transaction, so a known contact or account
is named and a sender that resembles a known address gets the poisoning warning.
Nothing read from Blockscout, internal transactions or token transfers is ever
added to the known set, the address book, the sent-recipient list or the token
list. A test checks that parsing and merging this data leaves the known set
unchanged and writes nothing to storage, and that the history and token modules
do not import the modules that write those lists.

### Security log

Adding and removing a token are recorded as `token added` and `token removed`
with no detail, so a token's address, symbol or name never enters the log.

### Limits

- Nerafi cannot tell whether a token is legitimate. A confirmed token is only one
  the user chose to list.
- The token list, like the address book, is local and not integrity-protected; a
  changed browser profile can change it.
