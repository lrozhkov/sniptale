import { runtimeInfo } from '@sniptale/platform/browser/runtime';
import { isRecordingTextCursorTarget } from './text-cursor-target';

type CursorOverride = {
  element: HTMLElement;
  value: string;
  priority: string;
  hadStyle: boolean;
  resolvedCursor: string;
};

/** Owns the reversible Windows text-cursor compatibility effect for one recording. */
export function createRecordingTextCursor() {
  let current: CursorOverride | null = null;
  let listening = false;
  let textCursor = '';
  let selectionStarted = false;

  function restore(): void {
    if (!current) return;
    const { element, value, priority, hadStyle } = current;
    current = null;
    // Do not overwrite a cursor changed by the page while our effect was active.
    if (element.style.cursor !== textCursor) return;
    if (value) element.style.setProperty('cursor', value, priority);
    else element.style.removeProperty('cursor');
    if (!hadStyle && element.style.length === 0) element.removeAttribute('style');
  }

  function onPointer(event: MouseEvent): void {
    if (event.buttons === 0) selectionStarted = false;
    const selecting = selectionStarted && (document.getSelection()?.rangeCount ?? 0) > 0;
    const target = event.composedPath()[0];
    if (!(target instanceof HTMLElement)) {
      restore();
      return;
    }
    if (current?.element === target && target.style.cursor === textCursor) {
      if (!isRecordingTextCursorTarget(target, event, current.resolvedCursor, selecting)) restore();
      return;
    }
    restore();
    const cursor = getComputedStyle(target).cursor;
    if (!isRecordingTextCursorTarget(target, event, cursor, selecting)) return;
    current = {
      element: target,
      value: target.style.getPropertyValue('cursor'),
      priority: target.style.getPropertyPriority('cursor'),
      hadStyle: target.hasAttribute('style'),
      resolvedCursor: cursor,
    };
    target.style.setProperty('cursor', textCursor, 'important');
  }

  function onPointerOut(event: MouseEvent): void {
    // Internal boundary events are followed by pointerover/move. Restoring here
    // briefly reintroduces the native I-beam between nested text targets.
    if (event.relatedTarget === null) restore();
  }

  function onSelectStart(): void {
    selectionStarted = true;
  }

  function resetSelection(): void {
    selectionStarted = false;
  }

  function cancelSelection(): void {
    resetSelection();
    restore();
  }

  function stop(): void {
    cancelSelection();
    if (!listening) return;
    listening = false;
    document.removeEventListener('pointerover', onPointer, true);
    document.removeEventListener('pointermove', onPointer, true);
    document.removeEventListener('pointerout', onPointerOut, true);
    document.removeEventListener('pointerdown', resetSelection, true);
    document.removeEventListener('selectstart', onSelectStart, true);
    document.removeEventListener('pointerup', onPointer, true);
    document.removeEventListener('pointercancel', cancelSelection, true);
    document.removeEventListener('dragstart', cancelSelection, true);
    window.removeEventListener('pagehide', stop);
  }

  return {
    start(): void {
      stop();
      if (!navigator.platform.startsWith('Win')) return;
      // A bitmap cursor avoids Windows XOR-to-RGBA conversion in tab capture.
      // Use a packaged image: host CSP can block data-URL cursor images.
      try {
        const url = runtimeInfo.getURL('cursors/text.svg');
        const image = new Image();
        image.src = url;
        textCursor = `url("${url}") 4 9, text`;
      } catch {
        // An invalidated extension context must leave the native cursor intact.
        return;
      }
      listening = true;
      document.addEventListener('pointerover', onPointer, true);
      document.addEventListener('pointermove', onPointer, true);
      document.addEventListener('pointerout', onPointerOut, true);
      document.addEventListener('pointerdown', resetSelection, true);
      document.addEventListener('selectstart', onSelectStart, true);
      document.addEventListener('pointerup', onPointer, true);
      document.addEventListener('pointercancel', cancelSelection, true);
      document.addEventListener('dragstart', cancelSelection, true);
      window.addEventListener('pagehide', stop);
    },
    stop,
  };
}
