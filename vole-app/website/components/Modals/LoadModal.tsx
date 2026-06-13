import { InboxOutlined, UploadOutlined } from "@ant-design/icons";
import { Button, Modal, Upload } from "antd";
import type { RcFile } from "antd/es/upload";
import React, { type ReactElement, useState } from "react";
import styled from "styled-components";

import type { AppDataProps } from "../../types";
import { FlexRow } from "../LandingPage/utils";

type LoadModalProps = {
  onLoad: (appProps: AppDataProps) => void;
};

const ModalContainer = styled.div``;

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

export default function LoadModal(props: LoadModalProps): ReactElement {
  const [showModal, setShowModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | undefined>(undefined);
  const [errorText, setErrorText] = useState<string>("");

  const openModal = (open: boolean): void => {
    if (open) {
      setSelectedFile(undefined);
      setErrorText("");
    }
    setShowModal(open);
  };

  const onClickLoad = (): void => {
    if (!selectedFile) {
      setErrorText("Please choose a local OME-Zarr .zip file.");
      return;
    }

    // A local OME-Zarr `.zip` is read in-place with lazy per-chunk access — no server,
    // no URL. The `File` is handed to the viewer through navigation state (see
    // LandingPage.onClickLoad), which is structured-cloneable, so the Blob survives.
    const appProps: AppDataProps = {
      imageUrl: "",
      imageDownloadHref: "",
      cellId: "1",
      parentImageUrl: "",
      parentImageDownloadHref: "",
      zipData: selectedFile,
      viewerChannelSettings: DEFAULT_CHANNEL_SETTINGS,
    };
    props.onLoad(appProps);
    setShowModal(false);
  };

  return (
    <ModalContainer>
      <Button type="link" onClick={() => openModal(true)}>
        <UploadOutlined />
        Load
      </Button>
      <Modal
        open={showModal}
        title={"Load a local OME-Zarr"}
        onCancel={() => setShowModal(false)}
        footer={
          <Button type="default" onClick={() => setShowModal(false)}>
            Cancel
          </Button>
        }
        destroyOnClose={true}
      >
        <p style={{ fontSize: "16px" }}>
          Select a local OME-Zarr packaged as a <code>.zip</code> file. It is read directly in your browser — no upload
          to a server.
        </p>
        <p style={{ fontSize: "12px" }}>
          <i>Tip: package the {".ome.zarr"} folder with no compression (STORE mode) for the fastest reads.</i>
        </p>
        <Upload.Dragger
          accept=".zip,application/zip"
          maxCount={1}
          beforeUpload={(file: RcFile) => {
            setSelectedFile(file as File);
            setErrorText("");
            // Returning false prevents antd from uploading the file anywhere; we only need the local handle.
            return false;
          }}
          onRemove={() => setSelectedFile(undefined)}
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">Click or drag a .zip file here</p>
        </Upload.Dragger>
        <FlexRow $gap={6} style={{ marginTop: 16, justifyContent: "flex-end" }}>
          <Button type="primary" onClick={onClickLoad} disabled={!selectedFile}>
            Load
          </Button>
        </FlexRow>
        {errorText !== "" && <p style={{ color: "var(--color-text-error)" }}>{errorText}</p>}
      </Modal>
    </ModalContainer>
  );
}
