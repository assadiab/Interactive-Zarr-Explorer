import { Drawer, Empty, Radio, Tree } from "antd";
import type { DataNode } from "antd/es/tree";
import React, { useMemo } from "react";

import { buildCatalogTree, type CidCatalog, type CidCatalogNode } from "../shared/utils/cidCatalog";
import { select, useViewerState } from "../state/store";

type CidExplorerPanelProps = {
  catalog: CidCatalog;
};

/** Maps the catalog tree onto antd's `Tree` shape, keeping declaration order. */
function toTreeData(nodes: CidCatalogNode[]): DataNode[] {
  return nodes.map((node) => ({
    key: node.dataset.id,
    title: node.dataset.name,
    children: node.children.length > 0 ? toTreeData(node.children) : undefined,
  }));
}

/** Every id in the tree, so the explorer can start fully expanded. */
function allIds(nodes: CidCatalogNode[]): string[] {
  return nodes.flatMap((node) => [node.dataset.id, ...allIds(node.children)]);
}

/**
 * Browses the datasets a host application declared, and picks which ones are displayed.
 *
 * The tree shows lineage — a raw acquisition with the results derived from it — because
 * that is the shape the host declares through `parentId`. Checkboxes rather than plain
 * selection: displaying several datasets at once is the point (compare a raw with its
 * deconvolved version), and a checkbox says "shown" without the user having to discover a
 * modifier key.
 *
 * Checking a dataset only records it as open; fetching its archive and handing it to the
 * loader happens elsewhere, so this panel stays a view over the store.
 */
const CidExplorerPanel: React.FC<CidExplorerPanelProps> = ({ catalog }) => {
  const open = useViewerState(select("explorerOpen"));
  const openDatasetIds = useViewerState(select("openDatasetIds"));
  const displayMode = useViewerState(select("catalogDisplayMode"));

  const roots = useMemo(() => buildCatalogTree(catalog.datasets), [catalog.datasets]);
  const treeData = useMemo(() => toTreeData(roots), [roots]);
  const expandedByDefault = useMemo(() => allIds(roots), [roots]);

  const onCheck = (checkedKeys: React.Key[]): void => {
    const checked = checkedKeys.map(String);
    const { openDataset, closeDataset } = useViewerState.getState();
    // Diff against the store instead of replacing the list wholesale: `openDatasetIds` is
    // ordered by when each dataset was opened, and that order drives channel and scene
    // order. Overwriting it with antd's key order would silently reshuffle the view.
    for (const id of checked) {
      if (!openDatasetIds.includes(id)) {
        openDataset(id);
      }
    }
    for (const id of openDatasetIds) {
      if (!checked.includes(id)) {
        closeDataset(id);
      }
    }
  };

  return (
    <Drawer
      title="Datasets"
      placement="left"
      open={open}
      onClose={() => useViewerState.getState().setExplorerOpen(false)}
      width={340}
      mask={false}
    >
      {catalog.datasets.length === 0 ? (
        <Empty description="No related datasets" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <>
          <Radio.Group
            value={displayMode}
            onChange={(e) => useViewerState.getState().setCatalogDisplayMode(e.target.value)}
            optionType="button"
            buttonStyle="solid"
            style={{ marginBottom: "16px" }}
            options={[
              { label: "Side by side", value: "parallel" },
              { label: "Overlaid", value: "overlay" },
            ]}
          />
          <Tree
            checkable
            // Independent checkboxes: opening a raw acquisition must not drag in every
            // result derived from it, which is what antd does by default.
            checkStrictly
            selectable={false}
            defaultExpandedKeys={expandedByDefault}
            checkedKeys={openDatasetIds}
            onCheck={(checked) => onCheck(Array.isArray(checked) ? checked : checked.checked)}
            treeData={treeData}
          />
        </>
      )}
    </Drawer>
  );
};

export default CidExplorerPanel;
