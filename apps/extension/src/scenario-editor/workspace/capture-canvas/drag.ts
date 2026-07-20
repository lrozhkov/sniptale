import { useCallback, useEffect, useRef } from 'react';
import type { ScenarioStepPatch } from '../../project/mutation/helpers';
import { didScenarioDragMove } from '../../project/capture-step-draft/drag-move';
import { createPointerPreviewScheduler, toPointerPreviewPoint } from '../drag-preview/frame';
import type { ScenarioWorkspacePanDragState } from './helpers';
import { clearCanvasDragPreview, previewCanvasDragPatch } from './drag-session';

function useLatestValueRef<T>(value: T) {
  const ref = useRef(value);

  useEffect(() => {
    ref.current = value;
  }, [value]);

  return ref;
}

function createScenarioWorkspacePreviewScheduler(args: {
  dragState: ScenarioWorkspacePanDragState;
  onDragPreviewRef: React.MutableRefObject<(patch: ScenarioStepPatch | null) => void>;
  scaleRef: React.MutableRefObject<number>;
}) {
  return createPointerPreviewScheduler((point) => {
    previewCanvasDragPatch(
      args.dragState,
      point,
      args.onDragPreviewRef.current,
      args.scaleRef.current
    );
  });
}

function createScenarioWorkspacePointerUpHandler(args: {
  clearPreview: () => void;
  dragState: ScenarioWorkspacePanDragState;
  onDragCommitRef: React.MutableRefObject<(patch: ScenarioStepPatch) => void>;
  onDragPreviewRef: React.MutableRefObject<(patch: ScenarioStepPatch | null) => void>;
  previewScheduler: ReturnType<typeof createPointerPreviewScheduler>;
  scaleRef: React.MutableRefObject<number>;
  sessionState: { keepPreviewAfterCommit: boolean };
  setDragState: (value: ScenarioWorkspacePanDragState | null) => void;
}) {
  return (event: PointerEvent) => {
    args.previewScheduler.cancel();

    if (didScenarioDragMove(args.dragState.origin, event)) {
      const patch = previewCanvasDragPatch(
        args.dragState,
        toPointerPreviewPoint(event),
        args.onDragPreviewRef.current,
        args.scaleRef.current
      );
      if (patch) {
        args.onDragCommitRef.current(patch);
        args.sessionState.keepPreviewAfterCommit = true;
      }
    } else {
      args.clearPreview();
    }

    args.setDragState(null);
  };
}

function createScenarioWorkspaceDragCleanup(args: {
  clearPreview: () => void;
  handlePointerMove: (event: PointerEvent) => void;
  handlePointerUp: (event: PointerEvent) => void;
  previewScheduler: ReturnType<typeof createPointerPreviewScheduler>;
  sessionState: { keepPreviewAfterCommit: boolean };
}) {
  return () => {
    args.previewScheduler.cancel();
    window.removeEventListener('pointermove', args.handlePointerMove);
    window.removeEventListener('pointerup', args.handlePointerUp);
    if (!args.sessionState.keepPreviewAfterCommit) {
      args.clearPreview();
    }
  };
}

function useScenarioWorkspaceDragRefs(args: {
  onDragCommit: (patch: ScenarioStepPatch) => void;
  onDragPreview: (patch: ScenarioStepPatch | null) => void;
  scale: number;
}) {
  return {
    onDragCommitRef: useLatestValueRef(args.onDragCommit),
    onDragPreviewRef: useLatestValueRef(args.onDragPreview),
    scaleRef: useLatestValueRef(args.scale),
  };
}

interface ScenarioWorkspaceActiveDragSessionArgs {
  clearPreview: () => void;
  dragState: ScenarioWorkspacePanDragState | null;
  onDragCommitRef: React.MutableRefObject<(patch: ScenarioStepPatch) => void>;
  onDragPreviewRef: React.MutableRefObject<(patch: ScenarioStepPatch | null) => void>;
  scaleRef: React.MutableRefObject<number>;
  setDragState: (value: ScenarioWorkspacePanDragState | null) => void;
}

function useScenarioWorkspaceActiveDragSession({
  clearPreview,
  dragState,
  onDragCommitRef,
  onDragPreviewRef,
  scaleRef,
  setDragState,
}: ScenarioWorkspaceActiveDragSessionArgs) {
  useEffect(() => {
    if (!dragState) {
      return;
    }

    const sessionState = { keepPreviewAfterCommit: false };
    const previewScheduler = createScenarioWorkspacePreviewScheduler({
      dragState,
      onDragPreviewRef,
      scaleRef,
    });
    const handlePointerMove = (event: PointerEvent) => {
      previewScheduler.schedule(toPointerPreviewPoint(event));
    };
    const handlePointerUp = createScenarioWorkspacePointerUpHandler({
      clearPreview,
      dragState,
      onDragCommitRef,
      onDragPreviewRef,
      previewScheduler,
      scaleRef,
      sessionState,
      setDragState,
    });

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });

    return createScenarioWorkspaceDragCleanup({
      clearPreview,
      handlePointerMove,
      handlePointerUp,
      previewScheduler,
      sessionState,
    });
  }, [clearPreview, dragState, onDragCommitRef, onDragPreviewRef, scaleRef, setDragState]);
}

export function useScenarioWorkspaceDragSession(args: {
  dragState: ScenarioWorkspacePanDragState | null;
  onDragCommit: (patch: ScenarioStepPatch) => void;
  onDragPreview: (patch: ScenarioStepPatch | null) => void;
  scale: number;
  setDragState: (value: ScenarioWorkspacePanDragState | null) => void;
}) {
  const { dragState, onDragCommit, onDragPreview, scale, setDragState } = args;
  const { onDragCommitRef, onDragPreviewRef, scaleRef } = useScenarioWorkspaceDragRefs({
    onDragCommit,
    onDragPreview,
    scale,
  });
  const clearPreview = useCallback(() => {
    clearCanvasDragPreview(onDragPreviewRef.current);
  }, [onDragPreviewRef]);

  useScenarioWorkspaceActiveDragSession({
    clearPreview,
    dragState,
    onDragCommitRef,
    onDragPreviewRef,
    scaleRef,
    setDragState,
  });
}
