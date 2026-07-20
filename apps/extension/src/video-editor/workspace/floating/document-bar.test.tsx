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
    saveStateMeta: { className: 'is-saved', label: 'Saved' },
  };
}

it('renders project identity and keeps export/library actions in the floating document bar', () => {
  const markup = renderToStaticMarkup(
    <VideoEditorFloatingDocumentBar header={createHeaderProps()} />
  );

  expect(markup).toContain('data-ui="video-editor.floating.document-bar"');
  expect(markup).toContain('Product Demo Recording');
  expect(markup).toContain('Saved');
  expect(markup).toContain('videoEditor.app.libraryButton');
  expect(markup).toContain('videoEditor.app.exportButton');
  expect(markup).not.toContain('data-ui="video-editor.floating.document-bar.menu"');
  expect(markup).not.toContain('title="videoEditor.app.title"');
  expect(markup).not.toContain('Sniptale');
});
