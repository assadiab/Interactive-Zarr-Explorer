# Interactive Zarr Explorer — Vol-E with local OME-Zarr `.zip` support

A self-contained monorepo bundling a fork of **Vol-E (Volume Explorer)** — the
Allen Institute's browser-based 3D volume viewer — extended to open **local
OME-Zarr files packaged as `.zip`** directly in the browser, with no server, no
upload, and no account. Everything runs client-side.

- **`vole-core/`** — the WebGL engine (forked from
  [allen-cell-animated/vole-core](https://github.com/allen-cell-animated/vole-core)).
  Adds `ZipStore`, a zarrita store that reads OME-Zarr chunks lazily out of a
  local `.zip` `Blob`, exposed through the `zipSources` loader option.
- **`vole-app/`** — the React app (forked from
  [allen-cell-animated/vole-app](https://github.com/allen-cell-animated/vole-app)).
  Adds local `.zip` loading, multi-zip scenes/overlay, and the analysis panels.

`vole-app` consumes the local `vole-core` through `"@aics/vole-core":
"file:../vole-core"`, so the two always build together.

---

## What's new (fork additions)

Everything below is added on top of upstream Vol-E:

- **Local `.zip` loading** — read an `.ome.zarr.zip` in place, lazily, per chunk,
  with no extraction and no server (`ZipStore`).
- **Hardened, secure parsing** — clear errors for unreadable / non-OME-Zarr /
  encrypted archives, backslash path normalization for cross-OS zips, and guards
  against hostile archives (entry-count and per-entry size caps, metadata CRC,
  truncation detection).
- **Multi-zip loading** — load several `.zip` files at once and either **overlay**
  their channels into one volume or browse them as switchable **scenes** (with a
  file-name scene picker). Channel settings are remembered **per scene**.
- **Feature scatter (2D)** — when a zarr carries a `tables/measurements` table, an
  interactive scatter with X/Y/color-by, box/point selection, per-feature gates,
  and CSV export.
- **Correlation heatmap** and **manual annotation labels** over the same table.

> **Known limitation:** switching between very different scenes can briefly show a
> _bleedthrough_ of another scene's image while it reloads. Tracked; see the repo's
> task notes.

---

## How it works

### ZIP load path

```
Load .zip / /local route  →  File Blob
  → vole-core OmeZarrLoader → ZipStore(blob)     ← central directory indexed once
      .get(key) → Blob.slice per chunk (STORED)  | zip.js fallback (DEFLATE)
      ← auto-detects a nested "<name>.ome.zarr/" root prefix, applied to every key
  → zarrita open(store) → multiscale render pipeline (Three.js / WebGL)
```

`ZipStore` reads only the ZIP central directory up front, then slices each chunk
on demand — so opening a multi-gigabyte archive is instant and memory stays flat.

### Measurement-table path (optional)

```
loadMeasurements(store)                 ← reads tables/measurements (AnnData, Zarr v2)
  → { labelIds, features, index }
  → useViewerState.setMeasurements(...)  ← shared selection state
  → Features tab: ScatterPanel / CorrelationPanel / AnnotationPanel
```

The analysis panels are **modular**: they only appear when a `tables/measurements`
group is present, so a plain image viewer stays plain.

---

## Repo structure

```
/
├── pixi.toml  pixi.lock              ← pins Node.js, defines all tasks
├── vole-core/                        ← WebGL engine + ZIP/Zarr loaders (library)
│   └── src/loaders/
│       ├── OmeZarrLoader.ts               ← multiscale loader entry
│       └── zarr_utils/ZipStore.ts         ← lazy per-chunk ZIP store (fork core)
└── vole-app/                         ← React app (consumes vole-core via file:../)
    └── src/aics-image-viewer/
        ├── components/
        │   ├── App/index.tsx              ← viewer root, scenes + panels wiring
        │   ├── useVolume.ts               ← volume lifecycle, per-scene loading
        │   ├── ScatterPanel.tsx           ← Plotly scatter + gating + CSV
        │   ├── CorrelationPanel.tsx       ← correlation heatmap
        │   └── AnnotationPanel.tsx        ← manual label tagging
        ├── shared/utils/
        │   ├── sceneStore.ts              ← one SceneStore per dataset, N scenes
        │   └── loadMeasurements.ts        ← reads tables/measurements (AnnData)
        └── state/
            ├── store.ts                   ← Zustand store root (channels, view)
            └── selection.ts               ← measurements, gates, selection, labels
```

Load entry points: `public/LocalZipViewer.tsx` (the `/local` route) and
`website/components/Modals/LoadModal.tsx` (the **Load URL** / **Load .zip** buttons).

---

## Installation

Requires [pixi](https://pixi.sh) (it provides the pinned Node.js — no global Node
needed).

```bash
pixi run setup   # install deps + build vole-core + link it into vole-app
pixi run dev     # start the dev server at http://localhost:9020
```

Then open http://localhost:9020 and click **Load .zip**.

> After editing anything in `vole-core/src`, run `pixi run rebuild-core` (or
> `pixi run build-core`) so the app picks up the rebuilt engine — `vole-app`
> consumes the **built** `vole-core/es`, not its source.

---

## Loading data & options

- **Load .zip** — drag-and-drop **one or more** local `.ome.zarr.zip` files.
- **Load URL** — load a remote OME-Zarr by `https://`, `s3://`, or `gs://` URL.

With **several** files, a toggle appears:

| Mode | Behavior | Use when |
|---|---|---|
| **Separate scenes** (default) | one volume per zip, switchable via the scene picker; each scene keeps its own channel settings | the files are unrelated / different shapes |
| **Overlay channels** | merge every zip's channels into a single volume | the files share identical pixel dimensions |

Overlay requires matching dimensions and fails clearly otherwise, which is why
**Separate scenes** is the default.

### Feature panels

When a loaded zarr contains `tables/measurements`, a **Features** tab appears with:

- an interactive **scatter** — pick X / Y / color-by, click or box-select objects,
  set per-feature **min/max gates**, and **export CSV** (selection, gated, or full);
- a **correlation heatmap** across features;
- **manual annotation** labels.

Selection and gates live in shared state keyed by each object's `label_id`.

### Preparing a `.zip`

Package the `.ome.zarr` folder with **no compression** (STORE mode) — Zarr chunks
are already compressed, so zip deflate only slows reads:

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

---

## Integrating into your own app

Two levels of reuse:

### 1. The engine (`vole-core`) — read a local zip anywhere

`ZipStore` + `OmeZarrLoader` work outside this app. Point the loader at one or more
zip `Blob`s via the `zipSources` option:

```ts
import { OmeZarrLoader, VolumeFileFormat } from "@aics/vole-core";

const loader = await context.createLoader("local.zip", {
  fileType: VolumeFileFormat.ZARR,
  zipSources: [{ data: zipBlob /*, rootPath: "name.ome.zarr" */ }],
});
// rootPath is auto-detected when omitted; several zipSources are overlaid as channels.
```

### 2. The viewer (`vole-app`) — mount the `App` component

The React `App` component takes its data source as props, so you can embed it and
feed it a local zip without the landing page:

```tsx
import { App } from "vole-app"; // see vole-app/src/index

// One file, or Blob[] to overlay, or { scenes: Blob[] } for switchable scenes.
<App zipData={myZipBlob} viewerChannelSettings={/* optional defaults */} />
```

`zipData` accepts `Blob | Blob[] | { scenes: (Blob | Blob[])[] }`; pass `zipRootPath`
to skip root auto-detection. For remote data, pass `imageUrl` instead. The minimal
standalone example lives in `public/LocalZipViewer.tsx` (the `/local` route).

---

## Useful pixi tasks

| Command | What it does |
|---|---|
| `pixi run setup` | one-time install + build + link |
| `pixi run dev` | webpack dev server (vole-app) at :9020 |
| `pixi run build-core` / `rebuild-core` | recompile `vole-core` after editing it |
| `pixi run typecheck` | typecheck both projects |

---

## Notes & license

- The standalone GitHub forks ([vole-app](https://github.com/assadiab/vole-app),
  [vole-core](https://github.com/assadiab/vole-core)) remain as snapshots; this
  monorepo is the working source of truth.
- Vol-E is licensed under **BSD-3-Clause**; the original Allen Institute copyright
  and license are retained in each sub-project's `LICENSE`.
