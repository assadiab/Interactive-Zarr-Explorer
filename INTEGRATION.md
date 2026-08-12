# Embedding the viewer in another web application

This repository ships two npm packages, published as tarballs on each GitHub
Release (see `.github/workflows/release.yml`):

| Package | What it is |
| --- | --- |
| `@aics/vole-core` | the WebGL engine and the OME-Zarr / ZIP loaders |
| `@aics/vole-app` | the React viewer built on top of it — this is what you embed |

They are **modified forks** of the Allen Institute packages, so their versions
carry an `-izx.<n>` suffix (for example `3.3.0-izx.7`). A version published here
is never the same code as the upstream package with the same base version.

## Install

Take both URLs from the Release page. Installing the app is enough — it pulls
the engine from its own release URL.

```bash
npm install https://github.com/assadiab/Interactive-Zarr-Explorer/releases/download/<tag>/aics-vole-app-<version>.tgz
```

`three` is a **peer dependency** of the engine and is not installed for you:

```bash
npm install three@^0.184.0
```

React 18 and `antd` come as regular dependencies of the app.

## Minimal usage

```tsx
import { ImageViewerApp } from "@aics/vole-app";

export function Viewer({ file }: { file: File }) {
  return (
    <ImageViewerApp
      // The data: a local OME-Zarr packaged as a .zip, read in place.
      zipData={file}
      // Required by the type even in zip mode, and ignored when zipData is set.
      imageUrl=""
      // MUST be viewport-based. See the warning below.
      appHeight="calc(100vh - 60px)"
      cellId="1"
      canvasMargin="0"
      imageDownloadHref=""
      parentImageDownloadHref=""
    />
  );
}
```

`zipData` accepts more than one file:

- `Blob` — one volume;
- `Blob[]` — several same-sized zarrs whose channels are merged into one volume;
- `{ scenes: (Blob | Blob[])[] }` — several volumes as switchable scenes.

`zipRootPath` is optional: the path of the zarr group inside the zip is
auto-detected, including the common `<name>.ome.zarr/` nested root.

## Three things that will cost you an afternoon

1. **`appHeight` must be viewport-based** — `calc(100vh - 60px)`, a `px` value,
   anything resolved against the viewport. Passing `"100%"` collapses the WebGL
   canvas to zero height and the render loop spins on an empty canvas. This is
   the single most common integration mistake.
2. **Several props are required by the type but unused in zip mode** —
   `imageUrl`, `imageDownloadHref`, `parentImageDownloadHref`. Pass empty
   strings; do not spend time looking for what they should contain.
3. **The `es/` build ships CSS next to the JS** and the components import it.
   Your bundler must accept a bare `import "some-file.css"` from `node_modules` (Vite,
   Next.js and a default webpack + `css-loader` setup all do).

## Data the viewer expects

A **zipped OME-Zarr**, read lazily: only the chunks needed for the current view
are sliced out of the archive, nothing is extracted to disk and nothing is
uploaded. OME-Zarr 0.4 (Zarr v2) and Zarr v3 layouts both load.

Zip the store in **STORE** mode (no compression). Zarr chunks are already
compressed; DEFLATE on top forces the whole entry to be decompressed on every
read and loses the random access.

If the store carries an AnnData measurement table at `tables/measurements`, the
analysis panels (feature scatter with gating and CSV export, correlation
heatmap, manual annotation) light up on their own. Without that table the viewer
is just the volume renderer — the panels are gated on its presence, not on a
flag you pass.

## Scope of a build from `main`

`main` covers the volume rendering, the local `.zip` loading (single, overlaid
and multi-scene) and the analysis panels described above.

The tracking overlay, the NGFF `labels/` group and 3D object picking live on the
`feat/analysis-panels` branch and are **not** in a release built from `main`.

## Requirements

A **WebGL2** browser. No server, no account, no upload: everything runs in the
page, against a file the user picks locally.
