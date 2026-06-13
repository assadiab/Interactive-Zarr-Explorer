# Developing

## Local Dev Setup
#### For functionality changes
- make sure node.js is installed
- make sure aicsimage python lib is installed
- npm install
- npm run dev
- entry points:
-- localhost:9020/public
- supports ome.tif, .tif, and .czi provided they are self contained z stacks.
- note: the files will be placed in a temporary "cache" folder which should be periodically cleaned out.

### Running as a package within another app
- npm run build
- install the app as a sym link through npm
- import the app as `import { ImageViewerApp } from "ac-3d-viewer"`
- send in props as is shown in public/index.jsx
```
    <ImageViewerApp
        cellId={23618}
        baseUrl="http://dev-aics-dtp-001.corp.alleninstitute.org/cellviewer-1-4-0/Cell-Viewer_Thumbnails/"
        cellPath="AICS-17/AICS-17_4187_23618_atlas.json"
        fovPath="AICS-17/AICS-17_4187_atlas.json"
        defaultVolumesOn={[0, 1, 2]}
        defaultSurfacesOn={[]}
    />
```
## Deployment
publish to npm package 

static build:
use branch feature/show_static_data
npm run build-static
will build into /imageviewer directory.  Load index.html from there. No webpack-dev-server.
