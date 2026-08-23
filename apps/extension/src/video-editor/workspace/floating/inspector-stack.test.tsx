import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { VideoEditorFloatingInspectorStack } from './inspector-stack';

const { contentSpy } = vi.hoisted(() => ({
  contentSpy: vi.fn(),
}));
const hookMocks = vi.hoisted(() => ({ collapsed: false }));

vi.mock('../../runtime/controller/composition/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../runtime/controller/composition/hooks')>()),
  useVideoEditorSidebarController: () => ({}),
  useWorkspaceLayoutContext: () => ({ leftSidebarCollapsed: hookMocks.collapsed }),
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('../surface/sidebar-props', () => ({
  getWorkspaceSidebarProps: () => ({
    activeProjectId: 'project-1',
    diagnosticsContent: null,
    diagnosticsOpen: false,
    gridSettings: {},
    inspectorMode: 'selection',
    onToggleDiagnostics: vi.fn(),
    project: { clips: [], tracks: [] },
    projects: [],
    recordingId: null,
    recordings: [],
    selectedClip: null,
    selectedTrack: null,
    selection: { kind: 'scene' },
  }),
}));

vi.mock('../sidebar/panel-content', () => ({
  WorkspaceSidebarPanelContent: (props: unknown) => {
    contentSpy(props);
    return <div data-ui="mock-context-inspector-content" />;
  },
}));

vi.mock('../sidebar/view', () => ({
  WorkspaceSidebarHeader: () => <div data-ui="mock-context-inspector-header" />,
  getSelectionMeta: () => ({ icon: null, label: 'Scene', title: 'Scene properties' }),
}));

it('hides the context inspector when the inspector rail state is collapsed', () => {
  hookMocks.collapsed = true;
  const markup = renderToStaticMarkup(
    <VideoEditorFloatingInspectorStack diagnosticsContent={null} />
  );

  expect(markup).toBe('');
  expect(contentSpy).not.toHaveBeenCalled();
});

it('renders a context inspector surface without introducing a layers panel', () => {
  hookMocks.collapsed = false;
  const markup = renderToStaticMarkup(
    <VideoEditorFloatingInspectorStack diagnosticsContent={null} />
  );

  expect(markup).toContain('data-ui="video-editor.floating.context-inspector"');
  expect(markup).toContain('data-ui="mock-context-inspector-header"');
  expect(markup).toContain('data-ui="mock-context-inspector-content"');
  expect(markup).toContain('data-ui="video-editor.floating.context-inspector.resize"');
  expect(markup).toContain('role="separator"');
  expect(markup).not.toContain('layers');
  expect(contentSpy.mock.calls[0]?.[0]).toEqual(
    expect.objectContaining({
      diagnosticsMeta: expect.any(String),
      inputRefs: expect.any(Object),
      onToggleProjectsOpen: expect.any(Function),
    })
  );
});
