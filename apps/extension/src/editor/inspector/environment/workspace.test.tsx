// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  gridMock: vi.fn(),
  useAppLocaleMock: vi.fn(() => 'en'),
  workspaceMock: vi.fn(),
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  useAppLocale: mocks.useAppLocaleMock,
}));

vi.mock('./disclosure', () => ({
  WorkspacePanelBody: (props: any) => {
    mocks.workspaceMock(props);
    return <div data-testid="workspace-panel">workspace</div>;
  },
}));

vi.mock('../grid/disclosure', () => ({
  GridPanelBody: (props: any) => {
    mocks.gridMock(props);
    return <div data-testid="grid-panel">grid</div>;
  },
}));

import { EditorInspectorGridPanelContent, EditorInspectorWorkspacePanelContent } from './workspace';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function render(node: React.ReactNode) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(node);
  });
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.clearAllMocks();
});

describe('workspace and grid panel wrappers', () => {
  it('forwards props into workspace and grid bodies', () => {
    render(
      <>
        <EditorInspectorWorkspacePanelContent
          applyWorkspaceColor={vi.fn()}
          palette={['#111111']}
          previewWorkspaceColor={vi.fn()}
          recentColors={['#ffffff']}
          saveWorkspaceColorAsDefault={vi.fn()}
          workspaceBackgroundColor="#111111"
          workspaceColorError={null}
          workspaceColorMatchesDefault={false}
          workspaceDefaultSavePending={false}
        />
        <EditorInspectorGridPanelContent
          applyGridColor={vi.fn()}
          clampGridSize={vi.fn()}
          gridColor="#111111"
          gridEnabled
          gridPalette={['#ffffff']}
          gridSize={12}
          gridSizeMax={32}
          gridSizeMin={4}
          gridSnapEnabled
          recentColors={[]}
          updateWorkspace={vi.fn()}
        />
      </>
    );

    expect(mocks.workspaceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        saveWorkspaceColorAsDefault: expect.any(Function),
        workspaceColorError: null,
        workspaceColorMatchesDefault: false,
        workspaceDefaultSavePending: false,
      })
    );
    expect(mocks.gridMock).toHaveBeenCalledWith(expect.objectContaining({ gridSize: 12 }));
    expect(mocks.useAppLocaleMock).toHaveBeenCalledTimes(2);
  });
});
