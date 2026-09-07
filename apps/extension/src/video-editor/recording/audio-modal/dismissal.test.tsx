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

it('consumes Space without activating Cancel when there is no audio to audition', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  const onClose = vi.fn();
  act(() => root.render(<AudioRecordingModal isOpen onClose={onClose} onSave={vi.fn()} />));
  const cancel = Array.from(host.querySelectorAll('button')).find(
    (button) => button.textContent === 'common.actions.cancel'
  )!;
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, code: 'Space' });
  act(() => {
    cancel.dispatchEvent(event);
  });
  expect(event.defaultPrevented).toBe(true);
  expect(onClose).not.toHaveBeenCalled();
});

it('focuses the recorder, contains Tab and restores the opener when hidden', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  const opener = document.createElement('button');
  document.body.append(host, opener);
  opener.focus();
  root = createRoot(host);
  const onClose = vi.fn();
  const render = (isOpen: boolean) =>
    act(() =>
      root.render(<AudioRecordingModal isOpen={isOpen} onClose={onClose} onSave={vi.fn()} />)
    );
  try {
    render(true);
    const dialog = host.querySelector('[role="dialog"]');
    const close = host.querySelector<HTMLButtonElement>('.sniptale-modal-close')!;
    const cancel = [...host.querySelectorAll('button')].find(
      (button) => button.textContent === 'common.actions.cancel'
    )!;
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement).toBe(close);
    close.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Tab',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      })
    );
    expect(document.activeElement).toBe(cancel);
    cancel.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Tab',
        bubbles: true,
        cancelable: true,
      })
    );
    expect(document.activeElement).toBe(close);
    render(false);
    expect(document.activeElement).toBe(opener);
    render(true);
    expect(document.activeElement).toBe(host.querySelector('.sniptale-modal-close'));
    render(false);
  } finally {
    opener.remove();
  }
});
