import { ActiveSelection, type FabricObject } from 'fabric';
import type { EditorVectorDefinition } from '../../../features/editor/document/vector-element';
import { getMutableEditorSelection } from '../public-actions/selection/objects/active-selection';
import { collectSelectionVectorDefinitions } from '../public-actions/selection/objects/vector-resources';
import {
  captureEditorVectorCommandContext,
  getEditorVectorInsertionPoint,
  switchToVectorSelectionCursor,
  type EditorVectorCommandContext,
  type EditorVectorPublisher,
} from './vector-elements';
import {
  getEditorDocumentTransitionRevision,
  hasPendingEditorDocumentTransition,
} from '../history/transition-queue';
import {
  canCopyVectorObjects,
  cloneVectorClipboardSelection,
  prepareVectorPaste,
  type PreparedVectorPaste,
} from './vector-clipboard-preparation';

export interface EditorVectorClipboardAvailability {
  canCopy: boolean;
  canPaste: boolean;
}

/** In-app clipboard keeps one detached resource closure, independent of source/library lifetime. */
export function createEditorVectorClipboard(
  controller: EditorVectorCommandContext,
  publisher: EditorVectorPublisher,
  cancelPreview: () => void
) {
  type Payload = {
    objects: FabricObject[];
    definitions: Record<string, EditorVectorDefinition>;
    readers: number;
    retired: boolean;
  };
  let clipboard: Payload | null = null;
  let copyGeneration = 0;
  const disposeRetired = (payload: Payload) => {
    if (payload.retired && payload.readers === 0)
      payload.objects.forEach((object) => object.dispose());
  };

  function getAvailability(): EditorVectorClipboardAvailability {
    const { canvas, source } = controller;
    const ready = !!canvas && !!source && !hasPendingEditorDocumentTransition(canvas);
    const selection = ready ? getMutableEditorSelection(canvas) : null;
    return {
      canCopy: !!selection && canCopyVectorObjects(selection),
      canPaste: ready && clipboard !== null,
    };
  }

  async function copyVectorSelection(): Promise<boolean> {
    if (!getAvailability().canCopy) return false;
    cancelPreview();
    const generation = ++copyGeneration;
    const { canvas, source, layerMutationToken: token } = controller;
    const selection = getMutableEditorSelection(canvas);
    if (!canvas || !source || !selection?.length || hasPendingEditorDocumentTransition(canvas))
      return false;
    const revision = getEditorDocumentTransitionRevision(canvas);
    const definitions = collectSelectionVectorDefinitions(canvas, selection);
    if (!Object.keys(definitions).length) return false;
    const objects = await cloneVectorClipboardSelection(selection);
    try {
      if (
        generation !== copyGeneration ||
        controller.canvas !== canvas ||
        controller.source !== source ||
        hasPendingEditorDocumentTransition(canvas) ||
        getEditorDocumentTransitionRevision(canvas) !== revision ||
        controller.layerMutationToken !== token ||
        canvas.getActiveObjects().length !== selection.length ||
        selection.some((object, index) => canvas.getActiveObjects()[index] !== object)
      )
        return false;
      if (clipboard) {
        clipboard.retired = true;
        disposeRetired(clipboard);
      }
      clipboard = { objects, definitions, readers: 0, retired: false };
      return true;
    } finally {
      if (clipboard?.objects !== objects) objects.forEach((object) => object.dispose());
    }
  }

  async function pasteVectorSelection(position?: { x: number; y: number }): Promise<boolean> {
    cancelPreview();
    const payload = clipboard;
    if (!payload) return false;
    const context = captureEditorVectorCommandContext(controller, position);
    if (!context) return false;
    const { canvas, current } = context;
    let prepared: PreparedVectorPaste | null = null;
    let accepted = false;
    payload.readers += 1;
    try {
      prepared = await prepareVectorPaste({
        objects: payload.objects,
        definitions: payload.definitions,
        publisher,
        current,
        position: () => position ?? getEditorVectorInsertionPoint(controller),
        prepareObject: (object) => controller.prepareObject(object),
      });
      if (!prepared || !current()) return false;
      const { objects: clones, refs } = prepared;
      controller.autosaveService?.adoptVectorAssets(refs);
      controller.withHistoryMuted(() => {
        canvas.add(...clones);
        canvas.setActiveObject(
          clones.length === 1 ? clones[0]! : new ActiveSelection(clones, { canvas })
        );
        controller.ensureBrowserFrameOnTop();
        switchToVectorSelectionCursor(controller);
      });
      accepted = true;
      canvas.requestRenderAll();
      controller.commitHistory();
      controller.syncRuntimeState();
      return true;
    } finally {
      if (!accepted) prepared?.objects.forEach((object) => object.dispose());
      payload.readers -= 1;
      disposeRetired(payload);
    }
  }

  return { copyVectorSelection, pasteVectorSelection, getAvailability };
}
