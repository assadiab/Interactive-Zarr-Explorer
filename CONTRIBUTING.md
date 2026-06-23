# Contributing to Interactive Zarr Explorer

Thanks for your interest. This is a small, mostly solo project, but it follows
conventions from the bioimaging open-source ecosystem (napari, zarr, ilastik) so
it stays clean and maintainable.

## Project layout

A monorepo with two forked packages:

- `vole-core/` — WebGL engine + ZIP/Zarr loaders (the `ZipStore` lives here).
- `vole-app/` — React viewer app; consumes `vole-core` via `file:../vole-core`.

`vole-app` consumes the **built** output of the engine (`vole-core/es/`), so any
change in `vole-core/src` must be rebuilt before the app sees it.

## Development setup

The environment (Node.js version) is pinned by [pixi](https://pixi.sh).

```bash
pixi run setup       # install core, build core, install app
pixi run dev         # run the app at http://localhost:9020
pixi run build-core  # rebuild the engine after editing vole-core/src
pixi run typecheck   # typecheck both packages
```

## Branch & commit workflow

Trunk-based, optimised for a small team:

- `main` is always green and deployable.
- Create a **short-lived** branch when you start a unit of work, named
  `feat/<slug>`, `fix/<slug>`, `core/<slug>`, or `chore/<slug>`.
- Open a pull request to `main` (yes, even solo — it runs CI and forces a
  re-read), then merge and delete the branch.
- Keep branches short (days, not weeks). Split large work into mergeable slices
  rather than maintaining a long-lived parallel branch. Optional features stay
  removable through code modularity (panels activate only when
  `tables/measurements` is present), not through quarantine branches.

### Commit messages (Conventional Commits)

```
<type>(<scope>): <short imperative description>
```

- **types:** `feat` `fix` `chore` `docs` `refactor` `test` `perf`
- **scopes:** `zip-store` `loader` `scatter` `gates` `annotation` `correlation`
  `ui` `state` `ci` `deps`
- Subject ≤ 72 chars, lowercase, imperative ("add", not "added"); no trailing period.
- Reference issues in the body: `closes #N`.

## Code conventions

- All code **and comments in English**.
- TypeScript strict; avoid `any` (justify with a comment if unavoidable).
- JSDoc on every exported function/class/type; inline comments only for
  non-obvious logic.
- Cross-panel state lives in `state/selection.ts`; local UI state stays in the
  component.
- No `console.log` left in committed code.

## Tests

- `vole-core`: `cd vole-core && npm test` (Vitest)
- `vole-app`: `cd vole-app && npm test` (Jest)

Prioritise tests on **this fork's added code** — `ZipStore`, `loadMeasurements`,
gate logic in `selection.ts`, CSV export — not the inherited engine. Measure
coverage on those files.

## Releases

See `CHANGELOG.md`. Versions are git tags `vX.Y.Z` (SemVer); GitHub Releases
draft notes from merged PR titles.
