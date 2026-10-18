import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import { getDefaultExportSettings } from '../../../features/video/project/timeline/meta';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { VideoEditorFloatingInspectorStack } from './inspector-stack';

const { contentSpy } = vi.hoisted(() => ({
  contentSpy: vi.fn(),
}));
const hookMocks = vi.hoisted(() => ({ collapsed: false, exportOpen: false }));

vi.mock('../../runtime/controller/composition/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../runtime/controller/composition/hooks')>()),
  useVideoEditorSidebarController: () => ({}),
  useVideoEditorOverlaysController: () => ({
    exportDialog: {
      isOpen: hookMocks.exportOpen,
      settings: getDefaultExportSettings(createEmptyVideoProject()),
      sourceDimensions: { width: 1920, height: 1080 },
    },
  }),
  useWorkspaceLayoutContext: () => ({ leftSidebarCollapsed: hookMocks.collapsed }),
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('../surface/sidebar-props', () => ({
  getWorkspaceSidebarProps: () => ({
    activeProjectId: 'project-1',
    gridSettings: {},
    inspectorMode: 'selection',
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

vi.mock('../../export/dialog', () => ({
  ExportSettingsPanel: () => <div data-ui="mock-export-settings" />,
}));

vi.mock('../sidebar/view', () => ({
  WorkspaceSidebarHeader: () => <div data-ui="mock-context-inspector-header" />,
  getSelectionMeta: () => ({ icon: null, label: 'Scene', title: 'Scene properties' }),
}));

it('hides the context inspector when the inspector rail state is collapsed', () => {
  hookMocks.collapsed = true;
  const markup = renderToStaticMarkup(
    <VideoEditorFloatingInspectorStack
      onClose={vi.fn()}
      resize={{
        width: 344,
        min: 280,
        max: 520,
        onDoubleClick: vi.fn(),
        onPointerDown: vi.fn(),
        onKeyDown: vi.fn(),
      }}
    />
  );

  expect(markup).toBe('');
  expect(contentSpy).not.toHaveBeenCalled();
});

it('renders a context inspector surface without introducing a layers panel', () => {
  hookMocks.collapsed = false;
  const markup = renderToStaticMarkup(
    <VideoEditorFloatingInspectorStack
      onClose={vi.fn()}
      resize={{
        width: 344,
        min: 280,
        max: 520,
        onDoubleClick: vi.fn(),
        onPointerDown: vi.fn(),
        onKeyDown: vi.fn(),
      }}
    />
  );

  expect(markup).toContain('data-ui="video-editor.floating.context-inspector"');
  expect(markup).toContain('data-ui="mock-context-inspector-header"');
  expect(markup).toContain('data-ui="mock-context-inspector-content"');
  expect(markup).toContain('data-ui="video-editor.floating.context-inspector.resize"');
  expect(markup).toContain('role="separator"');
  expect(markup).toContain('width:344px');
  expect(markup).toContain('aria-valuenow="344"');
  expect(markup).not.toContain('layers');
  expect(contentSpy.mock.calls[0]?.[0]).toEqual(
    expect.objectContaining({
      inputRefs: expect.any(Object),
      onToggleProjectsOpen: expect.any(Function),
    })
  );
});

it('places export in the existing inspector while retaining inert selection content', () => {
  hookMocks.collapsed = false;
  hookMocks.exportOpen = true;
  try {
    const markup = renderToStaticMarkup(
      <VideoEditorFloatingInspectorStack
        onClose={vi.fn()}
        resize={{
          width: 344,
          min: 280,
          max: 520,
          onDoubleClick: vi.fn(),
          onPointerDown: vi.fn(),
          onKeyDown: vi.fn(),
        }}
      />
    );
    expect(markup).toContain('mock-export-settings');
    expect(markup).toContain('mock-context-inspector-content');
    expect(markup).toContain('hidden=""');
    expect(markup).toContain('inert=""');
    expect(markup).not.toContain('role="dialog"');
  } finally {
    hookMocks.exportOpen = false;
  }
});
