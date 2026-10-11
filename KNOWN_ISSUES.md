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

## Unlocked session holds only the address

**Accepted, with mitigations.** While the wallet is unlocked, `chrome.storage.session` holds only the wallet address and an expiry timestamp. The recovery phrase was removed from the session once sending began requiring the password, because no feature needs the phrase in session storage. The phrase is now decrypted from the vault only at unlock (to verify the password and derive the address) and at signing, and is not kept afterwards. Session storage is in memory only, is cleared when the browser closes, and defaults to the `TRUSTED_CONTEXTS` access level, so content scripts and web pages cannot read it. What is exposed for the unlock window is the public address, which is on-chain data.

## Auto-lock is enforced on read, not by a timer

**Accepted limitation.** The 15-minute auto-lock is checked whenever the unlocked state is read (`getUnlockedAddress`), and the wallet page re-checks every 30 seconds while it is open. If no Nerafi page reads the session, the unlocked flag and address can remain in `chrome.storage.session` past the 15-minute mark until the next read or until the browser closes. The recovery phrase is not in the session, so it cannot outlive the window; only the unlocked flag and address can. A precise timer would require the `alarms` permission, which was deliberately not added to keep the extension's permission list to exactly `storage`.

## Public RPC operator sees the address, requests, and IP

**Accepted limitation.** Balance lookups and sent transactions go to a single keyless public endpoint (`https://ethereum-sepolia-rpc.publicnode.com`). The operator of that endpoint sees the wallet address, the contents of each request (including the signed transaction), and the user's IP address. A keyed endpoint would not help: an API key bundled in a browser extension is readable by anyone who installs it. The alternative, running our own node, is out of scope for a portfolio project on Sepolia.

## Public endpoint reliability is not guaranteed

**Accepted limitation.** The public RPC endpoint is shared and offers no uptime guarantee. Balance lookups, fee estimation, and sending can fail if the endpoint is busy or down. When a request fails, the wallet shows a fixed "Could not reach the Sepolia network." message rather than raw RPC errors.

## Fee estimates can go stale

**Accepted limitation.** Fees are estimated during review and then signed as a maximum (`gas limit × maxFeePerGas`). If the network base fee rises sharply between review and inclusion, the transaction may confirm slowly, or not until the fee environment falls back. The wallet does not re-estimate before signing, because what the user reviewed is what gets signed.

## No transaction history beyond the last send

**Accepted limitation.** Nerafi keeps no list of past transactions. After a send it shows the hash, the Etherscan link, and the status of that one transaction. Looking up anything older means using an external explorer. Storing history would add state to `chrome.storage.local` and a source of stale data without a clear benefit for a testnet wallet.

## Opening the Etherscan link shares data with Etherscan

**Accepted, user-initiated.** The "View on Sepolia Etherscan" link opens `sepolia.etherscan.io` in a new tab. Following it reveals the transaction hash and the wallet address to Etherscan, which is what an explorer is for. The link is only followed when the user clicks it; Nerafi itself never contacts Etherscan.