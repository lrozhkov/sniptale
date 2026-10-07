// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { useReviewEditorShortcuts } from './use-review-shortcuts';

it('uses physical shortcut keys across layouts and leaves text editing alone', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  host.dataset['ui'] = 'gallery.videoReview.dialog';
  host.tabIndex = -1;
  document.body.append(host);
  host.focus();
  const root = createRoot(host);
  const undo = vi.fn(async () => {});
  const redo = vi.fn(async () => {});
  const toggleCut = vi.fn();
  const play = vi.fn();
  const openSelector = vi.fn();
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
        <button data-toolbar-action>Toolbar action</button>
        <button
          aria-haspopup="listbox"
          aria-expanded="false"
          onKeyDown={(event) => {
            if (event.key === ' ') {
              event.preventDefault();
              openSelector();
            }
          }}
        >
          Closed selector
        </button>
        <div role="slider" aria-valuenow={0} data-custom-slider tabIndex={0} />
        <div role="dialog" hidden>
          <button>Recorder action</button>
        </div>
        <div role="alertdialog" hidden>
          <button>Keep recording</button>
        </div>
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
    const controls = Array.from(host.querySelectorAll('summary, button')).filter(
      (node) => !node.closest('[hidden]')
    );
    for (const control of controls) {
      const event = new KeyboardEvent('keydown', {
        key: ' ',
        code: 'Space',
        bubbles: true,
        cancelable: true,
      });
      control.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    }
    expect(play).toHaveBeenCalledTimes(controls.length);
    const release = new KeyboardEvent('keyup', { key: ' ', bubbles: true, cancelable: true });
    controls[0]!.dispatchEvent(release);
    expect(release.defaultPrevented).toBe(true);
    expect(openSelector).not.toHaveBeenCalled();
    play.mockClear();
    for (const control of host.querySelectorAll('input[type="range"], [data-custom-slider]')) {
      control.dispatchEvent(
        new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })
      );
    }
    expect(play).toHaveBeenCalledTimes(2);
    play.mockClear();
    host
      .querySelector('textarea')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(play).not.toHaveBeenCalled();
    const sliderEvent = new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      bubbles: true,
      cancelable: true,
    });
    host.querySelector('[data-custom-slider]')!.dispatchEvent(sliderEvent);
    expect(sliderEvent.defaultPrevented).toBe(false);
    expect(seek).not.toHaveBeenCalled();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', code: 'KeyC', repeat: true }));
    expect(toggleCut).toHaveBeenCalledTimes(1);
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

it('blocks repeats, IME, outside focus and mutations during busy/export states', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  host.dataset['ui'] = 'gallery.videoReview.dialog';
  host.tabIndex = -1;
  document.body.append(host);
  const root = createRoot(host);
  const add = vi.fn();
  const remove = vi.fn();
  const seek = vi.fn();
  const undo = vi.fn(async () => {});
  const play = vi.fn();
  function Harness({
    busy = false,
    phase = 'idle',
  }: {
    busy?: boolean;
    phase?: 'idle' | 'exporting' | 'publishing';
  }) {
    useReviewEditorShortcuts({
      time: 5,
      navigation: { start: 0, end: 10 },
      seek,
      play,
      composerAnnotation: null,
      busy,
      exporterPhase: phase,
      exporterAvailable: true,
      boundaries: undefined,
      run: async (action) => action(),
      undo,
      redo: undo,
      cancelDrawing: vi.fn(),
      pointTool: vi.fn(),
      remove,
      addComment: add,
      toggleCut: vi.fn(),
    });
    return null;
  }
  const key = (key: string, options: KeyboardEventInit = {}) =>
    host.dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options })
    );
  try {
    act(() => root.render(<Harness />));
    for (const options of [{ repeat: true }, { isComposing: true }]) {
      key(' ', options);
      key('m', options);
      key('Delete', options);
      key('z', { ...options, ctrlKey: true });
    }
    expect(add).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(undo).not.toHaveBeenCalled();
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'm', bubbles: true }));
    expect(add).not.toHaveBeenCalled();
    key('m');
    key('Delete');
    key('z', { ctrlKey: true });
    expect(add).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(undo).toHaveBeenCalledTimes(1);
    for (const props of [
      { busy: true },
      { phase: 'exporting' as const },
      { phase: 'publishing' as const },
    ]) {
      act(() => root.render(<Harness {...props} />));
      key('m');
      key('Delete');
      key('z', { ctrlKey: true });
      key('ArrowRight');
      key('Home');
      key(' ');
    }
    expect(add).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(undo).toHaveBeenCalledTimes(1);
    expect(seek).not.toHaveBeenCalled();
    for (const modifier of ['ctrlKey', 'altKey', 'metaKey', 'shiftKey'])
      key(' ', { [modifier]: true });
    expect(play).not.toHaveBeenCalled();
  } finally {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
