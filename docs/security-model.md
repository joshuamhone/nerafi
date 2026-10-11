# Security model

This document describes what Nerafi does, what it does not do, and where the
trust boundaries are. It is written in plain English on purpose. Nerafi is an
educational, testnet-only portfolio project, so this document is a description
of the current design, not a guarantee.

## Scope

Milestone 1 covers wallet creation and recovery-phrase onboarding, and nothing
else.

What Milestone 1 does:

- Generates a 12-word BIP-39 recovery phrase on request.
- Validates the phrase's wordlist membership and checksum.
- Derives a single address at the BIP-44 path `m/44'/60'/0'/0/0`.
- Asks the user to confirm three randomly chosen words from their written copy.

What Milestone 1 does not do:

- It does not persist anything. There is no storage layer yet, so the phrase and
  address live only in the page's memory. Closing or reloading the tab loses the
  wallet permanently.
- It does not access the network. There is no RPC call, no balance lookup, and
  no chain interaction.
- It does not sign or send anything. There is no signing code and no private key
  handling beyond deriving the address.

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
  fields.
- After a successful confirmation, the page drops its reference to the phrase
  (`setWords([])`). This shortens how long the page holds it, but does not
  guarantee the bytes are erased from memory (see Known limitations).
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
- The manifest requests an explicit empty permission list
  (`permissions: []`). Opening the wallet tab uses `browser.tabs.create` with an
  extension-internal URL, which needs no permission.

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

## Planned (Milestone 2)

Milestone 2 adds an encrypted vault with password-based encryption and
lock/unlock. The vault's design — key derivation parameters, what gets stored and
where, and how unlocking is handled — will be documented here before it is
implemented.