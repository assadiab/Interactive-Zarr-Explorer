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
  Its home-page **Load** button opens a drag-and-drop picker for a local
  `.ome.zarr.zip`; the file is read in-place via the engine's `ZipStore`.

`vole-app` consumes the local `vole-core` through `"@aics/vole-core":
"file:../vole-core"`, so the two always build together.

## Quick start

Requires [pixi](https://pixi.sh) (it provides the pinned Node.js).

```bash
pixi run setup   # install deps + build vole-core + link it into vole-app
pixi run dev     # start the dev server at http://localhost:9020
```

Then open http://localhost:9020, click **Load**, and pick a local
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
