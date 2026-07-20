// @vitest-environment jsdom

import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ProjectsSection, RecordingsSection } from './lists';
import type { ProjectListItem, RecordingListItem } from '../contracts/items';

vi.mock('../../../platform/i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../platform/i18n')>();
  return {
    ...actual,
    formatDateTime: () => 'formatted-date',
    formatNumber: (value: number) => String(value),
    translate: (key: string) => key,
  };
});

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createProject(overrides: Partial<ProjectListItem> = {}): ProjectListItem {
  return {
    clipCount: 2,
    createdAt: 1,
    duration: 10,
    height: 720,
    id: 'project-1',
    name: 'Project',
    thumbnailId: 'video-project:project-1',
    thumbnailSourceMediaId: null,
    trackCount: 3,
    updatedAt: 2,
    width: 1280,
    ...overrides,
  };
}

function createRecording(overrides: Partial<RecordingListItem> = {}): RecordingListItem {
  return {
    createdAt: 1,
    duration: null,
    filename: 'clip.webm',
    height: null,
    id: 'recording-1',
    mimeType: 'video/webm',
    size: 1024,
    thumbnailId: 'recording:recording-1',
    width: null,
    ...overrides,
  };
}

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

it('keeps project and recording lists in bounded internal scroll regions', () => {
  act(() => {
    root?.render(
      <>
        <ProjectsSection
          activeProjectId="project-1"
          hasQuery={false}
          onDeleteProject={vi.fn()}
          onOpenProject={vi.fn()}
          projects={[createProject()]}
          projectRemainder={[createProject()]}
          recentProjects={[]}
          thumbnails={{}}
        />
        <RecordingsSection
          hasQuery={false}
          onAddRecording={vi.fn()}
          recordingRemainder={[createRecording()]}
          recordings={[createRecording()]}
          recentRecordings={[]}
          thumbnails={{}}
        />
      </>
    );
  });

  expect(container?.querySelector('[data-ui="projects-scroll"]')?.className).toContain('max-h-');
  expect(container?.querySelector('[data-ui="recordings-scroll"]')?.className).toContain(
    'overflow-y-auto'
  );
});

it('renders generated thumbnail URLs in dense library rows', () => {
  act(() => {
    root?.render(
      <ProjectsSection
        activeProjectId="project-x"
        hasQuery={false}
        onDeleteProject={vi.fn()}
        onOpenProject={vi.fn()}
        projects={[createProject()]}
        projectRemainder={[createProject()]}
        recentProjects={[]}
        thumbnails={{ 'video-project:project-1': { status: 'ready', url: 'blob:project-1' } }}
      />
    );
  });

  expect(container?.querySelector('img')?.getAttribute('src')).toBe('blob:project-1');
});

it('shows a media preview pane and switches it from the selected recording row', () => {
  act(() => {
    root?.render(
      <RecordingsSection
        hasQuery={false}
        onAddRecording={vi.fn()}
        recordingRemainder={[
          createRecording({ id: 'recording-1', filename: 'first.webm' }),
          createRecording({
            id: 'recording-2',
            filename: 'second.webm',
            thumbnailId: 'recording:recording-2',
          }),
        ]}
        recordings={[
          createRecording({ id: 'recording-1', filename: 'first.webm' }),
          createRecording({
            id: 'recording-2',
            filename: 'second.webm',
            thumbnailId: 'recording:recording-2',
          }),
        ]}
        recentRecordings={[]}
        thumbnails={{
          'recording:recording-1': { status: 'ready', url: 'blob:first' },
          'recording:recording-2': { status: 'ready', url: 'blob:second' },
        }}
      />
    );
  });

  expect(container?.querySelector('[data-ui="video-editor.library.media-preview"]')).not.toBeNull();
  expect(container?.textContent).toContain('first.webm');

  act(() => {
    Array.from(container?.querySelectorAll('[role="button"]') ?? [])
      .find((node) => node.textContent?.includes('second.webm'))
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });

  expect(
    container
      ?.querySelector('[data-ui="video-editor.library.media-preview"] img')
      ?.getAttribute('src')
  ).toBe('blob:second');
});
