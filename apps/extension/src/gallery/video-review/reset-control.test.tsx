// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { ReviewResetControl } from './reset-control';
vi.mock('../../platform/i18n', () => ({ translate: (key: string) => key }));
afterEach(() => {
  vi.unstubAllGlobals();
});

it('requires confirmation, isolates shortcuts, cancels with Escape and restores trigger focus', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('dialog');
  document.body.append(host);
  const root = createRoot(host);
  const reset = vi.fn(async () => undefined);
  const shortcut = vi.fn();
  window.addEventListener('keydown', shortcut);
  try {
    await act(async () =>
      root.render(
        <ReviewResetControl
          busy={false}
          cursor={2}
          autosaveEnabled
          onStart={async () => true}
          onReset={reset}
        />
      )
    );
    const trigger = host.querySelector('button')!;
    trigger.focus();
    await act(async () => trigger.click());
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[data-history-original]')!.click()
    );
    const dialog = host.querySelector('[role="alertdialog"]')!;
    expect(dialog.textContent).toContain('gallery.videoReview.resetOriginalWarning');
    expect(dialog.contains(document.activeElement)).toBe(true);
    await act(async () =>
      document.activeElement!.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true })
      )
    );
    expect(shortcut).not.toHaveBeenCalled();
    await act(async () =>
      document.activeElement!.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
      )
    );
    expect(reset).not.toHaveBeenCalled();
    expect(host.querySelector('[role="alertdialog"]')).toBeNull();
    expect(host.querySelector('[data-ui="gallery.videoReview.historyChoices"]')).not.toBeNull();
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[data-history-original]')!.click()
    );
    const cancel = host.querySelector<HTMLButtonElement>('.sniptale-confirm-actions button')!;
    await act(async () => cancel.click());
    expect(reset).not.toHaveBeenCalled();
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[data-history-original]')!.click()
    );
    const confirm = host.querySelector<HTMLButtonElement>(
      '.sniptale-confirm-actions button:last-child'
    )!;
    await act(async () => {
      confirm.click();
      confirm.click();
    });
    expect(reset).toHaveBeenCalledTimes(1);
    expect(host.querySelector('[role="alertdialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    await act(async () =>
      root.render(
        <ReviewResetControl
          busy
          cursor={2}
          autosaveEnabled
          onStart={async () => true}
          onReset={reset}
        />
      )
    );
    await act(async () => trigger.click());
    expect(host.querySelector('[role="alertdialog"]')).toBeNull();
  } finally {
    window.removeEventListener('keydown', shortcut);
    await act(async () => root.unmount());
    host.remove();
  }
});

it('keeps failed actions retryable, traps focus and discloses local reset', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('dialog');
  document.body.append(host);
  const root = createRoot(host);
  const start = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  const reset = vi.fn(async () => false);
  const render = async (cursor: number) =>
    act(async () =>
      root.render(
        <ReviewResetControl
          busy={false}
          cursor={cursor}
          autosaveEnabled={false}
          onStart={start}
          onReset={reset}
        />
      )
    );
  try {
    await render(2);
    const trigger = host.querySelector('button')!;
    await act(async () => trigger.click());
    const first = host.querySelector<HTMLButtonElement>('[data-history-start]')!;
    const last = host.querySelector<HTMLButtonElement>('[data-history-original]')!;
    expect(document.activeElement).toBe(first);
    await act(async () =>
      first.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Tab',
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        })
      )
    );
    expect(document.activeElement).toBe(last);
    await act(async () => {
      first.click();
      first.click();
    });
    expect(start).toHaveBeenCalledTimes(1);
    expect(first.isConnected).toBe(true);
    await act(async () => first.click());
    expect(start).toHaveBeenCalledTimes(2);
    expect(document.activeElement).toBe(trigger);
    await render(0);
    await act(async () => trigger.click());
    expect(host.querySelector<HTMLButtonElement>('[data-history-start]')!.disabled).toBe(true);
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[data-history-original]')!.click()
    );
    expect(host.querySelector('[role="alertdialog"]')!.textContent).toContain(
      'gallery.videoReview.resetOriginalLocalWarning'
    );
    await act(async () =>
      host.querySelector<HTMLButtonElement>('.sniptale-confirm-actions button:last-child')!.click()
    );
    expect(host.querySelector('[role="alertdialog"]')).not.toBeNull();
    await act(async () =>
      host.querySelector<HTMLButtonElement>('.sniptale-confirm-actions button')!.click()
    );
    await act(async () => document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })));
    expect(host.querySelector('[data-ui="gallery.videoReview.historyChoices"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
