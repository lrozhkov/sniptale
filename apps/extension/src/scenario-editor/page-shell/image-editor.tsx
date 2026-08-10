import type { EditorDocument } from '../../features/editor/document/types';
import {
  SCENARIO_V3_ELEMENT_KINDS,
  type ScenarioImageElement,
} from '@sniptale/runtime-contracts/scenario/types/v3';
import { prepareScenarioEditedCaptureAsset } from '../../workflows/scenario-capture-edit/edits';
import { prepareScenarioStepEditorDocumentRecord } from '../../composition/persistence/scenario/store/step-editor-documents';
import { ScenarioImageElementEditorHost } from '../workspace/embedded-editor-host/ScenarioImageElementEditorHost';
import type { useScenarioV3EditorState } from './state';
import { updateElementInSession } from './commands';

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
  const prepared = await prepareScenarioEditedCaptureAsset({
    dataUrl: args.payload.dataUrl,
    galleryAssetId: args.element.assetRef.galleryAssetId,
    projectId: args.editor.project.id,
  });
  const editorDocument = prepareScenarioStepEditorDocumentRecord({
    document: args.payload.document,
    projectId: args.editor.project.id,
    stepId: args.documentId,
  });
  await args.editor.projectActions.commitAggregateMutation(
    (session) =>
      updateElementInSession(session, args.element.id, {
        assetRef: {
          assetId: prepared.asset.id,
          galleryAssetId: prepared.asset.galleryAssetId,
        },
        contentTransform: { scale: 1, x: 0, y: 0 },
        editDocumentId: args.documentId,
      }),
    { assetPuts: [prepared.entry], editorDocumentPuts: [editorDocument] }
  );
}
