// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const browserPanelContentMock = vi.hoisted(() => vi.fn(() => <div>browser-panel</div>));
const gridPanelContentMock = vi.hoisted(() => vi.fn(() => <div>grid-panel</div>));
const workspacePanelContentMock = vi.hoisted(() => vi.fn(() => <div>workspace-panel</div>));
const metaPanelContentMock = vi.hoisted(() => vi.fn(() => <div>meta-panel</div>));

vi.mock('./browser-frame', () => ({
  EditorInspectorBrowserFramePanelContent: browserPanelContentMock,
}));

vi.mock('./workspace', () => ({
  EditorInspectorGridPanelContent: gridPanelContentMock,
  EditorInspectorWorkspacePanelContent: workspacePanelContentMock,
}));

vi.mock('./meta', () => ({
  EditorInspectorMetaPanelContent: metaPanelContentMock,
}));

import {
  EditorInspectorBrowserFramePanel,
  EditorInspectorGridPanel,
  EditorInspectorMetaPanel,
  EditorInspectorWorkspacePanel,
} from './';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it('forwards browser-frame props into the panel content owner', () => {
  const syncBrowserFrame = vi.fn();
  const insertOrUpdateBrowserFrame = vi.fn();

  act(() => {
    root?.render(
      <EditorInspectorBrowserFramePanel
        browserCanvasModeOptions={[]}
        browserContentModeOptions={[]}
        browserFrame={{
          canvasMode: 'resize',
          contentMode: 'push-down',
          title: 'Title',
          url: 'https://sniptale.dev',
        }}
        insertOrUpdateBrowserFrame={insertOrUpdateBrowserFrame}
        syncBrowserFrame={syncBrowserFrame}
      />
    );
  });

  expect(browserPanelContentMock).toHaveBeenCalledWith(
    expect.objectContaining({
      insertOrUpdateBrowserFrame,
      syncBrowserFrame,
    }),
    undefined
  );
});

it('forwards workspace, grid, and meta props into their canonical owners', () => {
  act(() => {
    root?.render(
      <>
        <EditorInspectorWorkspacePanel
          applyWorkspaceColor={vi.fn()}
          palette={['#fff']}
          previewWorkspaceColor={vi.fn()}
          recentColors={['#111111']}
          saveWorkspaceColorAsDefault={vi.fn()}
          workspaceBackgroundColor="#fff"
          workspaceColorError={null}
          workspaceColorMatchesDefault={false}
          workspaceDefaultSavePending={false}
        />
        <EditorInspectorGridPanel
          applyGridColor={vi.fn()}
          clampGridSize={(value) => value}
          gridColor="#ccc"
          gridEnabled
          gridPalette={['#ccc']}
          gridSize={12}
          gridSizeMax={32}
          gridSizeMin={4}
          gridSnapEnabled={false}
          recentColors={['#111111']}
          updateWorkspace={vi.fn()}
        />
        <EditorInspectorMetaPanel />
      </>
    );
  });

  expect(workspacePanelContentMock).toHaveBeenCalled();
  expect(gridPanelContentMock).toHaveBeenCalled();
  expect(metaPanelContentMock).toHaveBeenCalled();
});
