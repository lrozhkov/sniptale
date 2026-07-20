// @vitest-environment jsdom

import React, { createRef } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PROJECT_VIDEO_ACCEPT_ATTRIBUTE } from '../../project/operations/import-validation';
import { VideoEditorLibraryPanelBody } from './body';

vi.mock('../../../platform/i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../platform/i18n')>();
  return {
    ...actual,
    formatDateTime: () => 'formatted-date',
    formatNumber: (value: number) => String(value),
    translate: (key: string) => key,
  };
});

vi.mock('./thumbnails/use-thumbnails', () => ({
  useLibraryThumbnails: () => ({
    'recording:recording-1': { status: 'ready', url: 'blob:recording-1' },
    'video-project:project-2': { status: 'ready', url: 'blob:project-2' },
  }),
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createProject(
  overrides: Partial<
    React.ComponentProps<typeof VideoEditorLibraryPanelBody>['projects'][number]
  > = {}
) {
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
    ...overrides,
  };
}

function createRecording(
  overrides: Partial<
    React.ComponentProps<typeof VideoEditorLibraryPanelBody>['recordings'][number]
  > = {}
) {
  return {
    id: 'recording-1',
    filename: 'clip.webm',
    createdAt: 1,
    size: 1024,
    mimeType: 'video/webm',
    duration: null,
    width: null,
    height: null,
    thumbnailId: 'recording:recording-1',
    ...overrides,
  };
}

function createProps(
  overrides: Partial<React.ComponentProps<typeof VideoEditorLibraryPanelBody>> = {}
): React.ComponentProps<typeof VideoEditorLibraryPanelBody> {
  return {
    activeProjectId: 'project-1',
    diagnosticsContent: <div>diagnostics-content</div>,
    diagnosticsOpen: false,
    inputRefs: {
      audioInputRef: createRef<HTMLInputElement>(),
      imageInputRef: createRef<HTMLInputElement>(),
      videoInputRef: createRef<HTMLInputElement>(),
    },
    onAddRecording: vi.fn(),
    onClose: vi.fn(),
    onCreateProject: vi.fn().mockResolvedValue(undefined),
    onDeleteProject: vi.fn(),
    onImportAudio: vi.fn(),
    onImportImage: vi.fn(),
    onImportVideo: vi.fn(),
    onOpenAudioRecordingDialog: vi.fn(),
    onOpenProject: vi.fn().mockResolvedValue(undefined),
    onToggleDiagnostics: vi.fn(),
    projects: [
      createProject(),
      createProject({
        id: 'project-2',
        name: 'Second project',
        duration: 20,
        updatedAt: 2,
        createdAt: 2,
        thumbnailId: 'video-project:project-2',
      }),
    ],
    recordingId: 'recording-1',
    recordings: [createRecording()],
    ...overrides,
  };
}

function renderBody(
  overrides: Partial<React.ComponentProps<typeof VideoEditorLibraryPanelBody>> = {}
) {
  const props = createProps(overrides);

  act(() => {
    root?.render(<VideoEditorLibraryPanelBody {...props} />);
  });

  return props;
}

function queryButton(label: string) {
  return Array.from(container?.querySelectorAll('button') ?? []).find(
    (button) => !button.hasAttribute('disabled') && button.textContent?.includes(label)
  );
}

async function clickButton(label: string) {
  await act(async () => {
    queryButton(label)?.click();
    await Promise.resolve();
  });
}

async function changeInput(accept: string, file: File) {
  const input = container?.querySelector(`input[accept="${accept}"]`) as HTMLInputElement | null;
  if (!input) {
    throw new Error(`Missing input for ${accept}`);
  }

  Object.defineProperty(input, 'files', {
    configurable: true,
    value: [file],
  });

  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await Promise.resolve();
  });
}

