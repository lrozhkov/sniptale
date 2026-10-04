// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
const io = vi.hoisted(() => ({
  bootstrap: vi.fn(),
  editor: vi.fn(),
  viewer: vi.fn(),
  prepare: vi.fn(),
}));
vi.mock('../ui/page-bootstrap', () => ({ renderPageShell: io.bootstrap }));
vi.mock('./page-shell/ScenarioEditorPage', () => ({ ScenarioEditorPage: io.editor }));
vi.mock('./page-shell/viewer', () => ({ ScenarioViewerPage: io.viewer }));
vi.mock('./page-shell/layout-assistance', () => ({
  GuideLayoutAssistance: ({ children }: { children: ReactNode }) => children,
}));
// Keep the real route parser without loading unrelated export and persistence graphs.
vi.mock('../composition/persistence/scenario/projects/viewing', () => ({
  readScenarioViewingAsset: io.prepare,
  readScenarioViewingSnapshot: io.prepare,
}));
vi.mock('../composition/persistence/scenario/export-artifacts', () => ({
  readScenarioHtmlArtifact: io.prepare,
}));
vi.mock('./page-shell/runtime/html-export', () => ({ prepareGuideHtml: io.prepare }));
vi.mock('./page-shell/runtime/tour-html', () => ({ prepareTourHtml: io.prepare }));
afterEach(() => vi.unstubAllGlobals());
it.each(['guide', 'tour', 'invalid'])(
  'routes %s without mounting editor state or autosave',
  async (view) => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.resetModules();
    vi.clearAllMocks();
    history.replaceState({}, '', `/?projectId=p&view=${view}`);
    await import('./index');
    const host = document.createElement('div');
    const root = createRoot(host);
    try {
      await act(async () => root.render(io.bootstrap.mock.calls[0]![0].element));
      expect(io.viewer.mock.calls[0]?.[0].route).toEqual(
        view === 'invalid' ? { mode: 'invalid' } : { mode: view, projectId: 'p' }
      );
      expect(io.editor).not.toHaveBeenCalled();
      expect(io.prepare).not.toHaveBeenCalled();
    } finally {
      act(() => root.unmount());
    }
  }
);
