# Security Policy

## Threat model

Interactive Zarr Explorer is a **100% client-side** web application. It runs in
the browser, opens files the user picks locally, performs **no upload**, talks to
**no backend**, stores **no credentials**, and ships **no secrets**. There is no
server to attack and no account system.

The realistic risks are therefore narrow:

1. **Dependency vulnerabilities.** The app bundles a large npm tree inherited
   from the upstream fork. This is the primary attack surface. It is mitigated
   by Dependabot (`.github/dependabot.yml`) and CodeQL
   (`.github/workflows/codeql.yml`), plus periodic `npm audit`.
2. **Parsing untrusted archives.** The viewer opens arbitrary `.zip` / OME-Zarr
   files. Malformed or hostile archives (e.g. zip bombs, absurd declared sizes)
   could exhaust memory or crash the tab. Loader code (`ZipStore`) should treat
   all archive metadata as untrusted and bound its reads.

## Reporting a vulnerability

Please report security issues **privately**, not via public issues:

- Preferred: GitHub's private vulnerability reporting
  (repository **Security** tab -> *Report a vulnerability*).
- Or email the maintainer (see the repository profile).

Please include reproduction steps and the affected version/commit. You will get
an acknowledgement within a reasonable delay; fixes are released as patch
versions and noted in `CHANGELOG.md`.

## Supported versions

This project is pre-1.0. Only the latest release on `main` receives fixes.
