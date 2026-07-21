import { NodeIndexOutlined, TagsOutlined } from "@ant-design/icons";
import { Button, Tooltip } from "antd";
import React from "react";

import { select, useViewerState } from "../state/store";
import AnnotationPanel from "./AnnotationPanel";
import ViewerIcon from "./shared/ViewerIcon";
import TracksPanel from "./TracksPanel";

import "./ControlPanel/styles.css";

/**
 * Secondary control panel docked on the right of the viewer, so analysis tabs
 * (e.g. Annotation) stay visible next to the left panel's scatter. Mirrors the
 * left `ControlPanel`'s rail + content layout; more tabs can be added here.
 */

const enum RightTab {
  Annotation,
  Tracks,
}

const RightTabNames = {
  [RightTab.Annotation]: "Annotation",
  [RightTab.Tracks]: "Tracks",
};

type RightPanelProps = {
  collapsed: boolean;
  setCollapsed: (value: boolean) => void;
};

export default function RightPanel(props: RightPanelProps): React.ReactElement {
  // Each tab only appears once its data is loaded: measurements (Annotation) and tracking (Tracks) arrive from
  // different sources, so either can be present alone.
  const hasMeasurements = useViewerState((s) => s.measurements !== null);
  const hasTracking = useViewerState(select("tracking")) !== null;

  const [tab, setTabState] = React.useState(RightTab.Annotation);
  const setTab = (newTab: RightTab): void => {
    setTabState(newTab);
    props.setCollapsed(false);
  };

  // Fall back to whichever tab actually has data, so we never show an empty panel.
  const activeTab =
    tab === RightTab.Annotation && !hasMeasurements
      ? RightTab.Tracks
      : tab === RightTab.Tracks && !hasTracking
        ? RightTab.Annotation
        : tab;

  const renderTab = (thisTab: RightTab, icon: React.ReactNode): React.ReactNode => (
    <Tooltip title={RightTabNames[thisTab]} placement="left">
      <Button
        aria-label={RightTabNames[thisTab]}
        className={activeTab === thisTab ? "ant-btn-icon-only btn-tabactive" : "ant-btn-icon-only"}
        onClick={() => setTab(thisTab)}
      >
        {icon}
      </Button>
    </Tooltip>
  );

  const collapseLabel = props.collapsed ? "Show panel" : "Hide panel";

  return (
    <div className="control-panel-col-container">
      <div className="control-panel-tab-col" style={{ flex: "0 0 50px" }}>
        <Tooltip title={collapseLabel} placement="left">
          <Button
            aria-label={collapseLabel}
            className={"ant-btn-icon-only btn-collapse" + (props.collapsed ? " btn-collapse-collapsed" : "")}
            onClick={() => props.setCollapsed(!props.collapsed)}
          >
            <ViewerIcon type="closePanel" />
          </Button>
        </Tooltip>

        <div className="tab-divider" />

        {hasMeasurements && renderTab(RightTab.Annotation, <TagsOutlined />)}
        {hasTracking && renderTab(RightTab.Tracks, <NodeIndexOutlined />)}
      </div>
      <div className="control-panel-col" style={{ flex: "0 0 360px" }}>
        <h2 className="control-panel-title">{RightTabNames[activeTab]}</h2>
        <div className="control-panel-content">
          {activeTab === RightTab.Annotation && <AnnotationPanel />}
          {activeTab === RightTab.Tracks && <TracksPanel />}
        </div>
      </div>
    </div>
  );
}
