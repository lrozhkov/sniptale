// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { WorkspacePanelCloseButton } from './index';

it('keeps the shared panel close control named, focusable and connected to its owner', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const onClose = vi.fn();
  try {
    act(() =>
      root.render(
        <WorkspacePanelCloseButton dataUi="panel-close" title="Close inspector" onClose={onClose} />
      )
    );
    const button = host.querySelector<HTMLButtonElement>('[data-ui="panel-close"]')!;
    expect(button.getAttribute('aria-label')).toBe('Close inspector');
    expect(button.type).toBe('button');
    button.focus();
    expect(document.activeElement).toBe(button);
    expect(onClose).not.toHaveBeenCalled();
    act(() => button.click());
    expect(onClose).toHaveBeenCalledOnce();
  } finally {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
