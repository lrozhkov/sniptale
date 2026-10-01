// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { WorkspaceDefaultAction } from './default-action';
import { translate } from '../../../platform/i18n';

it('keeps the compact default action accessible with saving, default and failure states', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  const save = vi.fn();
  const render = (isPending: boolean, matchesDefault: boolean, error: string | null = null) =>
    act(() =>
      root.render(
        <WorkspaceDefaultAction
          variant="compact"
          error={error}
          isPending={isPending}
          matchesDefault={matchesDefault}
          onSaveAsDefault={save}
        />
      )
    );
  try {
    render(false, false);
    const button = host.querySelector('button')!;
    expect(button.getAttribute('aria-label')).toBe(
      translate('editor.compact.workspaceMakeDefault')
    );
    expect(button.className).not.toContain('w-full');
    act(() => button.click());
    expect(save).toHaveBeenCalledOnce();
    render(true, false);
    expect(button.disabled).toBe(true);
    expect(button.textContent).toBe(translate('common.states.saving'));
    expect(button.getAttribute('aria-label')).toBe(
      translate('editor.compact.workspaceMakeDefault')
    );
    act(() => button.click());
    expect(save).toHaveBeenCalledOnce();
    render(false, true);
    expect(button.disabled).toBe(true);
    render(false, false, 'Cannot save default');
    expect(button.disabled).toBe(false);
    expect(host.querySelector('[role="alert"]')?.textContent).toBe('Cannot save default');
    expect(host.querySelector('[role="alert"]')?.className).toContain('col-span-2');
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});
