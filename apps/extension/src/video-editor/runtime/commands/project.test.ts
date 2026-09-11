import { beforeEach, describe, expect, it, vi } from 'vitest';
import { translate } from '../../../platform/i18n';
import { VideoTimelinePlacementMode } from '../../../features/video/project/types';
import type { ProjectHandlerPort } from './types';
import { createProjectWorkspace, deleteProjectWorkspace, loadProjectWorkspace } from './project';

const {
  mockCopyProject,
  mockCreateBlankProject,
  mockDeletePersistedProject,
  mockOpenPersistedProject,
  mockWaitForVideoEditorSave,
} = vi.hoisted(() => ({
  mockCopyProject: vi.fn(),
  mockCreateBlankProject: vi.fn(),
  mockDeletePersistedProject: vi.fn(),
  mockOpenPersistedProject: vi.fn(),
  mockWaitForVideoEditorSave: vi.fn(),
}));

vi.mock('../../project/operations/ops', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../project/operations/ops')>()),
  copyProject: mockCopyProject,
  createBlankProject: mockCreateBlankProject,
  deletePersistedProject: mockDeletePersistedProject,
  openPersistedProject: mockOpenPersistedProject,
}));

vi.mock('../session/save-readiness', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../session/save-readiness')>()),
  waitForVideoEditorSave: mockWaitForVideoEditorSave,
}));

function createProjectListItem(overrides: {
  createdAt: number;
  duration: number;
  id: string;
  name: string;
  updatedAt: number;
}) {
  return {
    width: 1920,
    height: 1080,
    clipCount: 0,
    trackCount: 0,
    thumbnailId: `video-project:${overrides.id}`,
    thumbnailSourceMediaId: null,
    ...overrides,
  };
}

function createCurrentProject() {
  return {
    version: 2 as const,
    id: 'current-project',
    name: 'Current',
    source: { kind: 'manual' as const },
    baseRecordingId: null,
    width: 1920,
    height: 1080,
    duration: 1000,
    backgroundColor: '#000000',
    fps: 30,
    timelinePlacementMode: VideoTimelinePlacementMode.RIPPLE_PUSH,
    createdAt: 1,
    updatedAt: 1,
    assets: [],
    tracks: [],
    clips: [],
    cursorTrack: null,
    actionEvents: [],
  };
}

function createProjectHandlerParams(): ProjectHandlerPort {
  const project = createCurrentProject();
  return {
    getCurrentProject: () => project,
    projects: [
      createProjectListItem({
        id: 'current-project',
        name: 'Current',
        duration: 1000,
        updatedAt: 1,
        createdAt: 1,
      }),
      createProjectListItem({
        id: 'other-project',
        name: 'Project B',
        duration: 800,
        updatedAt: 2,
        createdAt: 2,
      }),
    ],
    libraries: {
      refreshProjects: vi.fn().mockResolvedValue(undefined),
      refreshProjectExports: vi.fn().mockResolvedValue(undefined),
    },
    applyLoadedProject: vi.fn(),
    setError: vi.fn(),
  };
}

