import type { Dispatch, SetStateAction } from 'react';
import type { EditorControllerInstance } from '../../controller/instance/types';
import type { ToolbarGeometryState } from './canvas-toolbar-geometry-types';

const TOOLBAR_TRANSFORM_RETURN_DELAY_MS = 500;

type SetToolbarGeometryState = Dispatch<SetStateAction<ToolbarGeometryState>>;
type ToolbarGeometryRuntime = ReturnType<typeof createToolbarGeometryRuntime>;
type ToolbarGeometryRuntimeState = {
  primaryPointerDown: boolean;
  returnPendingAfterPointerRelease: boolean;
  returnTimer: number;
};

function bindWindowGeometryEvents(args: {
  controller: EditorControllerInstance;
  runtime: ToolbarGeometryRuntime;
}): () => void {
  const { runtime } = args;
  window.addEventListener('resize', runtime.update);
  args.controller.viewportElement?.addEventListener('scroll', runtime.hideDuringCanvasInteraction, {
    passive: true,
  });
  args.controller.viewportElement?.addEventListener('wheel', runtime.hideDuringCanvasInteraction, {
    passive: true,
  });
  window.addEventListener('mousedown', runtime.handlePrimaryMouseDown);
  window.addEventListener('mouseup', runtime.releasePrimaryPointerAndSchedule);

  return () => {
    window.removeEventListener('resize', runtime.update);
    args.controller.viewportElement?.removeEventListener(
      'scroll',
      runtime.hideDuringCanvasInteraction
    );
    args.controller.viewportElement?.removeEventListener(
      'wheel',
      runtime.hideDuringCanvasInteraction
    );
    window.removeEventListener('mousedown', runtime.handlePrimaryMouseDown);
    window.removeEventListener('mouseup', runtime.releasePrimaryPointerAndSchedule);
  };
}

function bindCanvasGeometryEvents(args: {
  controller: EditorControllerInstance;
  runtime: ToolbarGeometryRuntime;
}): () => void {
  const canvas = args.controller.canvas;
  const { runtime } = args;
  canvas?.on('selection:updated', runtime.update);
  canvas?.on('selection:created', runtime.update);
  canvas?.on('selection:cleared', runtime.update);
  canvas?.on('object:moving', runtime.hideDuringPrimaryCanvasTransform);
  canvas?.on('object:scaling', runtime.hideDuringPrimaryCanvasTransform);
  canvas?.on('object:rotating', runtime.hideDuringPrimaryCanvasTransform);
  canvas?.on('object:skewing', runtime.hideDuringPrimaryCanvasTransform);
  canvas?.on('mouse:wheel', runtime.hideDuringCanvasInteraction);
  canvas?.on('text:editing:entered', runtime.hideDuringCanvasInteraction);
  canvas?.on('object:modified', runtime.scheduleReturnAfterCanvasInteraction);
  canvas?.on('mouse:up', runtime.releasePrimaryPointerAndSchedule);
  canvas?.on('text:editing:exited', runtime.scheduleReturnAfterCanvasInteraction);

  return () => {
    canvas?.off('selection:updated', runtime.update);
    canvas?.off('selection:created', runtime.update);
    canvas?.off('selection:cleared', runtime.update);
    canvas?.off('object:moving', runtime.hideDuringPrimaryCanvasTransform);
    canvas?.off('object:scaling', runtime.hideDuringPrimaryCanvasTransform);
    canvas?.off('object:rotating', runtime.hideDuringPrimaryCanvasTransform);
    canvas?.off('object:skewing', runtime.hideDuringPrimaryCanvasTransform);
    canvas?.off('mouse:wheel', runtime.hideDuringCanvasInteraction);
    canvas?.off('text:editing:entered', runtime.hideDuringCanvasInteraction);
    canvas?.off('object:modified', runtime.scheduleReturnAfterCanvasInteraction);
    canvas?.off('mouse:up', runtime.releasePrimaryPointerAndSchedule);
    canvas?.off('text:editing:exited', runtime.scheduleReturnAfterCanvasInteraction);
  };
}

