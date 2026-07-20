import {
  finishEditorViewportPan,
  moveEditorViewportPan,
  scheduleEditorViewportStateSyncFrame,
  startEditorViewportPan,
} from '../viewport/interactions';
import { clearEditorRasterHoverCursor } from '../raster-tools/session';
import type {
  EditorControllerEventHandlers,
  EditorControllerEventStateBindings,
  EditorControllerEventCommandBindings,
} from './types';

type PanEventBindings = Pick<
  EditorControllerEventStateBindings,
  | 'getActiveTool'
  | 'getRasterToolSession'
  | 'getIsSpacePressed'
  | 'getPanSession'
  | 'getSource'
  | 'getViewportElement'
  | 'getViewportSyncFrame'
  | 'setPanSession'
  | 'setViewportSyncFrame'
> &
  Pick<EditorControllerEventCommandBindings, 'syncViewportState' | 'zoomViewportAtPoint'>;

function syncRasterHoverCursor(bindings: PanEventBindings, event?: MouseEvent): void {
  if (bindings.getActiveTool() !== 'eraser') {
    clearEditorRasterHoverCursor(bindings.getRasterToolSession());
    return;
  }

  const viewportElement = bindings.getViewportElement();
  if (!viewportElement || !event) {
    return;
  }

  const rect = viewportElement.getBoundingClientRect();
  const insideViewport =
    event.clientX >= rect.left &&
    event.clientX <= rect.right &&
    event.clientY >= rect.top &&
    event.clientY <= rect.bottom;
  if (!insideViewport) {
    clearEditorRasterHoverCursor(bindings.getRasterToolSession());
  }
}

function handleViewportMouseDown(bindings: PanEventBindings, event: MouseEvent): void {
  bindings.setPanSession(
    startEditorViewportPan({
      viewportElement: bindings.getViewportElement(),
      isSpacePressed: bindings.getIsSpacePressed(),
      event,
    }) ?? bindings.getPanSession()
  );
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
  scheduleEditorViewportStateSyncFrame({
    viewportSyncFrame: bindings.getViewportSyncFrame(),
    syncViewportState: () => bindings.syncViewportState(),
    setViewportSyncFrame: (nextFrame) => {
      bindings.setViewportSyncFrame(nextFrame);
    },
  });
}

function handleWindowMouseMove(bindings: PanEventBindings, event: MouseEvent): void {
  syncRasterHoverCursor(bindings, event);
  moveEditorViewportPan({
    viewportElement: bindings.getViewportElement(),
    panSession: bindings.getPanSession(),
    event,
  });
}

function handleWindowMouseUp(bindings: PanEventBindings): void {
  bindings.setPanSession(
    finishEditorViewportPan({
      viewportElement: bindings.getViewportElement(),
      panSession: bindings.getPanSession(),
    })
  );
}

export function createPanEventHandlers(
  bindings: PanEventBindings
): Pick<
  EditorControllerEventHandlers,
  | 'handleViewportMouseDown'
  | 'handleViewportScroll'
  | 'handleViewportWheel'
  | 'handleWindowMouseMove'
  | 'handleWindowMouseUp'
> {
  return {
    handleViewportMouseDown: (event) => handleViewportMouseDown(bindings, event),
    handleViewportWheel: (event) => handleViewportWheel(bindings, event),
    handleViewportScroll: () => handleViewportScroll(bindings),
    handleWindowMouseMove: (event) => handleWindowMouseMove(bindings, event),
    handleWindowMouseUp: () => handleWindowMouseUp(bindings),
  };
}