async function updateSearchQuery(value: string) {
  const input = container?.querySelector(
    'input[placeholder="videoEditor.sidebar.librarySearchPlaceholder"]'
  );
  if (!(input instanceof HTMLInputElement)) {
    throw new Error('Missing library search input');
  }

  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;

  await act(async () => {
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('renders a compact left-drawer library with tabs instead of stacked guidance cards', () => {
  renderBody();

  expect(
    container?.querySelector('[data-ui="video-editor.library.current-project"]')
  ).not.toBeNull();
  expect(container?.textContent).toContain('videoEditor.app.mediaButton');
  expect(container?.textContent).toContain('videoEditor.sidebar.projectsTitle');
  expect(container?.textContent).toContain('videoEditor.sidebar.libraryImportTab');
  expect(container?.textContent).toContain('videoEditor.sidebar.recordingsTitle');
  expect(container?.querySelector('[data-ui="video-editor.library.media-preview"]')).not.toBeNull();
  expect(
    container
      ?.querySelector('[data-ui="video-editor.library.media-preview"] img')
      ?.getAttribute('src')
  ).toBe('blob:recording-1');
  expect(container?.textContent).not.toContain('videoEditor.sidebar.libraryWorkflowTitle');
  expect(container?.textContent).not.toContain('videoEditor.sidebar.libraryProjectOwnedHint');
  expect(container?.querySelector('[data-ui="video-editor.library.tab-body"]')).not.toBeNull();
});

it('opens the add tab with compact import actions', async () => {
  renderBody();

  await clickButton('videoEditor.sidebar.libraryImportTab');

  const newProjectButton = queryButton('videoEditor.sidebar.toolbarNew');
  expect(newProjectButton?.className).toContain('w-full');
  expect(newProjectButton?.className).toContain('justify-start');
});

it('opens another project and closes the panel after the async handler resolves', async () => {
  const props = renderBody();

  await clickButton('videoEditor.sidebar.projectsTitle');
  await clickButton('videoEditor.sidebar.openButton');

  expect(props.onOpenProject).toHaveBeenCalledWith('project-2');
  expect(props.onClose).toHaveBeenCalledTimes(1);
});

it('adds a recording into the current project and closes the panel', async () => {
  const props = renderBody();

  await clickButton('videoEditor.sidebar.addToTimeline');

  expect(props.onAddRecording).toHaveBeenCalledWith('recording-1');
  expect(props.onClose).toHaveBeenCalledTimes(1);
});

it('imports a selected video file into the current project and closes the panel', async () => {
  const props = renderBody();

  await changeInput(
    PROJECT_VIDEO_ACCEPT_ATTRIBUTE,
    new File(['video'], 'clip.webm', { type: 'video/webm' })
  );

  expect(props.onImportVideo).toHaveBeenCalledWith(expect.objectContaining({ name: 'clip.webm' }));
  expect(props.onClose).toHaveBeenCalledTimes(1);
});

it('shows recent library groups when enough saved items exist', () => {
  renderBody({
    recordings: [
      createRecording({ id: 'recording-1', filename: 'clip-1.webm', createdAt: 5 }),
      createRecording({ id: 'recording-2', filename: 'clip-2.webm', createdAt: 4 }),
      createRecording({ id: 'recording-3', filename: 'clip-3.webm', createdAt: 3 }),
      createRecording({ id: 'recording-4', filename: 'clip-4.webm', createdAt: 2 }),
      createRecording({ id: 'recording-5', filename: 'clip-5.webm', createdAt: 1 }),
    ],
  });

  expect(container?.textContent).toContain('videoEditor.sidebar.libraryRecentRecordingsTitle');
  expect(container?.textContent).toContain('videoEditor.sidebar.libraryAllRecordingsTitle');
  expect(container?.textContent).not.toContain('videoEditor.sidebar.libraryRecentProjectsTitle');
});

it('filters projects and recordings by the search query', async () => {
  renderBody({
    projects: [
      createProject(),
      createProject({ id: 'project-2', name: 'Alpha release', duration: 20, updatedAt: 2 }),
      createProject({ id: 'project-3', name: 'Beta notes', duration: 30, updatedAt: 3 }),
    ],
    recordings: [
      createRecording({ id: 'recording-1', filename: 'alpha-demo.webm', createdAt: 2 }),
      createRecording({ id: 'recording-2', filename: 'beta-demo.webm', createdAt: 1 }),
    ],
  });

  await updateSearchQuery('beta');

  expect(container?.textContent).toContain('beta-demo.webm');
  expect(container?.textContent).not.toContain('alpha-demo.webm');

  await clickButton('videoEditor.sidebar.projectsTitle');

  expect(container?.textContent).toContain('Beta notes');
  expect(container?.textContent).not.toContain('Alpha release');
  expect(container?.textContent).not.toContain('videoEditor.sidebar.libraryRecentProjectsTitle');
  expect(container?.textContent).not.toContain('videoEditor.sidebar.libraryRecentRecordingsTitle');
});
