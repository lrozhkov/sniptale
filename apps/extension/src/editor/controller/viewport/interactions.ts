import type { PanSession } from '../core/types';
import {
  applyViewportPanSession,
  createViewportPanSession,
  shouldStartViewportPan,
} from '../input/pan';

export function startEditorViewportPan(options: {
  viewportElement: HTMLElement | null;
  isSpacePressed: boolean;
  event: MouseEvent;
}): PanSession | null {
  const { viewportElement, isSpacePressed, event } = options;
  if (!viewportElement || !shouldStartViewportPan(event, isSpacePressed)) {
    return null;
  }

  const panSession = createViewportPanSession(viewportElement, event);
  viewportElement.classList.add('cursor-grabbing');
  event.preventDefault();
  event.stopPropagation();
  return panSession;
}

export function moveEditorViewportPan(options: {
  viewportElement: HTMLElement | null;
  panSession: PanSession | null;
  event: MouseEvent;
}): void {
  const { viewportElement, panSession, event } = options;
  if (!viewportElement || !panSession) {
    return;
  }

  applyViewportPanSession(viewportElement, panSession, event);
  event.preventDefault();
}

export function finishEditorViewportPan(options: {
  viewportElement: HTMLElement | null;
  panSession: PanSession | null;
}): PanSession | null {
  const { viewportElement, panSession } = options;
  if (!viewportElement || !panSession) {
    return panSession;
  }

  viewportElement.classList.remove('cursor-grabbing');
  return null;
}

export function scheduleEditorViewportStateSyncFrame(options: {
  viewportSyncFrame: number;
  syncViewportState: () => void;
  setViewportSyncFrame: (nextFrame: number) => void;
}): void {
  const { viewportSyncFrame, syncViewportState, setViewportSyncFrame } = options;
  if (viewportSyncFrame !== 0) {
    return;
  }

  const frame = requestAnimationFrame(() => {
    setViewportSyncFrame(0);
    syncViewportState();
  });
  setViewportSyncFrame(frame);
}
