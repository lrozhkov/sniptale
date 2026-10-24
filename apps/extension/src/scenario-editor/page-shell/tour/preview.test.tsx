// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { createTranslator } from '../../../platform/i18n';
import { TourPreview } from './preview';
import { stubTourPreviewDialog } from './preview.test-support';

it('keeps the scene mounted and gives nested dialogs their own Escape', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const restore = stubTourPreviewDialog();
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const close = vi.fn();
  const replay = vi.fn();
  const render = (active: boolean) =>
    root.render(
      <TourPreview active={active} onClose={close} onReplay={replay} t={createTranslator('en')}>
        <div data-scene>
          <dialog open>
            <button>Nested</button>
          </dialog>
        </div>
      </TourPreview>
    );
  try {
    await act(async () => render(false));
    const scene = host.querySelector('[data-scene]');
    await act(async () => render(true));
    expect(host.querySelector('[data-scene]')).toBe(scene);
    const nested = host.querySelector('dialog dialog button')!;
    nested.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(close).not.toHaveBeenCalled();
    host
      .querySelector('.tour-preview-player')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(close).toHaveBeenCalledTimes(1);
    host.querySelectorAll<HTMLButtonElement>('.tour-preview-header button')[1]!.click();
    expect(replay).toHaveBeenCalledTimes(1);
    await act(async () => render(false));
    expect(host.querySelector('[data-scene]')).toBe(scene);
    expect(host.querySelector('.tour-preview-header')!.hasAttribute('hidden')).toBe(true);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    restore();
    vi.unstubAllGlobals();
  }
});
