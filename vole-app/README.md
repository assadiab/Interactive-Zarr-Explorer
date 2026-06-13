# Vol-E App — local OME-Zarr `.zip` fork

> A fork of [Vol-E (Volume Explorer)](https://github.com/allen-cell-animated/vole-app)
> by the Allen Institute for Cell Science, extended to open **local OME-Zarr files
> packaged as `.zip`** directly in the browser — no server, no URL, no extraction.
>
> Vol-E is licensed under BSD-3-Clause; the original copyright and license are
> retained in [`LICENSE`](LICENSE).

Vol-E is a browser-based 3D volume viewer built with React and WebGL (Three.js).
This package wraps the [vole-core](https://github.com/assadiab/vole-core) library
(also forked — see below).

## What this fork adds

**Open a local OME-Zarr `.zip` straight from the home page.** The data is read
lazily, chunk by chunk, inside the browser — no HTTP server, no URL, no unzipping
to disk, and not Chromium-only (it uses `Blob.slice`, not the File System Access
API).

- The home-page **Load** button now opens a drag-and-drop picker for a local
  `.ome.zarr.zip` file (it replaces the previous "load from URL" field).
- The selected `File` is passed to the viewer through React Router navigation
  state and rendered via the new `zipData` prop on `ImageViewerApp`.
- The heavy lifting (a zarrita store that reads chunks out of the zip) lives in
  the matching [vole-core fork](https://github.com/assadiab/vole-core) as
  `ZipStore`, exposed through a new `zipSources` loader option.

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

## Supported data sources

- a local OME-Zarr packaged as a `.zip` (this fork's feature)
- a URL to an OME-Zarr or OME-TIFF image (still available as a React prop)
- a json file with texture atlases (legacy)

## Local development

This fork is developed alongside the [vole-core fork](https://github.com/assadiab/vole-core)
using [pixi](https://pixi.sh). With both repositories checked out side by side:

```bash
pixi run setup   # install deps, build vole-core, and link it into vole-app
pixi run dev     # start the dev server at http://localhost:9020
```

Then open http://localhost:9020, click **Load**, and pick a local `.ome.zarr.zip`.

### Use as a React component

```jsx
import { ImageViewerApp } from "@aics/vole-app";

<ImageViewerApp
  zipData={file}            // a File/Blob from an <input type="file">
  zipRootPath={undefined}   // optional; the zarr root inside the zip, auto-detected
  imageUrl=""
  appHeight="100%"
  canvasMargin="0 0 0 0"
/>
```

### Running with Docker

Clone the repository and run the following commands in the project root:

```cmd
docker build -t vole-app-image .
docker run --rm -p 9020:80 --name vole-app vole-app-image
```

The viewer is then available at [http://localhost:9020](http://localhost:9020).
To rebuild changes, run the above commands again. (The `--rm` flag deletes the
existing container when it is stopped.)

## Credits

Forked from [allen-cell-animated/vole-app](https://github.com/allen-cell-animated/vole-app)
(Allen Institute for Cell Science). The volume shader has distant origins in
[Bisque](http://bioimage.ucsb.edu/bisque). Licensed under BSD-3-Clause — see
[`LICENSE`](LICENSE).
