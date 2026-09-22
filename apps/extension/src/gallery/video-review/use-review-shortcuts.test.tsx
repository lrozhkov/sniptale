// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { useReviewEditorShortcuts } from './use-review-shortcuts';

it('uses physical shortcut keys across layouts and leaves text editing alone', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const undo = vi.fn(async () => {});
  const redo = vi.fn(async () => {});
  const toggleCut = vi.fn();
  const play = vi.fn();
  function Harness() {
    useReviewEditorShortcuts({
      time: 0,
      seek: vi.fn(),
      play,
      composerAnnotation: null,
      busy: false,
      exporterPhase: 'idle',
      exporterAvailable: true,
      boundaries: undefined,
      run: async (action) => action(),
      undo,
      redo,
      cancelDrawing: vi.fn(),
      pointTool: vi.fn(),
      remove: vi.fn(),
      addComment: vi.fn(),
      toggleCut,
    });
    return (
      <>
        <textarea />
        <aside data-ui="gallery.videoReview.inspector">
          <details>
            <summary>Section</summary>
          </details>
          <button>Category</button>
        </aside>
      </>
    );
  }
  try {
    act(() => root.render(<Harness />));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'я', code: 'KeyZ', ctrlKey: true }));
    expect(undo).toHaveBeenCalledTimes(1);
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Я', code: 'KeyZ', metaKey: true, shiftKey: true })
    );
    expect(redo).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'с', code: 'KeyC' }));
    expect(toggleCut).toHaveBeenCalledTimes(1);
    for (const control of host.querySelectorAll('summary, button')) {
      const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
      control.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    }
    expect(play).not.toHaveBeenCalled();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    expect(play).toHaveBeenCalledTimes(1);
    host
      .querySelector('textarea')!
      .dispatchEvent(
        new KeyboardEvent('keydown', { bubbles: true, key: 'я', code: 'KeyZ', ctrlKey: true })
      );
    expect(undo).toHaveBeenCalledTimes(1);
  } finally {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
