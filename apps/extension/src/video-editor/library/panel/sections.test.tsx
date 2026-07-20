import type React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import {
  CurrentProjectStrip,
  DiagnosticsSection,
  ImportSection,
  LibraryPanelTabs,
} from './sections';

vi.mock('../../../platform/i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../platform/i18n')>();
  return {
    ...actual,
    translate: (key: string) => key,
  };
});

function createProject(): React.ComponentProps<typeof CurrentProjectStrip>['projects'][number] {
  return {
    id: 'project-1',
    name: 'Current project',
    duration: 10,
    updatedAt: 1,
    createdAt: 1,
    width: 1280,
    height: 720,
    clipCount: 2,
    trackCount: 3,
    thumbnailId: 'video-project:project-1',
    thumbnailSourceMediaId: null,
  };
}

function countDataUi(markup: string, dataUi: string): number {
  return markup.split(`data-ui="${dataUi}"`).length - 1;
}

it('renders library panel sections through shared editor primitives', () => {
  const markup = renderToStaticMarkup(
    <>
      <CurrentProjectStrip activeProjectId="project-1" projects={[createProject()]} />
      <LibraryPanelTabs
        activeTab="media"
        diagnosticsAvailable
        projectsCount={2}
        recordingsCount={3}
        onTabChange={() => undefined}
      />
      <ImportSection
        onCreateProject={() => undefined}
        onImportAudio={() => undefined}
        onImportImage={() => undefined}
        onImportVideo={() => undefined}
        onRecordAudio={() => undefined}
      />
      <DiagnosticsSection
        diagnosticsContent={<div>diagnostics</div>}
        diagnosticsOpen={false}
        onToggleDiagnostics={() => undefined}
        recordingId="recording-1"
      />
    </>
  );

  expect(countDataUi(markup, 'video-editor.library.current-project')).toBe(1);
  expect(countDataUi(markup, 'video-editor.library.import-tab')).toBe(1);
  expect(countDataUi(markup, 'video-editor.library.diagnostics-tab')).toBe(1);
  expect(countDataUi(markup, 'shared.ui.compact-inspector.option-row')).toBe(1);
  expect(countDataUi(markup, 'video-editor.sidebar.library-action')).toBe(5);
  expect(markup).toContain('inline-flex h-10 min-h-10');
  expect(markup).not.toContain('border-b border-[color:var(--sniptale-color-border-subtle)]');
  expect(markup).not.toContain('rounded-[16px]');
  expect(markup).not.toContain('videoEditor.sidebar.libraryWorkflowTitle');
});
