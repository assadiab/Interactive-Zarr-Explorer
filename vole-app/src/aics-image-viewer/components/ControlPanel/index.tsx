import { DotChartOutlined, HeatMapOutlined, NodeIndexOutlined, TagsOutlined } from "@ant-design/icons";
import { Button, Checkbox, Collapse, type CollapseProps, Dropdown, Flex, type MenuProps, Tooltip } from "antd";
import React from "react";

import { PRESET_COLOR_MAP } from "../../shared/constants";
import type { MetadataRecord } from "../../shared/types";
import { select, useViewerState } from "../../state/store";

import AnnotationPanel from "../AnnotationPanel";
import ChannelsWidget, { type ChannelsWidgetProps } from "../ChannelsWidget";
import CustomizeWidget, { type CustomizeWidgetProps } from "../CustomizeWidget";
import GlobalVolumeControls, { type GlobalVolumeControlsProps } from "../GlobalVolumeControls";
import CorrelationPanel from "../CorrelationPanel";
import MetadataViewer from "../MetadataViewer";
import ScatterPanel from "../ScatterPanel";
import ViewerIcon from "../shared/ViewerIcon";
import TracksPanel from "../TracksPanel";

import "./styles.css";

/**
 * What antd hands `Menu`'s `onClick`. Derived from antd's own props rather than imported from
 * the underlying rc package: antd 6 renamed `rc-menu` to `@rc-component/menu`, which silently
 * broke the old `rc-menu/lib/interface` import. Deriving it survives the next rename too.
 */
type MenuInfo = Parameters<NonNullable<MenuProps["onClick"]>>[0];

interface ControlPanelProps extends ChannelsWidgetProps, GlobalVolumeControlsProps, CustomizeWidgetProps {
  hasImage: boolean;
  visibleControls: GlobalVolumeControlsProps["visibleControls"] &
    CustomizeWidgetProps["visibleControls"] & {
      colorPresetsDropdown: boolean;
      metadataViewer: boolean;
    };
  metadata: MetadataRecord;
  collapsed: boolean;
  setCollapsed: (value: boolean) => void;
}

const enum ControlTab {
  Channels,
  Advanced,
  Metadata,
  Features,
  Correlation,
  Annotation,
  Tracks,
}

const ControlTabNames = {
  [ControlTab.Channels]: "Channel settings",
  [ControlTab.Advanced]: "Advanced settings",
  [ControlTab.Metadata]: "Metadata",
  [ControlTab.Features]: "Features",
  [ControlTab.Correlation]: "Correlation",
  [ControlTab.Annotation]: "Annotation",
  [ControlTab.Tracks]: "Tracks",
};

