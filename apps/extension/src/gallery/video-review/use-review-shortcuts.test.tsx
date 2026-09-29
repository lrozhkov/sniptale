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
  const seek = vi.fn();
  function Harness() {
    useReviewEditorShortcuts({
      time: 0,
      navigation: { start: 2, end: 8 },
      seek,
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
        <div
          role="slider"
          data-ui="gallery.videoReview.timePlane"
          tabIndex={0}
          aria-valuemin={0}
          aria-valuemax={10}
          aria-valuenow={0}
        />
        <input type="range" />
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
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Home', code: 'Home', cancelable: true })
    );
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'End', code: 'End', cancelable: true })
    );
    expect(seek.mock.calls).toEqual([
      [2, false],
      [8, false],
    ]);
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Home', code: 'Home', shiftKey: true })
    );
    host
      .querySelector('textarea')!
      .dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'End', code: 'End' }));
    host
      .querySelector('summary')!
      .dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Home', code: 'Home' }));
    expect(seek).toHaveBeenCalledTimes(2);
    host
      .querySelector('[data-ui="gallery.videoReview.timePlane"]')!
      .dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'End', code: 'End' }));
    host
      .querySelector('input[type="range"]')!
      .dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Home', code: 'Home' }));
    expect(seek).toHaveBeenCalledTimes(3);
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
