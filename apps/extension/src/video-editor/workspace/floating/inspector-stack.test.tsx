import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import { getDefaultExportSettings } from '../../../features/video/project/timeline/meta';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';
import { VideoEditorFloatingInspectorStack } from './inspector-stack';

const { contentSpy } = vi.hoisted(() => ({
  contentSpy: vi.fn(),
}));
const hookMocks = vi.hoisted(() => ({ collapsed: false, exportOpen: false }));
const recognition = vi.hoisted(() => ({ recognize: vi.fn() }));
const voice = vi.hoisted(() => ({
  recording: {
    confirmation: {
      open: false,
      cancel: vi.fn(),
      confirm: vi.fn(),
      request: vi.fn(),
      isPending: () => false,
    },
  },
}));
const voiceHook = vi.hoisted(() => vi.fn(() => voice));
vi.mock('../../runtime/session/text-voice', () => ({ useVideoProjectTextVoice: voiceHook }));
const rewrite = vi.hoisted(() => ({ start: vi.fn() }));
const rewriteHook = vi.hoisted(() => vi.fn(() => rewrite));
vi.mock('../../runtime/session/text-rewrite', () => ({
  useVideoProjectTextRewrite: rewriteHook,
}));
vi.mock('../../runtime/session/recognition', () => ({
  useVideoProjectRecognition: () => recognition,
}));

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

beforeEach(() => {
  contentSpy.mockClear();
  rewriteHook.mockClear();
  voiceHook.mockClear();
  hookMocks.collapsed = false;
  hookMocks.exportOpen = false;
});

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

  expect(markup).not.toContain('video-editor.floating.context-inspector');
  expect(markup).not.toContain('role="alertdialog"');
  expect(voiceHook).toHaveBeenCalledExactlyOnceWith({ clips: [], tracks: [] }, false);
  expect(contentSpy).not.toHaveBeenCalled();
  expect(rewriteHook).toHaveBeenCalledExactlyOnceWith({ clips: [], tracks: [] });
});

it('passes the mounted recognition controller into the actual floating inspector content', () => {
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
  expect(voiceHook).toHaveBeenCalledExactlyOnceWith({ clips: [], tracks: [] }, true);
  expect(markup).toContain('aria-valuenow="344"');
  expect(markup).not.toContain('layers');
  expect(contentSpy.mock.calls[0]?.[0]).toEqual(
    expect.objectContaining({
      inputRefs: expect.any(Object),
      recognition,
      textRewrite: rewrite,
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
    expect(voiceHook).toHaveBeenCalledExactlyOnceWith({ clips: [], tracks: [] }, false);
    expect(markup).toContain('mock-context-inspector-content');
    expect(markup).toContain('hidden=""');
    expect(markup).toContain('inert=""');
    expect(markup).not.toContain('role="dialog"');
    expect(rewriteHook).toHaveBeenCalledExactlyOnceWith({ clips: [], tracks: [] });
    expect(contentSpy.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ textRewrite: rewrite })
    );
  } finally {
    hookMocks.exportOpen = false;
  }
});
