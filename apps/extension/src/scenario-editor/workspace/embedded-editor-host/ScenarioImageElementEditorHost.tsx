import { useCallback } from 'react';
import type { EditorDocument } from '../../../features/editor/document/types';
import { translate } from '../../../platform/i18n';
import { blobToDataUrl } from '../../../platform/media-utils/data-url';
import {
  getScenarioAssetBlob,
  getScenarioStepEditorDocumentRecord,
} from '../../../composition/persistence/scenario/store/public';
import type { ScenarioImageElement } from '@sniptale/runtime-contracts/scenario/types/v3';
import {
  ScenarioEmbeddedEditorBody,
  ScenarioEmbeddedEditorModal,
} from './ScenarioEmbeddedEditorHost.view';
import { createScenarioEditorEmbedUrl } from './bootstrap';
import { useScenarioEmbeddedEditorRuntime } from './runtime';

async function createImageElementEditorUrl(args: {
  documentId: string;
  element: ScenarioImageElement;
}): Promise<string> {
  const [blob, documentEntry] = await Promise.all([
    getScenarioAssetBlob(args.element.assetRef.assetId),
    getScenarioStepEditorDocumentRecord(args.documentId),
  ]);
  const dataUrl =
    documentEntry?.document.sourceImageData ?? (blob ? await blobToDataUrl(blob) : null);

  if (!dataUrl) {
    throw new Error(translate('shared.runtime.readBlobFailed'));
  }

  return createScenarioEditorEmbedUrl({
    dataUrl,
    document: documentEntry?.document ?? null,
    title: args.element.name,
    url: args.element.captureContext?.page.url ?? '',
  });
}

export function ScenarioImageElementEditorHost(props: {
  documentId: string;
  element: ScenarioImageElement;
  onApply: (payload: { dataUrl: string; document: EditorDocument }) => Promise<void>;
  onClose: () => void;
}) {
  const createIframeUrl = useCallback(
    () =>
      createImageElementEditorUrl({
        documentId: props.documentId,
        element: props.element,
      }),
    [props.documentId, props.element]
  );
  const { assignIframeRef, state } = useScenarioEmbeddedEditorRuntime({
    createIframeUrl,
    onApply: props.onApply,
    onClose: props.onClose,
  });

  return (
    <ScenarioEmbeddedEditorModal
      labelledBy="scenario-image-element-editor-title"
      onClose={props.onClose}
      state={state}
      title={props.element.name}
    >
      <ScenarioEmbeddedEditorBody
        assignIframeRef={assignIframeRef}
        iframeTitle={props.element.name}
        iframeUrl={state.iframeUrl}
        loading={state.loading}
        error={state.error}
        onClose={props.onClose}
      />
    </ScenarioEmbeddedEditorModal>
  );
}
