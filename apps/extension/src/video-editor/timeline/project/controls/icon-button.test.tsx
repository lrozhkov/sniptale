// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { TimelineIconButton } from './icon-button';

it('preserves its focused trigger while opening a dependent surface', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  let opener: Element | null = null;
  try {
    act(() =>
      root.render(
        <TimelineIconButton
          title="Record"
          icon={null}
          onClick={() => {
            opener = document.activeElement;
          }}
        />
      )
    );
    const button = host.querySelector('button')!;
    button.focus();
    act(() => button.click());
    expect(opener).toBe(button);
    expect(document.activeElement).toBe(button);
  } finally {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
