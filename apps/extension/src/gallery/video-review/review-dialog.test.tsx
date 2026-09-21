// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { ReviewDialog } from './review-dialog';

it('retains focus during Space playback and restores keyboard modality on Tab', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const show = vi.fn();
  const close = vi.fn();
  HTMLDialogElement.prototype.showModal = show;
  HTMLDialogElement.prototype.close = close;
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    act(() =>
      root.render(
        <ReviewDialog>
          <button>Tool</button>
          <textarea />
        </ReviewDialog>
      )
    );
    expect(show).toHaveBeenCalledTimes(1);
    const dialog = host.querySelector('dialog')!;
    const button = host.querySelector('button')!;
    button.focus();
    button.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(dialog.dataset['playbackFocus']).toBe('true');
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
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(dialog.dataset['playbackFocus']).toBe('true');
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(dialog.dataset['playbackFocus']).toBeUndefined();
  } finally {
    act(() => root.unmount());
    expect(close).toHaveBeenCalledTimes(1);
    host.remove();
    vi.unstubAllGlobals();
  }
});
