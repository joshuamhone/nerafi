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
explorer, a transaction detail view, and local sent records.

What Nerafi does today:

- Generates a 12-word BIP-39 recovery phrase on request.
- Validates the phrase's wordlist membership and checksum.
- Derives a single address at the BIP-44 path `m/44'/60'/0'/0/0`.
- Asks the user to confirm three randomly chosen words from their written copy.
- Encrypts the phrase with a password and saves the encrypted vault, plus the
  public address, in `chrome.storage.local`.
- Holds only the unlocked address and an expiry time in `chrome.storage.session`
  (in memory only) so the wallet can stay open while unlocked, and clears it on
  lock, on browser close, and when its 15-minute auto-lock window has passed.
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
  review the user approves, never from a history row.

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
- The phrase is decrypted from the vault at exactly two moments: during unlock
  (to verify the password and derive the address) and during signing. Each time
  it is a local variable for the duration of that operation and is not kept
  afterwards. The JavaScript memory caveat applies during those windows (see
  "Known limitations").
- The wallet page reads the session address to decide whether it is unlocked. The
  unlocked screen itself does **not** keep the phrase.
- Pressing "Lock" removes the session entry immediately.

### Auto-lock

The auto-lock window is **15 minutes** (see `AUTO_LOCK_MS`). Expiry is enforced
whenever the unlocked state is read: if the current time is at or past the
expiry, the session entry is removed and treated as locked. The wallet page also
re-checks once every 30 seconds while the unlocked screen is open. If no page
reads the session, the only thing that can outlive the window is the unlocked
address and expiry, not the phrase. A precise timer would need the `alarms`
permission, which Nerafi deliberately does not request; the trade-off is noted in
`KNOWN_ISSUES.md`.

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

- Blockscout's `coin_transfer` list does not include ETH or tokens moved to the
  wallet by smart contracts (internal transactions), and it does not include
  ERC-20 token transfers. Those simply do not appear in the wallet's history.
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