function bindToolbarGeometryEvents(args: {
  controller: EditorControllerInstance;
  runtime: ToolbarGeometryRuntime;
}): () => void {
  const unbindWindow = bindWindowGeometryEvents(args);
  const unbindCanvas = bindCanvasGeometryEvents(args);
  return () => {
    unbindWindow();
    unbindCanvas();
  };
}

function createToolbarGeometryRuntime(args: {
  resolveState: (visibilityRevision: number) => ToolbarGeometryState;
  setState: SetToolbarGeometryState;
}) {
  const state: ToolbarGeometryRuntimeState = {
    primaryPointerDown: false,
    returnPendingAfterPointerRelease: false,
    returnTimer: 0,
  };
  const clearReturnTimer = () => {
    if (state.returnTimer !== 0) {
      window.clearTimeout(state.returnTimer);
      state.returnTimer = 0;
    }
  };
  const update = () => {
    clearReturnTimer();
    args.setState((current) => args.resolveState(current.visibilityRevision));
  };
  const scheduleReturnAfterCanvasInteraction = () => {
    scheduleToolbarReturn(state, clearReturnTimer, args);
  };
  const hideDuringCanvasInteraction = (waitForPrimaryPointerRelease: boolean) => {
    clearReturnTimer();
    state.returnPendingAfterPointerRelease = waitForPrimaryPointerRelease;
    args.setState((current) => ({
      geometry: null,
      visibilityRevision: current.visibilityRevision + 1,
    }));
    scheduleReturnAfterCanvasInteraction();
  };
  const releasePrimaryPointerAndSchedule = () => {
    state.primaryPointerDown = false;
    if (state.returnPendingAfterPointerRelease) {
      scheduleReturnAfterCanvasInteraction();
    }
  };

  return createToolbarGeometryRuntimeApi({
    clearReturnTimer,
    hideDuringCanvasInteraction,
    releasePrimaryPointerAndSchedule,
    scheduleReturnAfterCanvasInteraction,
    state,
    update,
  });
}

function createToolbarGeometryRuntimeApi(args: {
  clearReturnTimer: () => void;
  hideDuringCanvasInteraction: (waitForPrimaryPointerRelease: boolean) => void;
  releasePrimaryPointerAndSchedule: () => void;
  scheduleReturnAfterCanvasInteraction: () => void;
  state: ToolbarGeometryRuntimeState;
  update: () => void;
}) {
  return {
    clearReturnTimer: args.clearReturnTimer,
    handlePrimaryMouseDown: (event: MouseEvent) => {
      if (event.button === 0) {
        args.state.primaryPointerDown = true;
      }
    },
    hideDuringCanvasInteraction: () => args.hideDuringCanvasInteraction(false),
    hideDuringPrimaryCanvasTransform: () => {
      args.state.primaryPointerDown = true;
      args.hideDuringCanvasInteraction(true);
    },
    releasePrimaryPointerAndSchedule: args.releasePrimaryPointerAndSchedule,
    scheduleReturnAfterCanvasInteraction: args.scheduleReturnAfterCanvasInteraction,
    update: args.update,
  };
}

function scheduleToolbarReturn(
  state: ToolbarGeometryRuntimeState,
  clearReturnTimer: () => void,
  args: {
    resolveState: (visibilityRevision: number) => ToolbarGeometryState;
    setState: SetToolbarGeometryState;
  }
): void {
  clearReturnTimer();
  if (state.primaryPointerDown) {
    state.returnPendingAfterPointerRelease = true;
    return;
  }
  state.returnPendingAfterPointerRelease = false;
  state.returnTimer = window.setTimeout(() => {
    state.returnTimer = 0;
    args.setState((current) => args.resolveState(current.visibilityRevision));
  }, TOOLBAR_TRANSFORM_RETURN_DELAY_MS);
}

export function attachCanvasToolbarVisibilityRuntime(args: {
  controller: EditorControllerInstance;
  resolveState: (visibilityRevision: number) => ToolbarGeometryState;
  setState: SetToolbarGeometryState;
}) {
  const runtime = createToolbarGeometryRuntime({
    resolveState: args.resolveState,
    setState: args.setState,
  });
  runtime.update();
  const unbind = bindToolbarGeometryEvents({
    controller: args.controller,
    runtime,
  });

  return () => {
    runtime.clearReturnTimer();
    unbind();
  };
}
