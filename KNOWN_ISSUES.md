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

**Accepted, with mitigations.** While the wallet is unlocked, `chrome.storage.session` holds only the active wallet address, the verified account addresses, and an expiry timestamp. The recovery phrase was removed from the session once sending began requiring the password, because no feature needs the phrase in session storage. The phrase is now decrypted from the vault only through `openVault` while checking a password — at unlock, at signing, when adding an account, and when changing the password — and is not kept afterwards. Session storage is in memory only, is cleared when the browser closes, and defaults to the `TRUSTED_CONTEXTS` access level, so content scripts and web pages cannot read it. What is exposed for the unlock window is public on-chain data (addresses).

## Auto-lock is enforced on read, not by a timer

**Accepted limitation.** The auto-lock window (15 minutes by default, set to 1/5/15/30/60 minutes on the Settings page) is checked whenever the unlocked state is read (`readSession`), and the wallet page re-checks every 30 seconds while it is open. If no Nerafi page reads the session, the unlocked flag, the account addresses, and the expiry can remain in `chrome.storage.session` past the window until the next read or until the browser closes. The recovery phrase is not in the session, so it cannot outlive the window; only the unlocked flag and addresses can. A precise timer would require the `alarms` permission, which was deliberately not added to keep the extension's permission list to exactly `storage`.

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

## No token sending or approvals yet

**Accepted limitation.** Tokens are read-only: Nerafi shows balances and
transfers of ERC-20 tokens you add by contract address, but it cannot send a
token, and it neither creates nor shows token approvals. Sending, approvals and
NFTs (ERC-721 / ERC-1155, which are not requested from Blockscout) are not
built.

## Token balances trust the Sepolia RPC

**Accepted limitation.** A token balance is whatever `balanceOf` returns from the
public RPC endpoint, and a token contract can return any number it likes. Nerafi
checks only that the contract answers like an ERC-20 when you add it. The token's
name and symbol are also chosen by its deployer; they are sanitised (hidden and
bidi characters removed, length cut) but can still be misleading, which is why
the contract address is shown in full and a second token with the same symbol is
flagged. A malicious token can report any balance, so a displayed token balance is
not proof of ownership or value. The token list
(`chrome.storage.local["nerafi.tokens"]`, at most 50) is local and not
integrity-protected. Balances are read at most four calls at a time, each token
failing independently to "Couldn't load".

## Blockscout internal and token lists are first page only

**Accepted limitation.** Internal transfers (`internal-transactions`) and ERC-20
transfers (`token-transfers?type=ERC-20`) are read as a single first page
alongside the first page of transactions, with no "Load more". When Blockscout
reports more pages, Activity says the list may be incomplete. The All / Sent /
Received filter and the search apply to what is loaded. Internal calls that moved
no ETH are not listed. If one of the three requests fails, Activity shows the
other two with a note naming the part that failed.

## Blockscout reports native ETH transfers as token transfers

**Verified finding, handled by filtering.** On Sepolia, a native ETH transfer is also
written to the transaction's logs as an ERC-20-style `Transfer` event emitted from the
system address `0xfffffffffffffffffffffffffffffffffffffffe` (the EIP-7708 behaviour).
Blockscout therefore returns these events in its token-transfers list as "ERC-20"
transfers of a token with no symbol, name or decimals. They are not tokens: for
example, transaction `0x3ca85c21…1ec5` is a plain ETH send between two ordinary
accounts whose only log is one of these events, with event data equal to the
transaction's value. Left alone, each ETH transfer showed up in Activity as a "Token
transfer ... Amount unavailable ... Unlisted token" row and inflated the Security
Center's "unlisted tokens" count.

Nerafi parses these items like any other and then leaves them out of Activity's token
rows, the Security Center counts (unlisted tokens received, zero-value inbound,
lookalike senders) and the same-symbol check, by **exact address match only**
(case-insensitive). They are not counted as "entries that couldn't be read". Nothing
is hidden because its metadata is null: a real token that reports null metadata still
shows as an unlisted token. Opening a detail link for one of these events shows the
existing "not in the loaded history" message. The ETH itself still appears through
its ordinary transaction row (and, for contract calls, the internal-transfer rows).

**Earlier fixtures.** The fixture previously named `token-transfers-nulldecimals-live.json`
(now `token-transfers-native-eth-live.json`) held two such events, from contract calls
that carried ETH, one of them a `deposit()`. They were described earlier as "a token
transfer whose symbol, name and decimals were all null"; they were native ETH logs,
not a token. No live token with null metadata turned up (about 1,750 transfers across
61 addresses were checked), so the tests for "a token with null metadata" use a
synthetic variation of that real item with an ordinary token address, and say so.

**Limits of this check.** It relies on Blockscout reporting the system address as it
does today, and the same-address filter would stop being right if the network assigned
that address to something else. I could not read the system address's code from the
RPC in the environment where this was checked; Blockscout reports no contract there.

## Internal-transaction parser coverage of real responses

