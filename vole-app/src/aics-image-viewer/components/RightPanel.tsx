import { TagsOutlined } from "@ant-design/icons";
import { Button, Tooltip } from "antd";
import React from "react";

import AnnotationPanel from "./AnnotationPanel";
import ViewerIcon from "./shared/ViewerIcon";

import "./ControlPanel/styles.css";

/**
 * Secondary control panel docked on the right of the viewer, so analysis tabs
 * (e.g. Annotation) stay visible next to the left panel's scatter. Mirrors the
 * left `ControlPanel`'s rail + content layout; more tabs can be added here.
 */

const enum RightTab {
  Annotation,
}

const RightTabNames = {
  [RightTab.Annotation]: "Annotation",
};

type RightPanelProps = {
  collapsed: boolean;
  setCollapsed: (value: boolean) => void;
};

export default function RightPanel(props: RightPanelProps): React.ReactElement {
  const [tab, setTabState] = React.useState(RightTab.Annotation);
  const setTab = (newTab: RightTab): void => {
    setTabState(newTab);
    props.setCollapsed(false);
  };

  const renderTab = (thisTab: RightTab, icon: React.ReactNode): React.ReactNode => (
    <Tooltip title={RightTabNames[thisTab]} placement="left">
      <Button
        aria-label={RightTabNames[thisTab]}
        className={tab === thisTab ? "ant-btn-icon-only btn-tabactive" : "ant-btn-icon-only"}
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

        {renderTab(RightTab.Annotation, <TagsOutlined />)}
      </div>
      <div className="control-panel-col" style={{ flex: "0 0 360px" }}>
        <h2 className="control-panel-title">{RightTabNames[tab]}</h2>
        <div className="control-panel-content">{tab === RightTab.Annotation && <AnnotationPanel />}</div>
      </div>
    </div>
  );
}
