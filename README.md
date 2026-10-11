# Nerafi

Testnet-only Chrome extension wallet that explains transactions before you sign.

[![CI](https://github.com/joshuamhone/nerafi/actions/workflows/ci.yml/badge.svg)](https://github.com/joshuamhone/nerafi/actions/workflows/ci.yml)

> **Warning:** Nerafi is an educational portfolio project. It is testnet only.
> **Never use it with real funds or a real recovery phrase.** It has not been
> audited, and it makes no security guarantees.

## Status

- **Milestone 1 — complete:** wallet creation and recovery-phrase onboarding.
- **Milestone 2 — planned:** encrypted vault (password-based encryption,
  lock/unlock).
- **Milestone 3 — planned:** Sepolia balance, transaction explanation, signing,
  and sending.

## Features (Milestone 1)

- **BIP-39 12-word phrase generation.** 128 bits of entropy drawn from
  `crypto.getRandomValues` via viem and `@scure/bip39`.
- **Checksum validation.** Phrases are checked against the BIP-39 English
  wordlist and checksum before use.
- **BIP-44 derivation** at `m/44'/60'/0'/0/0`.
- **Full-page onboarding** in a dedicated tab: generate, reveal, confirm three
  random words, then show the address.
- **Zero extension permissions.** The manifest requests an explicit empty
  permission list.

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
    wallet/           Full-page onboarding UI (generate, reveal, confirm, done).
    background.ts     Background service worker.
  lib/wallet/
    account.ts        Phrase generation, checksum validation, address derivation.
    confirm.ts        Random confirmation-word selection and answer checking.
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
