// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { CompactWorkspaceColorPanel } from './compact-workspace-content';
import { createInspectorCommandParams } from '../../../../../../tooling/test/harness/editor/ownership/fixtures';
import { translate } from '../../../platform/i18n';

it('places Make Default in the Background row and retains its existing save owner', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  const params = createInspectorCommandParams();
  try {
    act(() =>
      root.render(
        <CompactWorkspaceColorPanel
          params={
            {
              ...params,
              workspaceColorMatchesDefault: false,
              workspaceDefaultSavePending: false,
            } as never
          }
        />
      )
    );
    const row = host.querySelector('[data-ui="editor.workspace.background-default-row"]')!;
    expect(row.className).toContain('grid-cols-[minmax(0,1fr)_auto]');
    const button = Array.from(row.querySelectorAll('button')).find(
      (node) => node.getAttribute('aria-label') === translate('editor.compact.workspaceMakeDefault')
    )!;
    expect(button).toBeDefined();
    act(() => button.click());
    expect(params.saveWorkspaceColorAsDefault).toHaveBeenCalledOnce();
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});
