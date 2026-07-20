import { useCallback } from 'react';
import type { EditorDocument } from '../../../features/editor/document/types';
import { translate } from '../../../platform/i18n';
import { blobToDataUrl } from '../../../platform/media-utils/data-url';
import { syncScenarioCaptureEditorDocumentOverlays } from '../../../features/scenario/capture-step/editor-document';
import {
  getScenarioAssetBlob,
  getScenarioStepEditorDocumentRecord,
} from '../../../composition/persistence/scenario/store/public';
import type { ScenarioCaptureStep } from '../../../features/scenario/contracts/types/project';
import {
  ScenarioEmbeddedEditorBody,
  ScenarioEmbeddedEditorModal,
} from './ScenarioEmbeddedEditorHost.view';
import { createScenarioEditorEmbedUrl } from './bootstrap';
import {
  type ScenarioEmbeddedEditorApplyPayload,
  useScenarioEmbeddedEditorRuntime,
} from './runtime';

function getEmbeddedEditorPageMeta(step: ScenarioCaptureStep) {
  return {
    pageTitle: step.page.title ?? step.title ?? '',
    pageUrl: step.page.url ?? '',
  };
}

async function createScenarioEmbeddedEditorUrl(args: {
  assetId: string;
  overlays: ScenarioCaptureStep['overlays'];
  pageTitle: string;
  pageUrl: string;
  stepId: string;
}): Promise<string> {
  const [blob, stepDocumentEntry] = await Promise.all([
    getScenarioAssetBlob(args.assetId),
    getScenarioStepEditorDocumentRecord(args.stepId),
  ]);
  const syncedDocument = stepDocumentEntry?.document
    ? syncScenarioCaptureEditorDocumentOverlays(stepDocumentEntry.document, args.overlays)
    : null;
  const bootstrapDataUrl =
    syncedDocument?.sourceImageData ?? (blob ? await blobToDataUrl(blob) : null);

  if (!bootstrapDataUrl) {
    throw new Error(translate('shared.runtime.readBlobFailed'));
  }

  return createScenarioEditorEmbedUrl({
    dataUrl: bootstrapDataUrl,
    document: syncedDocument,
    title: args.pageTitle,
    url: args.pageUrl,
  });
}

export function ScenarioEmbeddedEditorHost(props: {
  onApplyEditedCapture: (
    stepId: string,
    payload: { dataUrl: string; document: EditorDocument }
  ) => Promise<void>;
  onClose: () => void;
  step: ScenarioCaptureStep;
}) {
  const { onApplyEditedCapture, onClose, step } = props;
  const createIframeUrl = useCallback(() => {
    const { pageTitle, pageUrl } = getEmbeddedEditorPageMeta(step);
    return createScenarioEmbeddedEditorUrl({
      assetId: step.assetId,
      overlays: step.overlays,
      pageTitle,
      pageUrl,
      stepId: step.id,
    });
  }, [step]);

  const onApply = useCallback(
    (payload: ScenarioEmbeddedEditorApplyPayload) => onApplyEditedCapture(step.id, payload),
    [onApplyEditedCapture, step.id]
  );
  const { assignIframeRef, state } = useScenarioEmbeddedEditorRuntime({
    createIframeUrl,
    onApply,
    onClose,
  });
  const embeddedEditorTitle = step.title || translate('scenario.editor.untitledStep');

  return (
    <ScenarioEmbeddedEditorModal
      labelledBy="scenario-embedded-editor-title"
      onClose={onClose}
      state={state}
      title={embeddedEditorTitle}
    >
      <ScenarioEmbeddedEditorBody
        assignIframeRef={assignIframeRef}
        iframeTitle={embeddedEditorTitle}
        iframeUrl={state.iframeUrl}
        loading={state.loading}
        error={state.error}
        onClose={onClose}
      />
    </ScenarioEmbeddedEditorModal>
  );
}
