# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Local OME-Zarr `.zip` loading via a lazy `ZipStore` (zarrita + zip.js).
- Interactive feature scatter (Plotly) with selection, gating and CSV export.
- Correlation heatmap and manual annotation panels.
- Project governance & tooling: LICENSE, CITATION.cff, CONTRIBUTING,
  CODE_OF_CONDUCT, SECURITY, CHANGELOG, issue/PR templates, root CI, CodeQL,
  Dependabot.

### Changed
- Forked from Allen Institute's Vol-E and renamed to Interactive Zarr Explorer.

### Known issues
- `vole-app` typecheck reports one pre-existing `three` version `Box3` mismatch
  (`useVolume.ts`), unrelated to this fork. CI typecheck/lint are non-blocking
  until cleaned up.

<!--
Release checklist (maintainer):
1. Move items from [Unreleased] into a new ## [x.y.z] - YYYY-MM-DD section.
2. Commit (validated message), then: git tag vx.y.z
3. Draft a GitHub Release from the tag (auto-notes from PR titles).
-->