function ControlPanel(props: ControlPanelProps): React.ReactElement {
  const [tab, _setTab] = React.useState(ControlTab.Channels);
  const setTab = (newTab: ControlTab): void => {
    _setTab(newTab);
    props.setCollapsed(false);
  };
  const resetToDefaultViewerState = useViewerState(select("resetToDefaultViewerState"));
  const singleChannelMode = useViewerState(select("singleChannelMode"));
  const changeViewerSetting = useViewerState(select("changeViewerSetting"));
  // Only offer the Features tab once a per-object measurement table has loaded.
  const hasMeasurements = useViewerState((state) => state.measurements !== null);
  // Tracking comes from its own CSV, so it can be present without measurements and vice versa.
  const hasTracking = useViewerState((state) => state.tracking !== null);

  const containerRef = React.useRef<HTMLDivElement>(null);
  const getDropdownContainer = (): HTMLElement => containerRef.current ?? document.body;

  const { viewerChannelSettings, visibleControls, hasImage } = props;

  // TODO key is a number, but MenuInfo assumes keys will always be strings
  //   if future versions of antd make this type more permissive, remove ugly double-cast
  const makeTurnOnPresetFn = ({ key }: MenuInfo): void =>
    props.onApplyColorPresets(PRESET_COLOR_MAP[key as unknown as number].colors);

  const renderChannelSettingsHeader = (): React.ReactNode => {
    const dropDownMenuProps: MenuProps = {
      items: PRESET_COLOR_MAP.map((preset, index) => {
        return { key: index, label: preset.name };
      }),
      onClick: makeTurnOnPresetFn,
    };

    const singleChannelTitle = singleChannelMode ? (
      "Turn off single channel mode"
    ) : (
      <>
        <div>Turn on single channel mode</div>
        <div>Use arrow keys to navigate</div>
      </>
    );

    return (
      <div className="channel-settings-header">
        <Dropdown trigger={["click"]} menu={dropDownMenuProps} getPopupContainer={getDropdownContainer}>
          <Button>
            <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: "4px" }}>
              Apply palette
              <ViewerIcon type="dropdownArrow" style={{ fontSize: "14px" }} />
            </div>
          </Button>
        </Dropdown>

        <div style={{ alignSelf: "end", width: "40%" }}>
          <Tooltip title={singleChannelTitle}>
            <Checkbox
              name="Single channel mode"
              checked={singleChannelMode}
              onChange={({ target }) => changeViewerSetting("singleChannelMode", target.checked)}
            >
              Single channel mode
            </Checkbox>
          </Tooltip>
        </div>
      </div>
    );
  };

  const renderTab = (thisTab: ControlTab, icon: React.ReactNode): React.ReactNode => (
    <Tooltip title={ControlTabNames[thisTab]} placement="right">
      <Button
        aria-label={ControlTabNames[thisTab]}
        className={activeTab === thisTab ? "ant-btn-icon-only btn-tabactive" : "ant-btn-icon-only"}
        onClick={() => setTab(thisTab)}
        icon={typeof icon === "string" ? icon : undefined}
      >
        {typeof icon === "object" && icon}
      </Button>
    </Tooltip>
  );

  const renderAdvancedSettings = (): React.ReactNode => {
    const items: CollapseProps["items"] = [
      {
        key: 0,
        label: "Rendering adjustments",
        children: (
          <GlobalVolumeControls
            imageName={props.imageName}
            pixelSize={props.pixelSize}
            visibleControls={visibleControls}
          />
        ),
      },
    ];
    const showCustomize = visibleControls.backgroundColorPicker || visibleControls.boundingBoxColorPicker;

    if (showCustomize) {
      items.push({
        key: 1,
        label: "Customize",
        children: <CustomizeWidget visibleControls={props.visibleControls} />,
      });
    }

    return (
      <Flex gap={10} vertical>
        <Collapse bordered={false} defaultActiveKey={showCustomize ? [0, 1] : 0} items={items} />
        <div style={{ margin: "0 10px", width: "fit-content" }}>
          <Tooltip
            trigger={["hover", "focus"]}
            placement="right"
            title="Clears ALL rendering settings and channel configuration to the default viewer state.
            This will replace any edits to channel settings, color presets, and rendering adjustments."
          >
            <Button onClick={resetToDefaultViewerState}>Clear all settings</Button>
          </Tooltip>
        </div>
      </Flex>
    );
  };

  // A tab whose data went away (a new image with no table, or no tracking CSV) loses its button, so fall back
  // to Channels rather than leaving the panel showing an empty tab with no way back.
  const needsMeasurements =
    tab === ControlTab.Features || tab === ControlTab.Correlation || tab === ControlTab.Annotation;
  const tabIsAvailable = needsMeasurements ? hasMeasurements : tab !== ControlTab.Tracks || hasTracking;
  const activeTab = tabIsAvailable ? tab : ControlTab.Channels;

  const collapseLabel = props.collapsed ? "Show panel" : "Hide panel";

  return (
    <div className="control-panel-col-container" ref={containerRef}>
      <div className="control-panel-tab-col" style={{ flex: "0 0 50px" }}>
        <Tooltip title={collapseLabel} placement="right">
          <Button
            aria-label={collapseLabel}
            className={"ant-btn-icon-only btn-collapse" + (props.collapsed ? " btn-collapse-collapsed" : "")}
            onClick={() => props.setCollapsed(!props.collapsed)}
          >
            <ViewerIcon type="closePanel" />
          </Button>
        </Tooltip>

        <div className="tab-divider" />

        {renderTab(ControlTab.Channels, <ViewerIcon type="channels" />)}
        {renderTab(ControlTab.Advanced, <ViewerIcon type="preferences" />)}
        {props.visibleControls.metadataViewer && renderTab(ControlTab.Metadata, <ViewerIcon type="metadata" />)}
        {hasMeasurements && renderTab(ControlTab.Features, <DotChartOutlined />)}
        {hasMeasurements && renderTab(ControlTab.Correlation, <HeatMapOutlined />)}
        {hasMeasurements && renderTab(ControlTab.Annotation, <TagsOutlined />)}
        {hasTracking && renderTab(ControlTab.Tracks, <NodeIndexOutlined />)}
      </div>
      <div className="control-panel-col" style={{ flex: "0 0 450px" }}>
        <h2 className="control-panel-title">{ControlTabNames[activeTab]}</h2>
        {visibleControls.colorPresetsDropdown && activeTab === ControlTab.Channels && renderChannelSettingsHeader()}
        {hasImage && (
          <div className="control-panel-content">
            {activeTab === ControlTab.Channels && (
              <ChannelsWidget
                channelDataChannels={props.channelDataChannels}
                channelGroupedByType={props.channelGroupedByType}
                saveIsosurface={props.saveIsosurface}
                onColorChangeComplete={props.onColorChangeComplete}
                onApplyColorPresets={props.onApplyColorPresets}
                filterFunc={props.filterFunc}
                viewerChannelSettings={viewerChannelSettings}
              />
            )}
            {activeTab === ControlTab.Advanced && renderAdvancedSettings()}
            {activeTab === ControlTab.Metadata && <MetadataViewer metadata={props.metadata} />}
          </div>
        )}
        {/* Features (scatter) and Correlation are independent of the loaded image,
            so they render outside the hasImage gate. */}
        {activeTab === ControlTab.Features && (
          <div className="control-panel-content">
            <ScatterPanel />
          </div>
        )}
        {activeTab === ControlTab.Correlation && (
          <div className="control-panel-content">
            <CorrelationPanel />
          </div>
        )}
        {activeTab === ControlTab.Annotation && (
          <div className="control-panel-content">
            <AnnotationPanel />
          </div>
        )}
        {activeTab === ControlTab.Tracks && (
          <div className="control-panel-content">
            <TracksPanel />
          </div>
        )}
      </div>
    </div>
  );
}

export default ControlPanel;
