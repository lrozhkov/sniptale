// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { ReviewDialog } from './review-dialog';
afterEach(() => vi.restoreAllMocks());

it('keeps focused control outlines visible for keyboard activation and navigation', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const show = (HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.open = true;
  }));
  const close = (HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.open = false;
  }));
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    act(() =>
      root.render(
        <ReviewDialog>
          <button>Tool</button>
          <textarea
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
            }}
          />
          <div data-review-panel-resize="timeline" role="separator" tabIndex={0} />
          <aside data-ui="gallery.videoReview.inspector">
            <details>
              <summary>Section</summary>
            </details>
            <button>Category</button>
          </aside>
        </ReviewDialog>
      )
    );
    expect(show).toHaveBeenCalledTimes(1);
    const dialog = host.querySelector('dialog')!;
    const button = host.querySelector('button')!;
    button.focus();
    button.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(dialog.dataset['playbackFocus']).toBeUndefined();
    expect(document.activeElement).toBe(button);
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(dialog.dataset['playbackFocus']).toBeUndefined();
    host
      .querySelector('textarea')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(dialog.dataset['playbackFocus']).toBeUndefined();
    button.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    button.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expect(dialog.dataset['playbackFocus']).toBe('true');
    const input = host.querySelector('textarea')!;
    input.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    input.focus();
    for (const key of ['1', 'ArrowLeft', 'Enter']) {
      input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      expect(dialog.dataset['playbackFocus']).toBe('true');
    }
    expect(document.activeElement).toBe(dialog);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(dialog.dataset['playbackFocus']).toBeUndefined();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(dialog.dataset['playbackFocus']).toBeUndefined();
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(dialog.dataset['playbackFocus']).toBeUndefined();
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(dialog.dataset['playbackFocus']).toBeUndefined();
    for (const control of host.querySelectorAll(
      'aside summary, aside button, [role="separator"]'
    )) {
      control.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
      expect(dialog.dataset['playbackFocus']).toBe('true');
      control.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      control.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      expect(dialog.dataset['playbackFocus']).toBeUndefined();
    }
  } finally {
    act(() => root.unmount());
    expect(close).toHaveBeenCalledTimes(1);
    host.remove();
    vi.unstubAllGlobals();
  }
});

it('cycles regions with F6 and leaves nested layers and modified keys alone', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.open = true;
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.open = false;
  });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    act(() =>
      root.render(
        <ReviewDialog>
          <div data-ui="gallery.videoReview.previewFrame">
            <button>Preview</button>
          </div>
          <div data-ui="gallery.videoReview.timeline">
            <div data-ui="gallery.videoReview.timePlane" tabIndex={0} />
          </div>
          <aside data-ui="gallery.videoReview.inspector">
            <button>Inspector</button>
          </aside>
        </ReviewDialog>
      )
    );
    const preview = host.querySelector('button')!;
    const plane = host.querySelector<HTMLElement>('[data-ui="gallery.videoReview.timePlane"]')!;
    const inspector = host.querySelector('aside button')!;
    const dialog = host.querySelector('dialog')!;
    preview.focus();
    preview.dispatchEvent(new KeyboardEvent('keydown', { key: 'F6', bubbles: true }));
    expect(document.activeElement).toBe(plane);
    plane.dispatchEvent(new KeyboardEvent('keydown', { key: 'F6', bubbles: true }));
    expect(document.activeElement).toBe(inspector);
    inspector.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'F6', shiftKey: true, bubbles: true })
    );
    expect(document.activeElement).toBe(plane);
    for (const modifier of [
      { altKey: true },
      { ctrlKey: true },
      { metaKey: true },
      { isComposing: true },
    ]) {
      plane.dispatchEvent(new KeyboardEvent('keydown', { key: 'F6', bubbles: true, ...modifier }));
      expect(document.activeElement).toBe(plane);
    }
    plane.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(dialog.dataset['playbackFocus']).toBe('true');
    const nested = document.createElement('div');
    nested.setAttribute('role', 'dialog');
    dialog.append(nested);
    nested.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(dialog.dataset['playbackFocus']).toBeUndefined();
    plane.dispatchEvent(new KeyboardEvent('keydown', { key: 'F6', bubbles: true }));
    expect(document.activeElement).toBe(plane);
    nested.remove();
  } finally {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
