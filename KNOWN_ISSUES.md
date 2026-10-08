# Known Issues

## npm audit: 6 vulnerabilities in dev tooling (accepted)

**Date reviewed:** 2026-10-08 · **WXT version:** 0.21.4

`npm audit` reports 3 high and 3 critical issues, all pulled in through `web-ext`, which WXT uses only to launch a browser during development:

- `node-forge` (via `@devicefarmer/adbkit`, Firefox for Android tooling): RSA signature verification flaw
- `shell-quote` (via `fx-runner`, desktop Firefox launcher): command injection in `quote()`

**Why accepted:** none of these packages are included in the built extension (`.output/`). They run only on the developer's machine, only for Firefox launching, and only with local input. Nerafi targets Chrome.

**Why not `npm audit fix --force`:** it downgrades `web-ext` to 5.1.0, a years-old release that breaks WXT.

**Recheck:** whenever WXT is upgraded.