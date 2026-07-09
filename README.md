# Viewer interactif — Vol-E with local OME-Zarr `.zip` support

A self-contained monorepo bundling a fork of **Vol-E (Volume Explorer)** — the
Allen Institute's browser-based 3D volume viewer — extended to open **local
OME-Zarr files packaged as `.zip`** directly in the browser, with no server and
no URL.

It combines the two halves of Vol-E in one place, with a [pixi](https://pixi.sh)
environment for reproducible setup:

- **`vole-core/`** — the WebGL engine (forked from
  [allen-cell-animated/vole-core](https://github.com/allen-cell-animated/vole-core)).
  Adds `ZipStore`, a zarrita store that reads OME-Zarr chunks lazily out of a
  local `.zip` `Blob`, exposed through the `zipSources` loader option.
- **`vole-app/`** — the React app (forked from
  [allen-cell-animated/vole-app](https://github.com/allen-cell-animated/vole-app)).
  Its home-page **Load .zip** button opens a drag-and-drop picker for **one or more**
  local `.ome.zarr.zip` files, read in-place via the engine's `ZipStore`. With
  several files you can either **overlay** their channels into one volume (same
  pixel dimensions required) or load them as switchable **scenes**, chosen from a
  file-name dropdown. A separate **Load URL** button loads remote OME-Zarr. When an
  archive carries a per-object measurement table, the app also adds an interactive
  **feature scatter** alongside the 3D view (see below).

`vole-app` consumes the local `vole-core` through `"@aics/vole-core":
"file:../vole-core"`, so the two always build together.

## Feature scatter (2D)

When a loaded OME-Zarr contains a `tables/measurements` group (an AnnData table
of per-object features, e.g. an ilastik export), the viewer reads it and shows a
**Features** tab in the control panel. The tab only appears once a table is
detected. It holds an interactive scatter plot that reproduces — and extends —
the old Dash viewer, entirely in the browser:

- pick the **X**, **Y**, and **color-by** feature from dropdowns;
- **click** a point or **drag a box** to select objects;
- set per-feature **min/max gates** to dim out-of-range objects;
- **export CSV** of the current selection, gated population, or full table.

Every object is keyed by its `label_id`, and selection/gates live in shared state
— the groundwork for the planned bidirectional link between the scatter and the
3D view.

The scatter works from any entry point that feeds the viewer a `.zip`: the main
**Load .zip** button, or the minimal standalone picker at the `/local` route.

## Quick start

Requires [pixi](https://pixi.sh) (it provides the pinned Node.js).

```bash
pixi run setup   # install deps + build vole-core + link it into vole-app
pixi run dev     # start the dev server at http://localhost:9020
```

Then open http://localhost:9020, click **Load .zip**, and pick a local
`.ome.zarr.zip`. The first three channels are enabled by default.

### Preparing a `.zip`

Package the `.ome.zarr` folder with **no compression** (STORE mode) — Zarr chunks
are already compressed, so zip deflate would only slow reads:

```python
import zipfile, os

src = "image.ome.zarr"
with zipfile.ZipFile("image.ome.zarr.zip", "w", zipfile.ZIP_STORED) as zf:
    for dp, _, files in os.walk(src):
        for f in files:
            full = os.path.join(dp, f)
            arc = os.path.relpath(full, os.path.dirname(src)).replace(os.sep, "/")
            zf.write(full, arc)
```

## Useful pixi tasks

| Command | What it does |
|---|---|
| `pixi run setup` | one-time install + build + link |
| `pixi run dev` | webpack dev server (vole-app) |
| `pixi run rebuild-core` | recompile `vole-core` after editing it |
| `pixi run typecheck` | typecheck both projects |

## Notes

- The standalone GitHub forks ([vole-app](https://github.com/assadiab/vole-app),
  [vole-core](https://github.com/assadiab/vole-core)) remain as snapshots; this
  monorepo is the working source of truth.
- Vol-E is licensed under **BSD-3-Clause**; the original Allen Institute copyright
  and license are retained in each sub-project's `LICENSE`.
