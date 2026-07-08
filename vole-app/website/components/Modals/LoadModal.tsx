import { InboxOutlined, LinkOutlined, UploadOutlined } from "@ant-design/icons";
import { AutoComplete, Button, Modal, Segmented, Upload } from "antd";
import type { RcFile, UploadFile } from "antd/es/upload";
import Fuse from "fuse.js";
import React, { type ReactElement, useMemo, useRef, useState } from "react";
import styled from "styled-components";

import type { AppDataProps } from "../../types";
import { type RecentDataUrl, useRecentDataUrls } from "../../utils/react_utils";
import { isValidUrl } from "../../utils/urls";
import { FlexRow } from "../LandingPage/utils";
import MiddleTruncatedText from "../MiddleTruncatedText";

const MAX_RECENT_URLS_TO_DISPLAY = 20;

/** Which data source this Load button handles. */
type LoadMode = "url" | "zip";

type LoadModalProps = {
  /** "url" loads a remote OME-Zarr/OME-TIFF by link; "zip" loads a local OME-Zarr `.zip`. */
  mode: LoadMode;
  onLoad: (appProps: AppDataProps) => void;
};

const ModalContainer = styled.div`
  display: inline-block;

  // Size the autocomplete dropdown to the input area on narrow screens.
  .ant-select-dropdown {
    width: 100% !important;
    max-width: calc(max(50vw, min(400px, 100vw - 100px)));
  }
`;

/**
 * Enable the first three channels by default. OME-Zarr exported without `omero`
 * metadata (e.g. ilastik) has no per-channel defaults, so without this the viewer
 * would be asked to load zero channels and render nothing.
 */
const DEFAULT_CHANNEL_SETTINGS = {
  groups: [
    {
      name: "Channels",
      channels: [
        { match: [0, 1, 2], enabled: true },
        { match: "(.+)", enabled: false },
      ],
    },
  ],
};

function baseAppProps(): AppDataProps {
  return {
    imageUrl: "",
    imageDownloadHref: "",
    cellId: "1",
    parentImageUrl: "",
    parentImageDownloadHref: "",
    viewerChannelSettings: DEFAULT_CHANNEL_SETTINGS,
  };
}

