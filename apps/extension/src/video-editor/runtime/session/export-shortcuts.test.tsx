// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { useVideoEditorExportShortcut } from './export-shortcuts';

it('opens export with Ctrl/Command+M only in the active editor workspace', () => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const openExportDialog = vi.fn();
  function Harness({ enabled }: { enabled: boolean }) {
    useVideoEditorExportShortcut({ enabled, openExportDialog });
    return <input type="text" />;
  }
  const key = (target: EventTarget, init: KeyboardEventInit = {}) => {
    const event = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      code: 'KeyM',
      ctrlKey: true,
      ...init,
    });
    act(() => target.dispatchEvent(event));
    return event;
  };
  try {
    act(() => root.render(<Harness enabled />));
    expect(key(window).defaultPrevented).toBe(true);
    expect(key(window, { ctrlKey: false, metaKey: true }).defaultPrevented).toBe(true);
    expect(openExportDialog).toHaveBeenCalledTimes(2);
    expect(key(container.firstElementChild!, {}).defaultPrevented).toBe(false);
    expect(key(window, { repeat: true }).defaultPrevented).toBe(true);
    expect(key(window, { shiftKey: true }).defaultPrevented).toBe(false);
    expect(openExportDialog).toHaveBeenCalledTimes(2);
    act(() => root.render(<Harness enabled={false} />));
    expect(key(window).defaultPrevented).toBe(false);
    act(() => root.unmount());
    expect(key(window).defaultPrevented).toBe(false);
  } finally {
    container.remove();
  }
});
