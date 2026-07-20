import type { EditorDocument } from '../../features/editor/document/types';
import {
  SCENARIO_V3_ELEMENT_KINDS,
  type ScenarioImageElement,
} from '@sniptale/runtime-contracts/scenario/types/v3';
import {
  createScenarioEditedCaptureAsset,
  deleteScenarioEditedCaptureAsset,
} from '../../workflows/scenario-capture-edit/edits';
import { saveScenarioStepEditorDocumentRecord } from '../../composition/persistence/scenario/store/step-editor-documents';
import { ScenarioImageElementEditorHost } from '../workspace/embedded-editor-host/ScenarioImageElementEditorHost';
import type { useScenarioV3EditorState } from './state';

type ScenarioV3EditorState = ReturnType<typeof useScenarioV3EditorState>;

export function ScenarioImageElementEditorMount(props: {
  editor: ScenarioV3EditorState;
  elementId: string | null;
  onClose: () => void;
}) {
  const element = findImageElement(props.editor, props.elementId);
  if (!element) {
    return null;
  }

  const documentId = element.editDocumentId ?? element.id;
  return (
    <ScenarioImageElementEditorHost
      documentId={documentId}
      element={element}
      onClose={props.onClose}
      onApply={(payload) =>
        applyEditedImageElement({
          documentId,
          editor: props.editor,
          element,
          payload,
        })
      }
    />
  );
}

function findImageElement(editor: ScenarioV3EditorState, elementId: string | null) {
  const element = elementId
    ? editor.elements.find((candidate) => candidate.id === elementId)
    : null;
  return element?.kind === SCENARIO_V3_ELEMENT_KINDS.image ? element : null;
}

async function applyEditedImageElement(args: {
  documentId: string;
  editor: ScenarioV3EditorState;
  element: ScenarioImageElement;
  payload: { dataUrl: string; document: EditorDocument };
}) {
  const asset = await createScenarioEditedCaptureAsset({
    dataUrl: args.payload.dataUrl,
    galleryAssetId: args.element.assetRef.galleryAssetId,
    projectId: args.editor.project.id,
  });
  await saveImageElementEditorDocument({ ...args, assetId: asset.id });
  args.editor.elementActions.updateElement(args.element.id, {
    assetRef: { assetId: asset.id, galleryAssetId: asset.galleryAssetId },
    contentTransform: { scale: 1, x: 0, y: 0 },
    editDocumentId: args.documentId,
  });
}

async function saveImageElementEditorDocument(args: {
  assetId: string;
  documentId: string;
  editor: ScenarioV3EditorState;
  payload: { document: EditorDocument };
}) {
  try {
    await saveScenarioStepEditorDocumentRecord({
      document: args.payload.document,
      projectId: args.editor.project.id,
      stepId: args.documentId,
    });
  } catch (error: unknown) {
    await rollbackEditedImageAsset(args.assetId, error);
  }
}

async function rollbackEditedImageAsset(assetId: string, cause: unknown): Promise<never> {
  try {
    await deleteScenarioEditedCaptureAsset(assetId);
  } catch (rollbackError: unknown) {
    throw new AggregateError(
      [cause, rollbackError],
      'Failed to save image editor document and roll back edited asset'
    );
  }

  throw cause;
}