**Status of the fixtures.** The internal-transaction and token-transfer parsers
were written against live Blockscout responses saved under
`lib/wallet/history/fixtures/` (`internal-transactions-*-live.json`,
`token-transfers-*-live.json`), and every item in them parses. The live samples
cover zero-value `call`, `staticcall` and `delegatecall` entries, a `call` that
carried ETH from a contract flagged as a scam, a contract `create` whose `to` is
null (the wallet is the created contract), a token transfer with value 0, and two
native-ETH transfer logs from the system address (reported by Blockscout with a null
symbol, name and decimals; see "Blockscout reports native ETH transfers as token
transfers"). Every file named
`*-live.json` is an unedited, trimmed Blockscout response; fields such as a
token's `holders_count` have since drifted on the live API, which is the only
difference from a fresh fetch.

**The failed internal transfer case was verified only with a synthetic item.**
No internal transfer with `success: false` or an `error` string appeared in the
pages searched, so the failed-transfer handling (label "Failed internal
transfer", no amount, not counted as received) is tested against variations of a
real successful item, not against a live failed one. Real failed items may carry
other fields or error text than assumed. A synthetic `to: null` variation is also
used in a few tests for an item the wallet sent; the real `to: null` item is a
contract creation. NFT transfers were not sampled because they are not requested.

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

## Unlock backoff is a UI throttle, not a strong defense

**Accepted limitation.** After five consecutive wrong passwords, unlocking is delayed with an exponentially growing wait (30 seconds, doubling, capped at 15 minutes). The delay slows guessing from the UI, but it is not a real defense against an attacker who has a copy of the vault file: that attacker can attempt decryption offline, where PBKDF2's 600,000 iterations are the only cost. The delay is stored in `chrome.storage.local["nerafi.unlockGuard"]`, which the attacker can also edit or delete, and it is measured against the system clock, so changing the system clock can shorten or end a lockout. It is a usability-facing guardrail, not a cryptographic control.

## The security log is local and not tamper-proof

**Accepted limitation.** `chrome.storage.local["nerafi.securityLog"]` keeps the last 200 events (locks, unlocks, failed attempts, lockouts, password/account/auto-lock changes, address mismatches, restores, contact changes, token changes, and lookalike and risk acknowledgements) with a type, timestamp, and a short fixed-format detail. The contact, token, lookalike and risk events carry no detail at all, so a contact's name, a token's address or symbol, or an address never enters the log. It never contains addresses, amounts, user names, passwords, phrases, or keys, and there is deliberately no "clear log" button. Because it lives in this browser profile, anyone with access to the profile can read, alter, or clear it. It is a convenience history, not a tamper-evident audit trail.

## Address book and lookalike warnings are local heuristics

**Accepted limitation.** The address book (`chrome.storage.local["nerafi.contacts"]`, up to 100 contacts), the list of addresses already sent to (`chrome.storage.local["nerafi.sentRecipients"]`, last 500), and the known-recipient classification are all local, best-effort convenience state. They live in this browser profile, so anyone with access to the profile can read or alter them, and a contact name is a user label with no security meaning. Choosing a contact copies the address stored in the local contact entry into the recipient field, and the review cheque shows that address in full; contact entries are not integrity-protected, so a changed browser profile can change them. Check the full address on the review cheque.

The lookalike check is a heuristic, not a proof. It flags a different address whose first and last three hex characters match a known address, or whose first five or last five match; the false-positive rate is deliberately generous (about 1 in 524,000 per comparison for the five-character rule), because the worst case of a false positive is one extra prompt while the cost of a false negative is sending to an attacker. An attacker who avoids matching three leading and three trailing characters, or five at one end, will not be flagged, and a flagged address may still be the real one. Classification order is own account, contact, lookalike, previously sent, unknown: a lookalike outranks "sent before", so one acknowledged send to a poisoning address never turns it into a trusted address. The known set deliberately excludes addresses that sent to you and Blockscout data, so an attacker who gets a lookalike into your history cannot get it into your known set; but the known set is only as good as what you have saved or sent.

The acknowledgement checkbox on the review cheque gates only the lookalike warning; it is not a second factor and does not change what is signed. It exists so a lookalike cannot be sent to by muscle memory, and it resets whenever the recipient changes.

## All accounts share one recovery phrase

**Accepted by design.** Up to ten accounts are derived from the one recovery phrase at `m/44'/60'/0'/0/{index}`. They are separate addresses, not separate secrets: anyone who learns the phrase controls every account, and a compromise of one account's key is a compromise of all of them. The password protects access through the UI, but it does not create per-account isolation. Account names are local display labels only and carry no security meaning.

## Risk thresholds are unvalidated heuristics

**Accepted limitation.** The rules on the review cheque and in the Security Center
use fixed limits (a send of 90% or more of the balance, a fee above 10% of the
amount, an auto-lock above 30 minutes, three failed password attempts in 24 hours)
that were chosen as reasonable rules of thumb and have not been tested against real
user behaviour or real attacks. They will fire when nothing is wrong and stay quiet
when something is. There is no score and no "safe" verdict: no warnings means only
that none of these checks fired.

## The contract check trusts the RPC

**Accepted limitation.** Whether a recipient is a contract comes from one
`eth_getCode` call to the public RPC endpoint. A wrong or dishonest answer would
mislabel an address, and a failed or slow lookup (eight-second timeout) is reported
as "could not check", never as "not a contract". The check also cannot tell what a
contract does, only that it has code.

## The Security Center reads only locally loaded history

**Accepted limitation.** The Activity-based checks (zero-value transfers, lookalike
senders, unlisted tokens) look only at the history already loaded in this session,
which is the first page of each Blockscout list, and are skipped when nothing has
been loaded. Older activity is not checked. Failed password attempts come from the
local security log, which can be read or cleared by anyone with access to the
browser profile and counts wrong passwords at unlock, send, add-account and
change-password alike.

## The permissions check is a self-report

**Accepted limitation.** The Security Center reads the extension's manifest through
the extension API. A modified build could report anything, so a clean result is the
extension describing itself, not independent proof. A development build adds extra
permissions for its reloading tools and is flagged by this check at the same
severity; the page adds the note "Development builds add extra permissions. If you
are running a build made with the development server, this is expected; check a
production build."
