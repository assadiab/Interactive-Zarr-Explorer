# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-08-21

First release. An interactive viewer for large OME-Zarr `.zip` biomedical imaging
datasets, built on the Allen Institute's Vol-E.

### Added

**Reading data**
- Local OME-Zarr `.zip` loading through `ZipStore`, a zarrita store that indexes the
  archive's central directory once and then slices each chunk on demand — no
  extraction, and memory that stays flat regardless of archive size.
- Multi-zip loading: several files at once, either as switchable **scenes** (each
  keeping its own channel settings) or as **overlaid** channels in one volume.
- Hardened archive parsing: clear errors for unreadable, non-OME-Zarr and encrypted
  zips; backslash path normalisation for archives written on Windows; entry-count and
  per-entry size caps against hostile archives; CRC checks on metadata files; and
  detection of an archive whose directory points past the end of the file.
- OME-Zarr `labels/` groups load as an extra channel, which is what makes objects
  pickable.
- Physical metadata read from the NGFF axes — voxel size, units and scale bar.

**Analysis**
- Interactive feature scatter (Plotly) with X / Y / colour-by, point and box selection,
  per-feature gates, and CSV export.
- Correlation heatmap and manual annotation labels over the same measurement table.
- Object picking in the 3D view.
- Bidirectional link between the 3D view and the scatter: picking in the volume
  highlights the points, selecting points paints the objects. Selection is keyed by
  `(frame, label_id)`, so a label id that restarts at 1 in every timepoint still
  identifies one object per frame.
- Tracking overlay: trajectories and per-frame detections from an ilastik tracking CSV,
  with a Tracks panel offering isolation of a single track and per-track statistics
  (duration, path length, mean speed, maximum step, straightness).

**Integration and resources**
- A dataset catalogue an embedding application can declare, browsable from inside the
  viewer.
- GPU texture memory budget (`maxAtlasBytes`, 1 GiB by default) taken into account when
  choosing the multiscale level, alongside the atlas edge limit.
- Host configuration for the loader's cache and request-queue sizes (`cacheMaxSize`,
  `queueMaxSize`, `queueMaxLowPrioritySize`).
- Project governance and tooling: LICENSE, CITATION.cff, CONTRIBUTING, CODE_OF_CONDUCT,
  SECURITY, issue and pull-request templates, CI, CodeQL and Dependabot.

### Changed
- Analysis panels (Annotation, Tracks) moved into the single left rail; the right panel
  is gone and the canvas is wider.
- CI runs lint, typecheck and tests as **blocking** checks for both packages — there is
  no `continue-on-error` left in the workflow.
- `pixi.lock` is no longer tracked (CI pins Node through `setup-node` and never used
  pixi), and `pixi run lint` / `test` / `check` reproduce the CI checks locally.

### Fixed
- Anisotropic volumes rendered squashed. NGFF allows a coordinate transform on the
  multiscale *and* on each dataset, and the effective one is the two composed; the
  loader read only the dataset's. Since ilastik writes the physical voxel size on the
  multiscale and leaves level 0 at all-ones, the viewer believed voxels were cubic.
- A volume too large for the texture atlas is now loaded at reduced quality **with an
  explicit warning**, instead of degrading silently behind a console message.
- Windows path compatibility.

### Removed
- Allen's production Firebase configuration and Analytics, which the entry point
  initialised on every build, together with the dead Firestore dataset-browsing path it
  fed.
- A hardcoded Google Tag Manager container loaded on every page view.
- The link to Allen's support forum, which pointed users at support for a fork Allen
  does not provide.

### Known issues
- On Zarr v3, a measurement table's ids load but its feature columns do not: AnnData
  stores the column names as a string array, which the pinned zarrita does not decode.
  Images are unaffected, and the tables produced today are v2.

<!--
Release checklist (maintainer):
1. Move items from [Unreleased] into a new ## [x.y.z] - YYYY-MM-DD section.
2. Commit (validated message), then: git tag vx.y.z
3. Draft a GitHub Release from the tag (auto-notes from PR titles).
-->
