import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import type { ScenarioElement } from '@sniptale/runtime-contracts/scenario/types/v3';
import { createElementKeyboardNudgeFrame } from './keyboard';
import {
  createInteractionPatch,
  createPreviewFramePatch,
  getActiveInteractionSession,
  type InteractionSessionSnapshot,
} from './patches';
import type { ScenarioCanvasMagnetScope } from './magnet';
import type {
  ScenarioCanvasDragSession,
  ScenarioCanvasElementPatch,
  ScenarioCanvasEndpointSession,
  ScenarioCanvasImageContentSession,
  ScenarioCanvasResizeSession,
  ScenarioCanvasStageProps,
  ScenarioCanvasTransactionKind,
} from './types';

type CanvasPointerEvent = ReactPointerEvent<HTMLDivElement>;
type CanvasKeyboardEvent = ReactKeyboardEvent<HTMLDivElement>;

export function createClearInteractionHandler(args: {
  onTransactionCancel: ScenarioCanvasStageProps['onCancelElementTransaction'];
  onTransactionCommit: ScenarioCanvasStageProps['onCommitElementTransaction'];
  resetInteractionState: () => void;
  snapshot: InteractionSessionSnapshot;
  transactionKind: ScenarioCanvasTransactionKind | null;
}) {
  return (commit: boolean) => {
    const session = getActiveInteractionSession(args.snapshot);
    if (session && args.transactionKind) {
      const callback = commit ? args.onTransactionCommit : args.onTransactionCancel;
      callback?.(session.element.id, args.transactionKind);
    }

    args.resetInteractionState();
  };
}

export function createBeginInteractionHandler(args: {
  onTransactionBegin: ScenarioCanvasStageProps['onBeginElementTransaction'];
  setTransactionKind: (kind: ScenarioCanvasTransactionKind) => void;
}) {
  return (
    nextSession:
      | ScenarioCanvasDragSession
      | ScenarioCanvasEndpointSession
      | ScenarioCanvasImageContentSession
      | ScenarioCanvasResizeSession,
    kind: ScenarioCanvasTransactionKind
  ) => {
    args.onTransactionBegin?.(nextSession.element.id, kind);
    args.setTransactionKind(kind);
  };
}

export function createCommitInteractionHandler(args: {
  clearInteraction: (commit: boolean) => void;
  magnetScope: ScenarioCanvasMagnetScope | null;
  onUpdateElement: (elementId: string, patch: ScenarioCanvasElementPatch) => void;
  previewFrame: InteractionCommitOptions['previewFrame'];
  scale: number;
  snapGridSize: number | null;
  snapshot: InteractionSessionSnapshot;
}) {
  return (event: CanvasPointerEvent) => {
    const session = getActiveInteractionSession(args.snapshot);
    if (!session) {
      args.clearInteraction(false);
      return;
    }

    const patch = createCommittedInteractionPatch({ ...args, event });
    if (patch) {
      args.onUpdateElement(session.element.id, patch);
    }
    args.clearInteraction(true);
  };
}

export function createPreviewInteractionHandler(args: {
  magnetScope: ScenarioCanvasMagnetScope | null;
  scale: number;
  snapGridSize: number | null;
  setPreviewFrame: (frame: InteractionCommitOptions['previewFrame']) => void;
  snapshot: InteractionSessionSnapshot;
}) {
  return (event: CanvasPointerEvent) => {
    if (!args.snapshot.dragSession && !args.snapshot.resizeSession) {
      return;
    }

    args.setPreviewFrame(
      createPreviewFramePatch({
        event,
        magnetScope: args.magnetScope,
        scale: args.scale,
        snapGridSize: args.snapGridSize,
        snapshot: args.snapshot,
      })
    );
  };
}

export function createKeyboardInteractionHandler(args: {
  clearInteraction: (commit: boolean) => void;
  onDeleteElement: ScenarioCanvasStageProps['onDeleteElement'];
  onSelectSlide: ScenarioCanvasStageProps['onSelectSlide'];
  onUpdateElement: ScenarioCanvasStageProps['onUpdateElement'];
  selectedElement: ScenarioElement | null;
}) {
  return (event: CanvasKeyboardEvent) => {
    if (event.key === 'Escape') {
      args.clearInteraction(false);
      args.onSelectSlide();
      return;
    }

    handleSelectedElementKey({ ...args, event });
  };
}

interface InteractionCommitOptions {
  event: CanvasPointerEvent;
  magnetScope: ScenarioCanvasMagnetScope | null;
  previewFrame: Parameters<typeof createInteractionPatch>[0]['previewFrame'];
  scale: number;
  snapGridSize: number | null;
  snapshot: InteractionSessionSnapshot;
}

function createCommittedInteractionPatch(args: InteractionCommitOptions) {
  return createInteractionPatch({
    event: args.event,
    magnetScope: args.magnetScope,
    previewFrame: args.previewFrame,
    scale: args.scale,
    snapGridSize: args.snapGridSize,
    snapshot: args.snapshot,
  });
}

function handleSelectedElementKey(args: {
  event: CanvasKeyboardEvent;
  onDeleteElement: ScenarioCanvasStageProps['onDeleteElement'];
  onUpdateElement: ScenarioCanvasStageProps['onUpdateElement'];
  selectedElement: ScenarioElement | null;
}) {
  if (!args.selectedElement) {
    return;
  }
  if (args.event.key === 'Delete' || args.event.key === 'Backspace') {
    args.event.preventDefault();
    if (!args.selectedElement.locked) {
      args.onDeleteElement(args.selectedElement.id);
    }
    return;
  }

  const frame = createElementKeyboardNudgeFrame({
    element: args.selectedElement,
    key: args.event.key,
    large: args.event.shiftKey,
  });
  if (frame) {
    args.event.preventDefault();
    args.onUpdateElement(args.selectedElement.id, { frame });
  }
}
