import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { VideoEditorFloatingDocumentBar } from './document-bar';

const hookMocks = vi.hoisted(() => ({ header: vi.fn(), history: vi.fn() }));

vi.mock('../../runtime/controller/composition/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../runtime/controller/composition/hooks')>()),
  useVideoEditorHeaderController: () => hookMocks.header(),
  useVideoEditorHistoryController: () => hookMocks.history(),
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

function createHeaderProps() {
  return {
    grid: { magnetEnabled: true, onToggleMagnet: vi.fn() },
    inspectorMode: 'selection' as const,
    libraryPanelOpen: false,
    leftSidebarCollapsed: false,
    onCloseLibraryPanel: vi.fn(),
    onOpenAudioRecordingDialog: vi.fn(),
    onOpenExportDialog: vi.fn(),
    onOpenLibraryPanel: vi.fn(),
    onRenameProject: vi.fn(),
    onSelectScene: vi.fn(),
    onToggleLibraryPanel: vi.fn(),
    onToggleSidebar: vi.fn(),
    projectExportsCount: 2,
    projectName: 'Product Demo Recording',
    saveStateMeta: { className: 'is-saved', label: 'Saved', state: 'saved' as const },
  };
}

it('renders editable project identity without duplicated workspace commands', () => {
  hookMocks.header.mockReturnValue(createHeaderProps());
  hookMocks.history.mockReturnValue({
    canUndo: false,
    canRedo: false,
    error: null,
    onUndo: vi.fn(),
    onRedo: vi.fn(),
  });
  const markup = renderToStaticMarkup(<VideoEditorFloatingDocumentBar />);

  expect(markup).toContain('data-ui="video-editor.floating.document-bar"');
  expect(markup).toContain('Product Demo Recording');
  expect(markup).not.toContain('Saved');
  expect(markup).not.toContain('videoEditor.app.libraryButton');
  expect(markup).not.toContain('videoEditor.app.exportButton');
  expect(markup).not.toContain('lucide-pencil');
  expect(markup).not.toContain('video-editor.floating.document-bar.undo');
  expect(markup).not.toContain('video-editor.floating.document-bar.redo');
  expect(markup).not.toContain('data-ui="video-editor.floating.document-bar.menu"');
  expect(markup).not.toContain('title="videoEditor.app.title"');
  expect(markup).not.toContain('Sniptale');
});

it('enables available history commands and surfaces history failures', () => {
  hookMocks.header.mockReturnValue(createHeaderProps());
  hookMocks.history.mockReturnValue({
    canUndo: true,
    canRedo: false,
    error: 'snapshotFailed',
    onUndo: vi.fn(),
    onRedo: vi.fn(),
  });
  const markup = renderToStaticMarkup(<VideoEditorFloatingDocumentBar />);

  expect(markup).toContain('role="alert"');
  expect(markup).toContain('videoEditor.app.historyError');
});

it('exposes an explicit retry action for an autosave error', () => {
  hookMocks.header.mockReturnValue({
    ...createHeaderProps(),
    saveStateMeta: { className: 'is-error', label: 'Error', state: 'error' },
  });
  hookMocks.history.mockReturnValue({
    canUndo: false,
    canRedo: false,
    error: null,
    onUndo: vi.fn(),
    onRedo: vi.fn(),
  });
  const markup = renderToStaticMarkup(<VideoEditorFloatingDocumentBar />);

  expect(markup).toContain('common.actions.retry');
  expect(markup).toContain('<button');
});

it.each(['dirty', 'saving', 'saved', 'idle'])(
  'keeps routine %s persistence state out of the toolbar',
  (state) => {
    hookMocks.header.mockReturnValue({
      ...createHeaderProps(),
      saveStateMeta: { state, label: 'Routine save state', className: '' },
    });
    hookMocks.history.mockReturnValue({
      canUndo: false,
      canRedo: false,
      error: null,
      onUndo: vi.fn(),
      onRedo: vi.fn(),
    });
    const markup = renderToStaticMarkup(<VideoEditorFloatingDocumentBar />);
    expect(markup).not.toContain('Routine save state');
    expect(markup).not.toContain('role="alert"');
  }
);
