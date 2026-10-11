# Known Issues

## npm audit: 6 vulnerabilities in dev tooling (accepted)

**Date reviewed:** 2026-10-08 · **WXT version:** 0.21.4

`npm audit` reports 3 high and 3 critical issues, all pulled in through `web-ext`, which WXT uses only to launch a browser during development:

- `node-forge` (via `@devicefarmer/adbkit`, Firefox for Android tooling): RSA signature verification flaw
- `shell-quote` (via `fx-runner`, desktop Firefox launcher): command injection in `quote()`

**Why accepted:** none of these packages are included in the built extension (`.output/`). They run only on the developer's machine, only for Firefox launching, and only with local input. Nerafi targets Chrome.

**Why not `npm audit fix --force`:** it downgrades `web-ext` to 5.1.0, a years-old release that breaks WXT.

**Recheck:** whenever WXT is upgraded.
## @scure/bip39 pinned to viem's version

We use `@scure/bip39` directly for phrase validation; viem uses it internally for generation and derivation. Our version is pinned to match viem's (currently 1.6.0) so a single copy handles all phrase operations. When upgrading viem, check `npm ls @scure/bip39` and match the version.

## Address stored unencrypted in storage.local

**Accepted by design.** The wallet address is saved as plain text under `chrome.storage.local["nerafi.address"]`, next to the encrypted vault. This lets the locked screen show which wallet is stored before the password is entered. The address is public on-chain, so it is not secret; the recovery phrase remains encrypted. Anyone with read access to the extension's local storage can see the address, but not the phrase or the private key. The stored address is only a display hint for the locked screen; after unlock the address is always re-derived from the decrypted phrase and the stored copy is corrected if it differs, so a tampered address cannot survive an unlock.

## Wrong password and damaged vault share one error

**Accepted by design.** Unlocking reports "Incorrect password or damaged vault" for both a wrong password and a corrupted vault. AES-GCM cannot distinguish a wrong key from altered data, so the two cases are merged.

## Unlocked phrase lives in chrome.storage.session

**Accepted, with mitigations.** While the wallet is unlocked, the recovery phrase is held in `chrome.storage.session` as `nerafi.session`. Session storage is in memory only, is cleared when the browser closes, and defaults to the `TRUSTED_CONTEXTS` access level, so content scripts and web pages cannot read it. It is still a copy of the phrase in extension memory for the duration of the unlock window.

## Auto-lock is enforced on read, not by a timer

**Accepted limitation.** The 15-minute auto-lock is checked whenever the unlocked state is read (`getUnlockedPhrase`), and the wallet page re-checks every 30 seconds while it is open. If no Nerafi page reads the session, the phrase can remain in `chrome.storage.session` past the 15-minute mark until the next read or until the browser closes. A precise timer would require the `alarms` permission, which was deliberately not added to keep the extension's permission list to exactly `storage`.