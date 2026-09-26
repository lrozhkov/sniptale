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
    await act(async () => root.render(<ReviewResetControl busy={false} onReset={reset} />));
    const trigger = host.querySelector('button')!;
    trigger.focus();
    await act(async () => trigger.click());
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
    expect(document.activeElement).toBe(trigger);
    await act(async () => trigger.click());
    const cancel = host.querySelector<HTMLButtonElement>('.sniptale-confirm-actions button')!;
    await act(async () => cancel.click());
    expect(reset).not.toHaveBeenCalled();
    await act(async () => trigger.click());
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
    await act(async () => root.render(<ReviewResetControl busy onReset={reset} />));
    await act(async () => trigger.click());
    expect(host.querySelector('[role="alertdialog"]')).toBeNull();
  } finally {
    window.removeEventListener('keydown', shortcut);
    await act(async () => root.unmount());
    host.remove();
  }
});
