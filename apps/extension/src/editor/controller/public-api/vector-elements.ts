import {
  createEditorVectorInstance,
  type EditorVectorDefinition,
} from '../../../features/editor/document/vector-element';
import type { EditorViewportState } from '../../../features/editor/document/types';
import { translate } from '../../../platform/i18n';
import { useEditorStore } from '../../state/useEditorStore';
import { createEditorVectorRuntime } from '../../objects/vector-elements/runtime';
import { validateEditorVectorDefinition } from '../../objects/vector-elements/prepare';
import { createEditorVectorStyleSessions } from './vector-style-session';
export type { EditorVectorStyleEdit, EditorVectorStylePatch } from './vector-style-session';
import type { EditorControllerPublicApiAdapter } from './types';
import type { AssetRef } from '../../../composition/persistence/assets/contracts';
import type { EditorSessionAutosaveService } from '../../document/session-autosave';
import {
  getEditorDocumentTransitionRevision,
  hasPendingEditorDocumentTransition,
} from '../history/transition-queue';

/** Controller-owned dependencies for vector commands, with live document identity getters. */
export type EditorVectorCommandContext = Pick<
  EditorControllerPublicApiAdapter,
  | 'canvas'
  | 'source'
  | 'layerMutationToken'
  | 'zoomLevel'
  | 'prepareObject'
  | 'nextLabelIndex'
  | 'commitHistory'
  | 'syncRuntimeState'
  | 'switchToSelectTool'
  | 'withHistoryMuted'
  | 'ensureBrowserFrameOnTop'
> & {
  buildViewportState(): EditorViewportState;
  autosaveService: Pick<EditorSessionAutosaveService, 'adoptVectorAssets'> | null;
};

/** Native publication must settle before any vector object enters the accepted canvas. */
export interface EditorVectorPublisher {
  publish(definition: EditorVectorDefinition): Promise<AssetRef>;
}

/** Keep the live inspector choice when an accepted vector operation changes the cursor. */
export function switchToVectorSelectionCursor(controller: EditorVectorCommandContext): void {
  const inspector = useEditorStore.getState().inspector;
  controller.switchToSelectTool();
  useEditorStore.getState().setInspector(inspector);
}

/** Return a scene point at the center of the visible source intersection. */
export function getEditorVectorInsertionPoint(controller: EditorVectorCommandContext): {
  x: number;
  y: number;
} {
  const source = controller.source;
  if (!source) return { x: 0, y: 0 };
  const view = controller.buildViewportState();
  const zoom = controller.zoomLevel;
  const center = (
    start: number,
    length: number,
    scroll: number,
    offset: number,
    visible: number
  ) => {
    const near = Math.max(start, (scroll - offset) / zoom);
    const far = Math.min(start + length, (scroll + visible - offset) / zoom);
    return far > near ? (near + far) / 2 : start + length / 2;
  };
  return {
    x: center(
      source.left,
      source.displayWidth,
      view.scrollLeft,
      view.canvasOffsetLeft,
      view.viewportWidth
    ),
    y: center(
      source.top,
      source.displayHeight,
      view.scrollTop,
      view.canvasOffsetTop,
      view.viewportHeight
    ),
  };
}

/** Capture insertion admission and reject asynchronous results from a replaced document. */
export function captureEditorVectorCommandContext(
  controller: EditorVectorCommandContext,
  position?: { x: number; y: number }
) {
  const { canvas, source, layerMutationToken: token } = controller;
  if (
    !canvas ||
    !source ||
    hasPendingEditorDocumentTransition(canvas) ||
    (position && (!Number.isFinite(position.x) || !Number.isFinite(position.y)))
  )
    return null;
  const revision = getEditorDocumentTransitionRevision(canvas);
  const current = () =>
    controller.canvas === canvas &&
    controller.source === source &&
    controller.layerMutationToken === token &&
    !hasPendingEditorDocumentTransition(canvas) &&
    getEditorDocumentTransitionRevision(canvas) === revision;
  return { canvas, source, current };
}

/** Validate, publish, and accept insertions; keep gesture state disposable and per canvas. */
export function createEditorVectorCommands(
  controller: EditorVectorCommandContext,
  publisher: EditorVectorPublisher
) {
  const styles = createEditorVectorStyleSessions(controller);

  async function insertVectorElement(
    definitionValue: EditorVectorDefinition,
    position?: { x: number; y: number },
    colors?: Readonly<Record<string, string>>,
    style?: { opacity: number; strokeScale: number }
  ): Promise<boolean> {
    const palette = { ...colors };
    const opacity = style?.opacity ?? 1;
    const strokeScale = style?.strokeScale ?? 1;
    if (
      !Number.isFinite(opacity) ||
      opacity < 0 ||
      opacity > 1 ||
      !Number.isFinite(strokeScale) ||
      strokeScale < 0.01 ||
      strokeScale > 100
    )
      return false;
    const context = captureEditorVectorCommandContext(controller, position);
    if (!context) return false;
    const { canvas, source, current } = context;
    styles.cancelActive();
    const definition = await validateEditorVectorDefinition(definitionValue);
    if (!current()) return false;
    const instance = createEditorVectorInstance(definition.id);
    instance.overrides.colors = palette;
    instance.overrides.strokeScale = strokeScale;
    const object = await createEditorVectorRuntime(definition, instance);
    object.set('opacity', opacity);
    let accepted = false;
    try {
      if (!current()) return false;
      const ref = await publisher.publish(definition);
      if (!current()) return false;
      const point = position ?? getEditorVectorInsertionPoint(controller);
      const length = Math.min(120, source.displayWidth / 2, source.displayHeight / 2);
      const scale = length / Math.max(definition.viewBox.width, definition.viewBox.height);
      object.set({
        left: point.x,
        top: point.y,
        originX: 'center',
        originY: 'center',
        scaleX: scale,
        scaleY: scale,
      });
      object.sniptaleId = crypto.randomUUID();
      object.sniptaleLabel =
        definition.provenance.name ??
        translate('editor.elements.layerName').replace(
          '{index}',
          String(controller.nextLabelIndex('vector-element'))
        );
      controller.prepareObject(object);
      controller.autosaveService?.adoptVectorAssets(new Map([[definition.id, ref]]));
      controller.withHistoryMuted(() => {
        canvas.add(object);
        canvas.setActiveObject(object);
        controller.ensureBrowserFrameOnTop();
        switchToVectorSelectionCursor(controller);
      });
      accepted = true;
      canvas.requestRenderAll();
      controller.commitHistory();
      controller.syncRuntimeState();
      return true;
    } finally {
      if (!accepted) object.dispose();
    }
  }

  async function duplicateWithAcceptedVectorStyle(duplicate: () => Promise<void>): Promise<void> {
    styles.cancel();
    await duplicate();
  }

  return {
    insertVectorElement,
    beginVectorStyleEdit: styles.begin,
    cancelVectorStyleEdit: styles.cancel,
    duplicateWithAcceptedVectorStyle,
  };
}
