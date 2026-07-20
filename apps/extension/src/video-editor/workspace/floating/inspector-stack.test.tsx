import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { VideoEditorFloatingInspectorStack } from './inspector-stack';

const { contentSpy } = vi.hoisted(() => ({
  contentSpy: vi.fn(),
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

function createController(params: { collapsed: boolean }) {
  return {
    header: {
      leftSidebarCollapsed: params.collapsed,
    },
  } as never;
}

it('hides the context inspector when the inspector rail state is collapsed', () => {
  const markup = renderToStaticMarkup(
    <VideoEditorFloatingInspectorStack controller={createController({ collapsed: true })} />
  );

  expect(markup).toBe('');
  expect(contentSpy).not.toHaveBeenCalled();
});

it('renders a context inspector surface without introducing a layers panel', () => {
  const markup = renderToStaticMarkup(
    <VideoEditorFloatingInspectorStack controller={createController({ collapsed: false })} />
  );

  expect(markup).toContain('data-ui="video-editor.floating.context-inspector"');
  expect(markup).toContain('data-ui="mock-context-inspector-header"');
  expect(markup).toContain('data-ui="mock-context-inspector-content"');
  expect(markup).not.toContain('layers');
  expect(contentSpy.mock.calls[0]?.[0]).toEqual(
    expect.objectContaining({
      diagnosticsMeta: expect.any(String),
      inputRefs: expect.any(Object),
      onToggleProjectsOpen: expect.any(Function),
    })
  );
});
