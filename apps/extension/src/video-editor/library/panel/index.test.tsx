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
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('opens the media library as a modal drawer with a dismissible dimmed remainder', () => {
  renderPanel(true);

  const drawer = container?.querySelector('[data-ui="video-editor.library.drawer"]');
  const modal = drawer?.closest('.sniptale-modal');
  expect(drawer).not.toBeNull();
  expect(modal?.className).toContain('!bottom-0');
  expect((modal as HTMLElement | null)?.style.width).toContain('860px');
  expect(drawer?.getAttribute('aria-modal')).toBe('true');
  expect(container?.querySelector('.sniptale-modal-backdrop')).not.toBeNull();
  expect(container?.querySelector('.sniptale-modal-accent-sm')).toBeNull();
});

it('moves focus into the open drawer and restores its trigger on close', async () => {
  const trigger = document.createElement('button');
  document.body.appendChild(trigger);
  trigger.focus();
  renderPanel(true);

  await act(async () => Promise.resolve());
  expect(container?.contains(document.activeElement)).toBe(true);

  renderPanel(false);
  expect(document.activeElement).toBe(trigger);
  trigger.remove();
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
