import { runtimeInfo } from '@sniptale/platform/browser/runtime';

type CursorOverride = {
  element: HTMLElement;
  value: string;
  priority: string;
  hadStyle: boolean;
};

function isFocused(element: HTMLElement): boolean {
  return (
    element.matches(':focus') || element.closest('[contenteditable]')?.matches(':focus') === true
  );
}

/** Owns the reversible Windows text-cursor compatibility effect for one recording. */
export function createRecordingTextCursor() {
  let current: CursorOverride | null = null;
  let listening = false;
  let textCursor = '';

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

  function onPointer(event: Event): void {
    const target = event.composedPath()[0];
    if (!(target instanceof HTMLElement)) {
      restore();
      return;
    }
    if (current?.element === target && target.style.cursor === textCursor) return;
    restore();
    if (isFocused(target)) return;
    const cursor = getComputedStyle(target).cursor;
    if (cursor !== 'text' && !(cursor === 'auto' && target.isContentEditable)) return;
    current = {
      element: target,
      value: target.style.getPropertyValue('cursor'),
      priority: target.style.getPropertyPriority('cursor'),
      hadStyle: target.hasAttribute('style'),
    };
    target.style.setProperty('cursor', textCursor, 'important');
  }

  function stop(): void {
    restore();
    if (!listening) return;
    listening = false;
    document.removeEventListener('pointerover', onPointer, true);
    document.removeEventListener('pointermove', onPointer, true);
    document.removeEventListener('pointerout', restore, true);
    document.removeEventListener('focusin', restore, true);
    window.removeEventListener('pagehide', stop);
  }

  return {
    start(): void {
      stop();
      if (!navigator.platform.startsWith('Win')) return;
      // A bitmap cursor avoids Windows XOR-to-RGBA conversion in tab capture.
      // Use a packaged image: host CSP can block data-URL cursor images.
      try {
        textCursor = `url("${runtimeInfo.getURL('cursors/text.svg')}") 4 9, text`;
      } catch {
        // An invalidated extension context must leave the native cursor intact.
        return;
      }
      listening = true;
      document.addEventListener('pointerover', onPointer, true);
      document.addEventListener('pointermove', onPointer, true);
      document.addEventListener('pointerout', restore, true);
      document.addEventListener('focusin', restore, true);
      window.addEventListener('pagehide', stop);
    },
    stop,
  };
}