describe('deleteProjectWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWaitForVideoEditorSave.mockResolvedValue(undefined);
  });

  it('skips deletion when the user cancels the confirm dialog', async () => {
    const params = createProjectHandlerParams();
    const requestConfirm = vi.fn().mockResolvedValue(false);

    await deleteProjectWorkspace('other-project', params, requestConfirm);

    expect(requestConfirm).toHaveBeenCalledWith({
      title: translate('common.actions.delete'),
      message:
        `${translate('common.actions.delete')} ` +
        `${translate('videoEditor.app.deleteProjectPromptMiddle')} "Project B"?`,
      confirmText: translate('common.actions.delete'),
      cancelText: translate('common.actions.cancel'),
    });
    expect(mockDeletePersistedProject).not.toHaveBeenCalled();
    expect(params.libraries.refreshProjects).not.toHaveBeenCalled();
  });

  it('deletes non-active projects after confirm and refreshes the project list', async () => {
    const params = createProjectHandlerParams();
    const requestConfirm = vi.fn().mockResolvedValue(true);
    mockDeletePersistedProject.mockResolvedValue([]);

    await deleteProjectWorkspace('other-project', params, requestConfirm);

    expect(mockDeletePersistedProject).toHaveBeenCalledWith('other-project');
    expect(params.libraries.refreshProjects).toHaveBeenCalledTimes(1);
    expect(mockOpenPersistedProject).not.toHaveBeenCalled();
    expect(mockCreateBlankProject).not.toHaveBeenCalled();
  });

  it('waits for the active project save before opening another project', async () => {
    const params = createProjectHandlerParams();
    const nextProject = { ...createCurrentProject(), id: 'other-project', name: 'Project B' };
    mockOpenPersistedProject.mockResolvedValue(nextProject);
    await loadProjectWorkspace('other-project', params);

    expect(mockWaitForVideoEditorSave).toHaveBeenCalledWith('current-project');
    expect(mockOpenPersistedProject).toHaveBeenCalledWith('other-project');
    expect(params.applyLoadedProject).toHaveBeenCalledWith(nextProject, null);
    expect(mockWaitForVideoEditorSave.mock.invocationCallOrder[0]).toBeLessThan(
      mockOpenPersistedProject.mock.invocationCallOrder[0] ?? 0
    );
  });

  it('keeps the active project open when its pending save fails', async () => {
    const params = createProjectHandlerParams();
    mockWaitForVideoEditorSave.mockRejectedValue(new Error('Unsaved changes'));
    await expect(loadProjectWorkspace('other-project', params)).rejects.toThrow('Unsaved changes');

    expect(mockOpenPersistedProject).not.toHaveBeenCalled();
    expect(params.applyLoadedProject).not.toHaveBeenCalled();
  });

  it('applies only the latest project when different opens resolve out of order', async () => {
    const params = createProjectHandlerParams();
    const resolvers = new Map<string, (project: ReturnType<typeof createCurrentProject>) => void>();
    mockOpenPersistedProject.mockImplementation(
      (projectId: string) =>
        new Promise((resolve) => {
          resolvers.set(projectId, resolve);
        })
    );

    const first = loadProjectWorkspace('other-project', params);
    await Promise.resolve();
    const second = loadProjectWorkspace('latest-project', params);
    await Promise.resolve();
    resolvers.get('latest-project')?.({
      ...createCurrentProject(),
      id: 'latest-project',
      name: 'Latest',
    });
    await second;
    resolvers.get('other-project')?.({
      ...createCurrentProject(),
      id: 'other-project',
      name: 'Older',
    });
    await first;

    expect(params.applyLoadedProject).toHaveBeenCalledTimes(1);
    expect(params.applyLoadedProject).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'latest-project' }),
      null
    );
    expect(params.libraries.refreshProjects).toHaveBeenCalledTimes(1);
  });
});

describe('createProjectWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWaitForVideoEditorSave.mockResolvedValue(undefined);
  });
  it('waits for save and durable creation before switching', async () => {
    const port = createProjectHandlerParams();
    let saved!: () => void;
    mockWaitForVideoEditorSave.mockReturnValue(
      new Promise<void>((resolve) => {
        saved = resolve;
      })
    );
    const next = { ...createCurrentProject(), id: 'new' };
    let created!: (value: typeof next) => void;
    mockCreateBlankProject.mockReturnValue(
      new Promise((resolve) => {
        created = resolve;
      })
    );
    const task = createProjectWorkspace(port, '  New  ');
    expect(mockCreateBlankProject).not.toHaveBeenCalled();
    expect(port.applyLoadedProject).not.toHaveBeenCalled();
    saved();
    await Promise.resolve();
    expect(mockCreateBlankProject).toHaveBeenCalledWith('New');
    expect(port.applyLoadedProject).not.toHaveBeenCalled();
    created(next);
    await task;
    expect(port.applyLoadedProject).toHaveBeenCalledWith(next, null);
  });
  it('copies the current document with the requested name', async () => {
    const port = createProjectHandlerParams();
    const copy = { ...createCurrentProject(), id: 'copy' };
    mockCopyProject.mockResolvedValue(copy);
    await createProjectWorkspace(port, 'Copy', true);
    expect(mockCopyProject).toHaveBeenCalledWith(port.getCurrentProject(), 'Copy');
    expect(port.applyLoadedProject).toHaveBeenCalledWith(copy, null);
  });
  it.each(['save', 'create'])('keeps current project when %s fails', async (stage) => {
    const port = createProjectHandlerParams();
    if (stage === 'save') mockWaitForVideoEditorSave.mockRejectedValueOnce(new Error('save'));
    else mockCreateBlankProject.mockRejectedValueOnce(new Error('create'));
    await expect(createProjectWorkspace(port, 'New')).rejects.toThrow(stage);
    expect(port.applyLoadedProject).not.toHaveBeenCalled();
  });
  it('rejects an empty name before doing work', async () => {
    const port = createProjectHandlerParams();
    await expect(createProjectWorkspace(port, '  ')).rejects.toThrow();
    expect(mockWaitForVideoEditorSave).not.toHaveBeenCalled();
    expect(port.applyLoadedProject).not.toHaveBeenCalled();
  });
});

it('does not report creation failure after the project has been committed and opened', async () => {
  const port = createProjectHandlerParams();
  const next = { ...createCurrentProject(), id: 'new' };
  mockWaitForVideoEditorSave.mockResolvedValue(undefined);
  mockCreateBlankProject.mockResolvedValue(next);
  vi.mocked(port.libraries.refreshProjects).mockRejectedValue(new Error('list unavailable'));
  await expect(createProjectWorkspace(port, 'New')).resolves.toBeUndefined();
  expect(port.applyLoadedProject).toHaveBeenCalledWith(next, null);
});
