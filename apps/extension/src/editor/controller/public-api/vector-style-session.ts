import { Group, type Canvas } from 'fabric';
import {
  createEditorVectorInstance,
  isEditorVectorColor,
  isEditorVectorInstance,
  type EditorVectorDefinition,
  type EditorVectorInstance,
} from '../../../features/editor/document/vector-element';
import {
  cancelEditorVectorOpacity,
  commitEditorVectorOpacity,
  getEditorVectorAcceptedOpacity,
  getEditorVectorDefinition,
  previewEditorVectorOpacity,
  previewEditorVectorRuntime,
  updateEditorVectorRuntime,
} from '../../objects/vector-elements/runtime';
import { getMutableEditorSelection } from '../public-actions/selection/objects/active-selection';
import {
  bindClonedVectorResources,
  collectSelectionVectorDefinitions,
} from '../public-actions/selection/objects/vector-resources';
import {
  getEditorDocumentTransitionRevision,
  hasPendingEditorDocumentTransition,
} from '../history/transition-queue';
import type { EditorControllerPublicApiAdapter } from './types';

export interface EditorVectorStylePatch {
  colors?: Record<string, string>;
  strokeScale?: number;
  opacity?: number;
  reset?: boolean;
}

/** A gesture owns one preview lifetime. Confirmation creates at most one history entry. */
export interface EditorVectorStyleEdit {
  preview(patch: EditorVectorStylePatch): boolean;
  commit(): boolean;
  cancel(): void;
}

type StyleController = Pick<
  EditorControllerPublicApiAdapter,
  'canvas' | 'source' | 'layerMutationToken' | 'commitHistory' | 'syncRuntimeState'
>;
type StyleValue = { instance: EditorVectorInstance; opacity: number };
type OriginalStyle = StyleValue & { definition: EditorVectorDefinition };

function selectionIsCurrent(canvas: Canvas, objects: Group[]): boolean {
  const active = canvas.getActiveObjects();
  return (
    active.length === objects.length &&
    objects.every((object, index) => {
      if (active[index] !== object || object.sniptaleLocked || object.visible === false)
        return false;
      let root = object;
      while (root.parent) {
        if (
          root.parent.sniptaleLocked ||
          root.parent.visible === false ||
          !root.parent.getObjects().includes(root)
        )
          return false;
        root = root.parent;
      }
      return canvas.getObjects().includes(root);
    })
  );
}

function prepareStyleUpdate(
  originals: OriginalStyle[],
  pending: StyleValue[],
  patch: EditorVectorStylePatch
): StyleValue[] | null {
  const sameDefinition = originals.every(
    (entry) => entry.definition.id === originals[0]!.definition.id
  );
  if (
    (!sameDefinition && (patch.colors || patch.strokeScale !== undefined || patch.reset)) ||
    (patch.opacity !== undefined &&
      (!Number.isFinite(patch.opacity) || patch.opacity < 0 || patch.opacity > 1)) ||
    (patch.colors && Object.values(patch.colors).some((color) => !isEditorVectorColor(color)))
  )
    return null;
  const next = pending.map((entry, index) => {
    const original = originals[index]!;
    const instance = patch.reset
      ? createEditorVectorInstance(original.instance.definitionId)
      : structuredClone(entry.instance);
    if (patch.colors) Object.assign(instance.overrides.colors, patch.colors);
    if (patch.strokeScale !== undefined) instance.overrides.strokeScale = patch.strokeScale;
    return { instance, opacity: patch.opacity ?? (patch.reset ? 1 : entry.opacity) };
  });
  if (
    next.some(
      (entry, index) =>
        !isEditorVectorInstance(entry.instance) ||
        Object.keys(entry.instance.overrides.colors).some(
          (id) => !originals[index]!.definition.slots.some((slot) => slot.id === id)
        ) ||
        (!originals[index]!.definition.capabilities.strokeScale &&
          entry.instance.overrides.strokeScale !== 1)
    )
  )
    return null;
  return next;
}

