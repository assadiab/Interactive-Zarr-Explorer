import { buildCatalogTree, catalogToScenes, resolveOpenDatasets, type CidDataset } from "../cidCatalog";

const ds = (id: string, parentId?: string): CidDataset => ({ id, name: id, url: `https://host/${id}`, parentId });

/** Flattens a tree into "id" / "parent>child" paths, so assertions read like the UI looks. */
const paths = (datasets: CidDataset[]): string[] => {
  const walk = (nodes: ReturnType<typeof buildCatalogTree>, prefix: string): string[] =>
    nodes.flatMap((node) => {
      const path = prefix ? `${prefix}>${node.dataset.id}` : node.dataset.id;
      return [path, ...walk(node.children, path)];
    });
  return walk(buildCatalogTree(datasets), "");
};

describe("buildCatalogTree", () => {
  it("nests derived datasets under the acquisition they came from", () => {
    expect(paths([ds("raw"), ds("decon", "raw"), ds("seg", "raw")])).toEqual([
      "raw",
      "raw>decon",
      "raw>seg",
    ]);
  });

  it("keeps declaration order at every level", () => {
    expect(paths([ds("b"), ds("a"), ds("b2", "b"), ds("b1", "b")])).toEqual(["b", "b>b2", "b>b1", "a"]);
  });

  it("nests deeper than two levels", () => {
    expect(paths([ds("raw"), ds("decon", "raw"), ds("seg", "decon")])).toEqual([
      "raw",
      "raw>decon",
      "raw>decon>seg",
    ]);
  });

  it("accepts a parent declared after its child", () => {
    expect(paths([ds("decon", "raw"), ds("raw")])).toEqual(["raw", "raw>decon"]);
  });

  it("surfaces a dataset whose parent was never declared, instead of dropping it", () => {
    expect(paths([ds("raw"), ds("orphan", "missing")])).toEqual(["raw", "orphan"]);
  });

  it("surfaces datasets caught in a parent cycle, and does not hang", () => {
    expect(paths([ds("a", "b"), ds("b", "a")])).toEqual(["a", "b"]);
  });

  it("surfaces a dataset that is its own parent", () => {
    expect(paths([ds("self", "self")])).toEqual(["self"]);
  });

  it("keeps the first of two datasets sharing an id", () => {
    const tree = buildCatalogTree([
      { id: "raw", name: "first", url: "https://host/first" },
      { id: "raw", name: "second", url: "https://host/second" },
    ]);
    expect(tree).toHaveLength(1);
    expect(tree[0].dataset.name).toBe("first");
  });

  it("returns nothing for an empty catalog", () => {
    expect(buildCatalogTree([])).toEqual([]);
  });
});

describe("resolveOpenDatasets", () => {
  const catalog = [ds("raw"), ds("decon", "raw"), ds("seg", "raw")];

  // Open order, not declaration order: it decides channel order when overlaid and scene
  // order when side by side.
  it("follows the order the datasets were opened", () => {
    expect(resolveOpenDatasets(catalog, ["seg", "raw"]).map((d) => d.id)).toEqual(["seg", "raw"]);
  });

  it("skips an id the catalog no longer declares", () => {
    expect(resolveOpenDatasets(catalog, ["raw", "gone"]).map((d) => d.id)).toEqual(["raw"]);
  });

  it("returns nothing when nothing is open", () => {
    expect(resolveOpenDatasets(catalog, [])).toEqual([]);
  });
});

describe("catalogToScenes", () => {
  const open = [ds("raw"), ds("decon")];

  it("makes one scene per dataset when side by side", () => {
    expect(catalogToScenes(open, "parallel")).toEqual(["https://host/raw", "https://host/decon"]);
  });

  it("merges every dataset into a single scene when overlaid", () => {
    expect(catalogToScenes(open, "overlay")).toEqual([["https://host/raw", "https://host/decon"]]);
  });

  it("keeps a lone overlaid dataset in its own scene", () => {
    expect(catalogToScenes([ds("raw")], "overlay")).toEqual([["https://host/raw"]]);
  });

  it("produces no scene when nothing is open, in either mode", () => {
    expect(catalogToScenes([], "parallel")).toEqual([]);
    expect(catalogToScenes([], "overlay")).toEqual([]);
  });
});
