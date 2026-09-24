import {
  finishEditorViewportPan,
  moveEditorViewportPan,
  scheduleEditorViewportStateSyncFrame,
  startEditorViewportPan,
} from '../viewport/interactions';
import { EditorCanvas } from '../viewport/render-region';
import type {
  EditorControllerEventHandlers,
  EditorControllerEventStateBindings,
  EditorControllerEventCommandBindings,
} from './types';

type PanEventBindings = Pick<
  EditorControllerEventStateBindings,
  | 'getIsSpacePressed'
  | 'getCanvas'
  | 'getPanSession'
  | 'getSource'
  | 'getViewportElement'
  | 'getViewportSyncFrame'
  | 'setPanSession'
  | 'setViewportSyncFrame'
> &
  Pick<EditorControllerEventCommandBindings, 'syncViewportState' | 'zoomViewportAtPoint'>;

function handleViewportMouseDown(bindings: PanEventBindings, event: MouseEvent): boolean {
  const started = startEditorViewportPan({
    viewportElement: bindings.getViewportElement(),
    isSpacePressed: bindings.getIsSpacePressed(),
    event,
  });
  bindings.setPanSession(started ?? bindings.getPanSession());
  return started !== null;
}

function handleViewportWheel(bindings: PanEventBindings, event: WheelEvent): void {
  if (!bindings.getSource()) {
    return;
  }
  event.preventDefault();
  bindings.zoomViewportAtPoint(event.deltaY < 0 ? 1.1 : 1 / 1.1, {
    clientX: event.clientX,
    clientY: event.clientY,
  });
}

function handleViewportScroll(bindings: PanEventBindings): void {
  const canvas = bindings.getCanvas();
  if (canvas instanceof EditorCanvas) canvas.refreshVirtualViewport();
  canvas?.requestRenderAll();
  scheduleEditorViewportStateSyncFrame({
    viewportSyncFrame: bindings.getViewportSyncFrame(),
    syncViewportState: () => bindings.syncViewportState(),
    setViewportSyncFrame: (nextFrame) => {
      bindings.setViewportSyncFrame(nextFrame);
    },
  });
}

function handleWindowMouseMove(bindings: PanEventBindings, event: MouseEvent): void {
  moveEditorViewportPan({
    viewportElement: bindings.getViewportElement(),
    panSession: bindings.getPanSession(),
    event,
  });
}

export function createPanEventHandlers(
  bindings: PanEventBindings
): Pick<
  EditorControllerEventHandlers,
  | 'handleViewportMouseDown'
  | 'handleViewportContextMenu'
  | 'handleViewportScroll'
  | 'handleViewportWheel'
  | 'handleWindowMouseMove'
  | 'handleWindowMouseUp'
> {
  let panButton: number | null = null;
  let suppressRightContextMenu = false;
  let earlyRightContextMenu: { target: EventTarget; clientX: number; clientY: number } | null =
    null;
  let replayingRightContextMenu = false;
  return {
    handleViewportMouseDown: (event) => {
      if (event.button === 2) {
        suppressRightContextMenu = false;
        earlyRightContextMenu = null;
      }
      if (handleViewportMouseDown(bindings, event)) panButton = event.button;
    },
    handleViewportContextMenu: (event) => {
      if (replayingRightContextMenu || event.button !== 2) return;
      if (panButton === 2 && !suppressRightContextMenu && event.target) {
        earlyRightContextMenu = {
          target: event.target,
          clientX: event.clientX,
          clientY: event.clientY,
        };
      }
      if (panButton !== 2 && !suppressRightContextMenu) return;
      event.preventDefault();
      event.stopPropagation();
    },
    handleViewportWheel: (event) => handleViewportWheel(bindings, event),
    handleViewportScroll: () => handleViewportScroll(bindings),
    handleWindowMouseMove: (event) => {
      if (panButton === 2 && bindings.getPanSession()) {
        const session = bindings.getPanSession();
        if (
          session &&
          Math.hypot(event.clientX - session.startX, event.clientY - session.startY) > 3
        ) {
          suppressRightContextMenu = true;
        }
      }
      handleWindowMouseMove(bindings, event);
    },
    handleWindowMouseUp: (event) => {
      if (panButton !== null && event.button !== panButton) return;
      const shouldReplayMenu = panButton === 2 && !suppressRightContextMenu;
      const pendingMenu = earlyRightContextMenu;
      earlyRightContextMenu = null;
      panButton = null;
      bindings.setPanSession(
        finishEditorViewportPan({
          viewportElement: bindings.getViewportElement(),
          panSession: bindings.getPanSession(),
        })
      );
      if (shouldReplayMenu && pendingMenu) {
        replayingRightContextMenu = true;
        try {
          pendingMenu.target.dispatchEvent(
            new MouseEvent('contextmenu', {
              bubbles: true,
              button: 2,
              cancelable: true,
              clientX: pendingMenu.clientX,
              clientY: pendingMenu.clientY,
            })
          );
        } finally {
          replayingRightContextMenu = false;
        }
      }
    },
  };
}
