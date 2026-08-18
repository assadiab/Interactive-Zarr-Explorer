/**
 * The catalog a host application declares so the viewer can offer an explorer of related
 * datasets, without ever reaching into the host's database.
 *
 * The host knows the lineage (which zarr is the raw acquisition, which ones were derived
 * from it); the viewer cannot possibly derive it. A pushed `Blob` has no path and no parent
 * folder, and OME-Zarr carries no provenance field — so lineage has to be declared, not
 * guessed from file names.
 */

/**
 * How the open datasets share the view. Mirrors what the viewer already does with several
 * sources: `overlay` merges their channels into ONE volume (only possible when the volumes
 * have the same dimensions), `parallel` makes each one a switchable scene.
 */
export type CatalogDisplayMode = "overlay" | "parallel";

/** One dataset the host declares. */
export type CidDataset = {
  /** Host-side identifier, unique within the catalog. */
  id: string;
  /** Label shown in the explorer, and used as the scene name once displayed. */
  name: string;
  /**
   * Where the viewer reads this dataset's OME-Zarr from.
   *
   * MUST be absolute. The loader runs in a web worker, where a relative URL resolves
   * against the worker script rather than the page — build it from `window.location.origin`.
   *
   * The host is free to serve a plain directory or to read entries out of an archive on its
   * side; the viewer only sees a zarr group over HTTP, and fetches the chunks it needs.
   */
  url: string;
  /** Lineage: the dataset this one was derived from. Absent for a raw acquisition. */
  parentId?: string;
  /** Tracking CSV text belonging to THIS dataset (tracks are per-zarr, not per-viewer). */
  tracksCsv?: string;
};

/** What the host passes to the viewer to enable the explorer. */
export type CidCatalog = {
  datasets: CidDataset[];
  /**
   * Dataset to open on mount — typically the acquisition the host was showing anyway.
   *
   * Declaring it here rather than pushing it through `imageUrl` keeps ONE source of data
   * while a catalog is in play: the starting image is a dataset like any other, so it
   * appears in the tree and can be closed. The other entry points (`imageUrl`, `zipData`,
   * `rawData`) keep their meaning, and a catalog never touches them.
   */
  initialOpenId?: string;
};

/**
 * Resolves open ids to datasets, **in the order they were opened** — that order decides
 * channel order when overlaid and scene order when side by side. Ids with no matching
 * dataset are skipped: a host can drop an entry from its catalog while it is open.
 */
export function resolveOpenDatasets(datasets: CidDataset[], openIds: string[]): CidDataset[] {
  const byId = new Map(datasets.map((dataset) => [dataset.id, dataset]));
  return openIds.map((id) => byId.get(id)).filter((dataset): dataset is CidDataset => dataset !== undefined);
}

/**
 * Turns the open datasets into the scene list the loader consumes, reusing the semantics
 * the viewer already has for several sources: one entry per scene, and an array within an
 * entry means "merge these sources' channels into a single volume".
 */
export function catalogToScenes(openDatasets: CidDataset[], mode: CatalogDisplayMode): (string | string[])[] {
  const urls = openDatasets.map((dataset) => dataset.url);
  if (urls.length === 0) {
    return [];
  }
  return mode === "overlay" ? [urls] : urls;
}

/** A dataset placed in the tree the explorer renders. */
export type CidCatalogNode = {
  dataset: CidDataset;
  children: CidCatalogNode[];
};

/**
 * Arranges declared datasets into the tree the explorer renders, preserving declaration
 * order at every level.
 *
 * Nothing the host declared is ever dropped: a dataset whose `parentId` names something
 * absent, or which sits in a parent cycle, surfaces as a root rather than disappearing.
 * Losing a dataset silently would be worse than showing it at the wrong depth — the user
 * would have no way to tell it was there. Duplicate ids keep the first declaration, so the
 * result stays deterministic.
 */
export function buildCatalogTree(datasets: CidDataset[]): CidCatalogNode[] {
  const nodes = new Map<string, CidCatalogNode>();
  const order: string[] = [];

  for (const dataset of datasets) {
    if (nodes.has(dataset.id)) {
      continue; // duplicate id: first declaration wins
    }
    nodes.set(dataset.id, { dataset, children: [] });
    order.push(dataset.id);
  }

  /** Walks up `parentId` links; false as soon as the chain leaves the map or loops. */
  const reachesARoot = (id: string): boolean => {
    const seen = new Set<string>([id]);
    let current = nodes.get(id)!.dataset.parentId;
    while (current !== undefined) {
      if (seen.has(current)) {
        return false; // cycle
      }
      const parent = nodes.get(current);
      if (parent === undefined) {
        return false; // dangling parentId
      }
      seen.add(current);
      current = parent.dataset.parentId;
    }
    return true;
  };

  const roots: CidCatalogNode[] = [];
  for (const id of order) {
    const node = nodes.get(id)!;
    const parentId = node.dataset.parentId;
    const parent = parentId === undefined ? undefined : nodes.get(parentId);

    if (parent !== undefined && parentId !== id && reachesARoot(id)) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}
