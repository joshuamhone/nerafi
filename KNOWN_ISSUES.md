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

## Two font packages added for the local typeface

**Accepted dependency.** The UI uses IBM Plex Sans and IBM Plex Mono, added as
the `@fontsource/ibm-plex-sans` and `@fontsource/ibm-plex-mono` packages. Only
the latin-subset weights are imported (sans 400/500/600, mono 400/500), and
Fontsource bundles the font files locally, so the extension never requests a
webfont from Google Fonts or any CDN at render time. The files are emitted into
`.output/chrome-mv3/assets/` at build time and are covered by the same CSP as
the rest of the bundled code. These are the only runtime dependencies added for
the visual work; the icons are inline SVG with no image files.

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

## Public Blockscout operator sees the address, requests, and IP

**Accepted limitation.** Activity history requests go to the public Blockscout explorer for Sepolia (`eth-sepolia.blockscout.com`). Each request asks for the transactions of the wallet's public address and, on later pages, the cursor Blockscout itself returned, so the operator can link the wallet address to the user's IP address, just as the public RPC operator can. No keys, phrases or passwords are sent.

## Public endpoint reliability is not guaranteed

**Accepted limitation.** The public RPC endpoint is shared and offers no uptime guarantee. Balance lookups, fee estimation, and sending can fail if the endpoint is busy or down. When a request fails, the wallet shows a fixed "Could not reach the Sepolia network." message rather than raw RPC errors.

## Fee estimates can go stale

**Accepted limitation.** Fees are estimated during review and then signed as a maximum (`gas limit × maxFeePerGas`). If the network base fee rises sharply between review and inclusion, the transaction may confirm slowly, or not until the fee environment falls back. The wallet does not re-estimate before signing, because what the user reviewed is what gets signed.

## Activity history depends on the Blockscout API

**Accepted limitation.** The Activity page and the recent-activity panel read
history live from the public Blockscout explorer for Sepolia
(`eth-sepolia.blockscout.com`). The explorer can lag the network by a few
seconds and can be temporarily unreachable or slow. When a load fails the
wallet shows a fixed "Couldn't load history from Blockscout." message with a
Retry button. The recent-activity panel on the Overview never blocks the
balance when history fails.

## Activity search and filter only cover loaded pages

**Accepted limitation.** The All / Sent / Received filter and the search box
apply to the pages already loaded (the first page, plus anything fetched with
"Load more"). Older transactions that have not been loaded are not searched,
because loading every page automatically would turn a user-initiated check into
an unbounded loop of network requests.

## Internal transfers and tokens are not shown in history

**Accepted limitation.** Blockscout's `coin_transfer` list does not include ETH
or tokens moved to the wallet by smart contracts (internal transactions), and
it does not include ERC-20 token transfers. The wallet's history is
plain-ETH-only for that reason.

## Blockscout labels are third-party data

**Accepted limitation.** Scam labels and reputation scores shown next to
counterparty addresses come from Blockscout and are shown as the explorer's
claim, with the wording "Blockscout labels this address as a scam. Nerafi has
not verified this label." They are never treated as a wallet verdict, and they
never affect what gets signed.

## A dropped transaction cannot be detected

**Accepted limitation.** Transactions this wallet sent are remembered locally
(`nerafi.localTx`, last 50) only until Blockscout indexes them: whenever a
loaded page returns a matching hash, the local record is deleted. Records that
stay unmatched are shown as "Pending" with the note "Sent from Nerafi · not yet
indexed by Blockscout". After 30 minutes the note changes to "Not seen by the
network after 30 minutes. It may have been dropped. Check your balance before
sending again." Nerafi cannot tell a transaction that is simply slow to index
from one that was dropped from the mempool, so it never marks a local-only
record as failed — it says so after 30 minutes rather than guessing. On the
first page, only records newer than the page's oldest item are shown when the
explorer has more pages (an old unmatched record is probably on an unloaded
page and is not guessed into the list).

## QR code rendering uses the `qr` package (accepted dependency)

**Accepted dependency.** The Receive page renders the wallet's address as a QR code with `qr` 0.7.2 (MIT OR Apache-2.0, `paulmillr/qr`). It has zero runtime dependencies: its helper package (`@paulmillr/jsbt`) is development-only, and the built extension bundles only the SVG output — the `dom.js` and `decode.js` entry points are never imported. The package declares `sideEffects: false`, so unused modules are tree-shaken. Rendering is fully local: no network request, no API key, no remote image. This is the only dependency added for receiving.

## Address copy relies on the system clipboard

**Accepted, user-initiated.** The Receive page can copy your public address to the clipboard, but only when you click "Copy address". The address is public on-chain, so unlike the recovery phrase nothing secret is written to the clipboard when other software reads it. Copying can fail (for example, when the wallet page does not have focus); in that case the page says to select the address manually.

## Opening the Etherscan link shares data with Etherscan

**Accepted, user-initiated.** The "View on Sepolia Etherscan" link opens `sepolia.etherscan.io` in a new tab. Following it reveals the transaction hash and the wallet address to Etherscan, which is what an explorer is for. The link is only followed when the user clicks it; Nerafi itself never contacts Etherscan.