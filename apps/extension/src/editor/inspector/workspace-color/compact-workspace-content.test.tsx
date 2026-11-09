// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { CompactWorkspaceColorPanel } from './compact-workspace-content';
import { createInspectorCommandParams } from '../../../../../../tooling/test/harness/editor/ownership/fixtures';
import { DEFAULT_EDITOR_WORKSPACE_SETTINGS } from '../../../features/editor/document/constants';
import { translate } from '../../../platform/i18n';

it('restores only the workspace background through the existing immediate color owner', () => {
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
              workspace: { ...params.workspace, backgroundColor: '#abcdef' },
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
      (node) => node.getAttribute('aria-label') === translate('editor.compact.workspaceResetColor')
    )!;
    expect(button).toBeDefined();
    act(() => button.click());
    expect(params.applyWorkspaceColor).toHaveBeenCalledExactlyOnceWith(
      DEFAULT_EDITOR_WORKSPACE_SETTINGS.backgroundColor
    );
    expect(params.saveWorkspaceColorAsDefault).not.toHaveBeenCalled();
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});
