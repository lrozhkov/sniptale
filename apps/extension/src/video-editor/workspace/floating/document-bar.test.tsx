import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { VideoEditorFloatingDocumentBar } from './document-bar';

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
    onOpenGridSettings: vi.fn(),
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

it('renders project identity and keeps export/library actions in the floating document bar', () => {
  const markup = renderToStaticMarkup(
    <VideoEditorFloatingDocumentBar
      header={createHeaderProps()}
      history={{ canUndo: false, canRedo: false, error: null, onUndo: vi.fn(), onRedo: vi.fn() }}
    />
  );

  expect(markup).toContain('data-ui="video-editor.floating.document-bar"');
  expect(markup).toContain('Product Demo Recording');
  expect(markup).toContain('Saved');
  expect(markup).toContain('videoEditor.app.libraryButton');
  expect(markup).toContain('videoEditor.app.exportButton');
  expect(markup).toContain('video-editor.floating.document-bar.undo');
  expect(markup).toContain('video-editor.floating.document-bar.redo');
  expect(markup.match(/disabled/g)).toHaveLength(2);
  expect(markup).not.toContain('data-ui="video-editor.floating.document-bar.menu"');
  expect(markup).not.toContain('title="videoEditor.app.title"');
  expect(markup).not.toContain('Sniptale');
});

it('enables available history commands and surfaces history failures', () => {
  const markup = renderToStaticMarkup(
    <VideoEditorFloatingDocumentBar
      header={{
        ...createHeaderProps(),
      }}
      history={{
        canUndo: true,
        canRedo: false,
        error: 'snapshotFailed',
        onUndo: vi.fn(),
        onRedo: vi.fn(),
      }}
    />
  );

  expect(markup).toContain('role="alert"');
  expect(markup).toContain('videoEditor.app.historyError');
});

it('exposes an explicit retry action for an autosave error', () => {
  const markup = renderToStaticMarkup(
    <VideoEditorFloatingDocumentBar
      header={{
        ...createHeaderProps(),
        saveStateMeta: { className: 'is-error', label: 'Error', state: 'error' },
      }}
      history={{ canUndo: false, canRedo: false, error: null, onUndo: vi.fn(), onRedo: vi.fn() }}
    />
  );

  expect(markup).toContain('common.actions.retry');
  expect(markup).toContain('<button');
});
