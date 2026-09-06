// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { AudioRecordingModal } from './index';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));
let root: ReturnType<typeof createRoot>;
let host: HTMLDivElement;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  vi.unstubAllGlobals();
});
it.each(['backdrop', 'Escape'])(
  'keeps recording dialog open after %s; explicit Cancel closes',
  (input) => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    const onClose = vi.fn();
    act(() => root.render(<AudioRecordingModal isOpen onClose={onClose} onSave={vi.fn()} />));
    act(() => {
      if (input === 'backdrop')
        host.querySelector<HTMLElement>('.sniptale-modal-backdrop')!.click();
      else
        window.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true })
        );
    });
    expect(onClose).not.toHaveBeenCalled();
    act(() =>
      Array.from(host.querySelectorAll('button'))
        .find((button) => button.textContent === 'common.actions.cancel')!
        .click()
    );
    expect(onClose).toHaveBeenCalledOnce();
  }
);