function createStyleGesture(
  controller: StyleController,
  canvas: Canvas,
  objects: Group[],
  current: () => boolean,
  onClose: (session: EditorVectorStyleEdit) => void
): EditorVectorStyleEdit {
  const originals = objects.map((object) => {
    const instance = object.sniptaleVectorElement,
      definition = getEditorVectorDefinition(object);
    if (!instance || !definition) throw new Error('Missing prepared vector instance');
    return {
      instance: structuredClone(instance),
      opacity: getEditorVectorAcceptedOpacity(object),
      definition,
    };
  });
  let pending = originals.map((entry) => ({
    instance: structuredClone(entry.instance),
    opacity: entry.opacity,
  }));
  let closed = false;
  const disposers: (() => void)[] = [];
  const finish = () => {
    closed = true;
    disposers.forEach((dispose) => dispose());
    onClose(session);
  };
  const cancel = () => {
    if (closed) return;
    finish();
    objects.forEach((object) => {
      if (object.sniptaleVectorElement)
        previewEditorVectorRuntime(object, object.sniptaleVectorElement);
      cancelEditorVectorOpacity(object);
    });
    canvas.requestRenderAll();
  };
  const session: EditorVectorStyleEdit = {
    preview(patch) {
      if (closed || !current()) {
        cancel();
        return false;
      }
      const next = prepareStyleUpdate(originals, pending, patch);
      if (!next) return false;
      next.forEach((entry, index) => {
        previewEditorVectorRuntime(objects[index]!, entry.instance);
        previewEditorVectorOpacity(objects[index]!, entry.opacity);
      });
      pending = next;
      canvas.requestRenderAll();
      return true;
    },
    commit() {
      if (closed || !current()) {
        cancel();
        return false;
      }
      const changed = pending.some(
        (entry, index) =>
          entry.opacity !== originals[index]!.opacity ||
          JSON.stringify(entry.instance) !== JSON.stringify(originals[index]!.instance)
      );
      finish();
      objects.forEach((object, index) => {
        updateEditorVectorRuntime(object, pending[index]!.instance);
        commitEditorVectorOpacity(object);
      });
      if (changed) {
        controller.commitHistory();
        controller.syncRuntimeState();
      }
      return changed;
    },
    cancel,
  };
  for (const event of [
    'selection:created',
    'selection:updated',
    'selection:cleared',
    'object:removed',
    'object:added',
    'before:transform',
  ] as const)
    disposers.push(canvas.on(event, cancel));
  return session;
}

/** Own the preparation generation and active gesture for this controller lifetime. */
export function createEditorVectorStyleSessions(controller: StyleController) {
  const sessions = new WeakMap<Canvas, EditorVectorStyleEdit>();
  let preparationGeneration = 0;
  function cancelActive() {
    if (controller.canvas) sessions.get(controller.canvas)?.cancel();
  }
  function cancel() {
    preparationGeneration += 1;
    cancelActive();
  }
  async function begin(): Promise<EditorVectorStyleEdit | null> {
    const generation = ++preparationGeneration;
    const { canvas, source, layerMutationToken: token } = controller;
    if (!canvas || !source || hasPendingEditorDocumentTransition(canvas)) return null;
    const revision = getEditorDocumentTransitionRevision(canvas);
    sessions.get(canvas)?.cancel();
    const selection = getMutableEditorSelection(canvas);
    if (
      !selection?.length ||
      selection.some(
        (object) => !(object instanceof Group) || object.sniptaleType !== 'vector-element'
      )
    )
      return null;
    const objects = selection.filter((object): object is Group => object instanceof Group);
    const current = () =>
      generation === preparationGeneration &&
      controller.canvas === canvas &&
      controller.source === source &&
      controller.layerMutationToken === token &&
      !hasPendingEditorDocumentTransition(canvas) &&
      getEditorDocumentTransitionRevision(canvas) === revision &&
      selectionIsCurrent(canvas, objects);
    await bindClonedVectorResources(objects, collectSelectionVectorDefinitions(canvas, objects));
    if (!current()) return null;
    const session = createStyleGesture(controller, canvas, objects, current, (closed) => {
      if (sessions.get(canvas) === closed) sessions.delete(canvas);
    });
    sessions.set(canvas, session);
    return session;
  }
  return { begin, cancel, cancelActive };
}
