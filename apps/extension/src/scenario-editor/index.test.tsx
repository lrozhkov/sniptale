// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
const io = vi.hoisted(() => ({ bootstrap: vi.fn(), editor: vi.fn(), viewer: vi.fn() }));
vi.mock('../ui/page-bootstrap', () => ({ renderPageShell: io.bootstrap }));
vi.mock('./page-shell/ScenarioEditorPage', () => ({ ScenarioEditorPage: io.editor }));
vi.mock('./page-shell/viewer', () => ({ ScenarioViewerPage: io.viewer }));
vi.mock('./page-shell/layout-assistance', () => ({
  GuideLayoutAssistance: ({ children }: { children: ReactNode }) => children,
}));
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
    await act(async () => root.render(io.bootstrap.mock.calls[0]![0].element));
    expect(io.viewer).toHaveBeenCalled();
    expect(io.editor).not.toHaveBeenCalled();
    act(() => root.unmount());
  }
);
