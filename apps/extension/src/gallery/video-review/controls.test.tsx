// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { ReviewButton } from './controls';

it('composes caller handlers with command pressure and preserves toolbar caption discovery', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const run = vi.fn();
  const down = vi.fn((event: React.PointerEvent<HTMLButtonElement>) => event.preventDefault());
  try {
    act(() =>
      root.render(
        <ReviewButton label="Undo" toolbarLabel="Undo" chrome onClick={run} onPointerDown={down}>
          <svg />
        </ReviewButton>
      )
    );
    const button = host.querySelector('button')!;
    act(() => button.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 })));
    expect(down).toHaveBeenCalledTimes(1);
    expect(button.dataset['pressing']).toBe('true');
    expect(run).not.toHaveBeenCalled();
    expect(
      button.querySelector('.review-command-content [data-review-toolbar-label]')?.textContent
    ).toBe('Undo');
    expect(button.dataset['commandChrome']).toBe('true');
    act(() => window.dispatchEvent(new Event('blur')));
    expect(button.dataset['pressing']).toBeUndefined();
    act(() => button.click());
    expect(run).toHaveBeenCalledTimes(1);
  } finally {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