export default function LoadModal(props: LoadModalProps): ReactElement {
  const isZip = props.mode === "zip";

  const [showModal, setShowModalState] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [zipFiles, setZipFiles] = useState<RcFile[]>([]);
  // true = overlay all zips' channels into one volume (","); false = one scene per zip ("+").
  const [overlay, setOverlay] = useState(true);
  const [errorText, setErrorText] = useState<string>("");

  const [recentDataUrls, addRecentDataUrl] = useRecentDataUrls();
  const modalContainerRef = useRef<HTMLDivElement>(null);

  const setShowModal = (show: boolean): void => {
    if (show) {
      setUrlInput("");
      setZipFiles([]);
      setOverlay(true);
      setErrorText("");
    }
    setShowModalState(show);
  };

  const onClickLoadUrl = (): void => {
    // Note: S3 URIs, GCS URIs, and Vast file paths are handled by vole-core.
    const trimmed = urlInput.trim();
    if (!isValidUrl(trimmed)) {
      setErrorText("Please enter a valid URL, starting with https://, s3://, or gs://.");
      return;
    }
    props.onLoad({ ...baseAppProps(), imageUrl: trimmed, imageDownloadHref: trimmed });
    addRecentDataUrl({ url: trimmed, label: trimmed });
    setShowModal(false);
  };

  const onClickLoadZip = (): void => {
    if (zipFiles.length === 0) {
      setErrorText("Please choose at least one local OME-Zarr .zip file.");
      return;
    }
    // The File(s) reach the viewer through React Router navigation state
    // (see LandingPage.onClickLoad), which is structured-cloneable, so Blobs survive.
    // One file => a single volume; several => overlay their channels (one scene) or
    // load one scene per file, depending on the chosen mode.
    const files = zipFiles as File[];
    const zipData = files.length === 1 ? files[0] : overlay ? files : { scenes: files };
    props.onLoad({ ...baseAppProps(), zipData });
    setShowModal(false);
  };

  // Fuzzy search over recently loaded URLs (url mode only).
  const fuse = useMemo(
    () =>
      new Fuse(recentDataUrls, {
        keys: ["label"],
        isCaseSensitive: false,
        shouldSort: true,
        ignoreLocation: true,
        findAllMatches: true,
      }),
    [recentDataUrls]
  );
  const autoCompleteOptions: { label: React.ReactNode; value: string }[] = useMemo(() => {
    let items: RecentDataUrl[] = [];
    if (urlInput === "") {
      items = recentDataUrls.slice(0, MAX_RECENT_URLS_TO_DISPLAY);
    } else {
      items = fuse
        .search(urlInput)
        .slice(0, MAX_RECENT_URLS_TO_DISPLAY)
        .map((option) => option.item);
    }
    return items.map((item) => ({ label: <MiddleTruncatedText text={item.label} />, value: item.url }));
  }, [urlInput, fuse, recentDataUrls]);

  const getAutoCompletePopupContainer = modalContainerRef.current ? () => modalContainerRef.current! : undefined;

  return (
    <ModalContainer ref={modalContainerRef}>
      <Button type="link" onClick={() => setShowModal(true)}>
        {isZip ? <UploadOutlined /> : <LinkOutlined />}
        {isZip ? "Load .zip" : "Load URL"}
      </Button>
      <Modal
        open={showModal}
        title={isZip ? "Load a local OME-Zarr" : "Load from URL"}
        onCancel={() => setShowModal(false)}
        getContainer={modalContainerRef.current || undefined}
        footer={
          <Button type="default" onClick={() => setShowModal(false)}>
            Cancel
          </Button>
        }
        destroyOnClose={true}
      >
        {isZip ? (
          <>
            <p style={{ fontSize: "16px" }}>
              Select one or more local OME-Zarr <code>.zip</code> files. They are read directly in your browser — no
              upload to a server.
            </p>
            <p style={{ fontSize: "12px" }}>
              <i>Tip: package the {".ome.zarr"} folder with no compression (STORE mode) for the fastest reads.</i>
            </p>
            <Upload.Dragger
              accept=".zip,application/zip"
              multiple={true}
              beforeUpload={(file: RcFile) => {
                setZipFiles((prev) => [...prev, file]);
                setErrorText("");
                return false; // keep the files local; don't upload anywhere
              }}
              onRemove={(file) => setZipFiles((prev) => prev.filter((f) => f.uid !== file.uid))}
              fileList={zipFiles as unknown as UploadFile[]}
            >
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <p className="ant-upload-text">Click or drag one or more .zip files here</p>
            </Upload.Dragger>
            {zipFiles.length > 1 && (
              <div style={{ marginTop: 12 }}>
                <Segmented
                  options={[
                    { label: "Overlay channels", value: "overlay" },
                    { label: "Separate scenes", value: "scenes" },
                  ]}
                  value={overlay ? "overlay" : "scenes"}
                  onChange={(v) => setOverlay(v === "overlay")}
                />
                <p style={{ fontSize: "12px", marginTop: 6 }}>
                  <i>
                    {overlay
                      ? "Overlay: merge every zip's channels into a single volume (they must share the same pixel dimensions)."
                      : "Scenes: load each zip as its own volume, switchable in the viewer."}
                  </i>
                </p>
              </div>
            )}
            <FlexRow $gap={6} style={{ marginTop: 16, justifyContent: "flex-end" }}>
              <Button type="primary" onClick={onClickLoadZip} disabled={zipFiles.length === 0}>
                Load
              </Button>
            </FlexRow>
          </>
        ) : (
          <>
            <p style={{ fontSize: "16px" }}>Provide the URL to load your OME-Zarr or OME-TIFF* data.</p>
            <p style={{ fontSize: "12px" }}>
              <i>*Note: this tool is intended for OME-Zarr use. Large {"(> 100 MB)"} OME-TIFF files are not supported.</i>
            </p>
            <FlexRow $gap={6}>
              <AutoComplete
                value={urlInput}
                onChange={(value) => setUrlInput(value)}
                onSelect={setUrlInput}
                style={{ width: "100%" }}
                allowClear={true}
                options={autoCompleteOptions}
                getPopupContainer={getAutoCompletePopupContainer}
                placeholder="Enter a URL..."
                autoFocus={true}
              ></AutoComplete>
              <Button type="primary" onClick={onClickLoadUrl}>
                Load
              </Button>
            </FlexRow>
          </>
        )}
        {errorText !== "" && <p style={{ color: "var(--color-text-error)" }}>{errorText}</p>}
      </Modal>
    </ModalContainer>
  );
}
