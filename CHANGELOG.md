# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Local OME-Zarr `.zip` loading via a lazy `ZipStore` (zarrita + zip.js).
- Interactive feature scatter (Plotly) with selection, gating and CSV export.
- Correlation heatmap and manual annotation panels.
- OME-Zarr `labels/` groups load as an extra channel, and clicking an object in
  the 3D view selects it.
- Bidirectional link between the 3D view and the feature scatter: a selected
  object is painted in the volume and its points turn red in the scatter, in
  either direction. Selection is keyed by `(frame, label_id)`, so the same label
  id in two timepoints stays two distinct objects.
- Project governance & tooling: LICENSE, CITATION.cff, CONTRIBUTING,
  CODE_OF_CONDUCT, SECURITY, CHANGELOG, issue/PR templates, root CI, CodeQL,
  Dependabot.

### Changed
- Forked from Allen Institute's Vol-E and renamed to Interactive Zarr Explorer.

### Known issues
- None currently tracked. CI runs lint, typecheck and tests as blocking checks
  for both packages.

<!--
Release checklist (maintainer):
1. Move items from [Unreleased] into a new ## [x.y.z] - YYYY-MM-DD section.
2. Commit (validated message), then: git tag vx.y.z
3. Draft a GitHub Release from the tag (auto-notes from PR titles).
-->
