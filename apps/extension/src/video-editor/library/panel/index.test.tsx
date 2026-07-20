// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { VideoEditorLibraryPanel } from './index';

vi.mock('./body', () => ({
  VideoEditorLibraryPanelBody: () => <div data-ui="video-editor.library.body" />,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  root?.unmount();
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('opens the media library as a full-height left drawer without a modal backdrop', () => {
  renderPanel(true);

  const drawer = container?.querySelector('[data-ui="video-editor.library.drawer"]');
  expect(drawer).not.toBeNull();
  expect(drawer?.className).toContain('fixed bottom-0 left-0 top-0');
  expect(drawer?.className).toContain('w-[min(760px,calc(100vw-24px))]');
  expect(drawer?.className).toContain('rounded-r-[14px]');
  expect(container?.querySelector('.sniptale-modal-backdrop')).toBeNull();
});

it('renders nothing while the drawer is closed', () => {
  renderPanel(false);

  expect(container?.querySelector('[data-ui="video-editor.library.drawer"]')).toBeNull();
});

function renderPanel(isOpen: boolean) {
  act(() => {
    root?.render(
      <VideoEditorLibraryPanel
        activeProjectId=""
        diagnosticsContent={null}
        diagnosticsOpen={false}
        isOpen={isOpen}
        onAddRecording={vi.fn()}
        onClose={vi.fn()}
        onCreateProject={vi.fn()}
        onDeleteProject={vi.fn()}
        onImportAudio={vi.fn()}
        onImportImage={vi.fn()}
        onImportVideo={vi.fn()}
        onOpenAudioRecordingDialog={vi.fn()}
        onOpenProject={vi.fn()}
        onToggleDiagnostics={vi.fn()}
        projects={[]}
        recordingId={null}
        recordings={[]}
      />
    );
  });
}
