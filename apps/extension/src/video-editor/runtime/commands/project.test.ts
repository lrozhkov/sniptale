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
  mockPrepareCheckpointExit,
  mockRequestCheckpointExit,
} = vi.hoisted(() => ({
  mockCopyProject: vi.fn(),
  mockCreateBlankProject: vi.fn(),
  mockDeletePersistedProject: vi.fn(),
  mockOpenPersistedProject: vi.fn(),
  mockWaitForVideoEditorSave: vi.fn(),
  mockPrepareCheckpointExit: vi.fn(),
  mockRequestCheckpointExit: vi.fn(),
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
  prepareVideoEditorCheckpointExit: mockPrepareCheckpointExit,
}));

vi.mock('../../../platform/runtime-messaging/sync-product-client', () => ({
  createSyncProductClient: () => ({ requestCheckpointExit: mockRequestCheckpointExit }),
}));

beforeEach(() => {
  mockPrepareCheckpointExit.mockImplementation(async (projectId: string) => {
    await mockWaitForVideoEditorSave(projectId);
    return { receipt: null, isCurrent: () => true };
  });
  mockRequestCheckpointExit.mockResolvedValue({ kind: 'checkpoint-exit', outcome: 'requested' });
});

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
    await vi.waitFor(() => expect(resolvers.has('other-project')).toBe(true));
    const second = loadProjectWorkspace('latest-project', params);
    await vi.waitFor(() => expect(resolvers.has('latest-project')).toBe(true));
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
    await vi.waitFor(() => expect(mockCreateBlankProject).toHaveBeenCalledWith('New'));
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

it.each(['open', 'create', 'delete'] as const)(
  'preserves the current project when recording admission refuses %s',
  async (action) => {
    vi.clearAllMocks();
    const beforeLeave = vi.fn(async () => false);
    const port = { ...createProjectHandlerParams(), beforeLeave };
    if (action === 'open') await loadProjectWorkspace('other-project', port);
    else if (action === 'create') await createProjectWorkspace(port, 'New');
    else await deleteProjectWorkspace('current-project', port, async () => true);
    expect(beforeLeave).toHaveBeenCalledOnce();
    expect(mockWaitForVideoEditorSave).not.toHaveBeenCalled();
    expect(mockOpenPersistedProject).not.toHaveBeenCalled();
    expect(mockCreateBlankProject).not.toHaveBeenCalled();
    expect(mockDeletePersistedProject).not.toHaveBeenCalled();
    expect(port.applyLoadedProject).not.toHaveBeenCalled();
  }
);

describe('checkpoint exit during project transitions', () => {
  const receipt = {
    rootKind: 'video-project' as const,
    rootId: 'current-project',
    revision: '11111111-1111-4111-8111-111111111111',
  };
  beforeEach(() => {
    vi.clearAllMocks();
    mockWaitForVideoEditorSave.mockResolvedValue(undefined);
    mockOpenPersistedProject.mockResolvedValue({ ...createCurrentProject(), id: 'other-project' });
    mockCreateBlankProject.mockResolvedValue({ ...createCurrentProject(), id: 'new-project' });
  });

  it('submits exact saved receipt before target opening', async () => {
    const port = createProjectHandlerParams();
    let release!: () => void;
    mockPrepareCheckpointExit.mockResolvedValue({ receipt, isCurrent: () => true });
    mockRequestCheckpointExit.mockReturnValue(
      new Promise<void>((resolve) => {
        release = resolve;
      })
    );
    const task = loadProjectWorkspace('other-project', port);
    await vi.waitFor(() => expect(mockRequestCheckpointExit).toHaveBeenCalledWith(receipt));
    expect(mockOpenPersistedProject).not.toHaveBeenCalled();
    release();
    await task;
    expect(port.applyLoadedProject).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'other-project' }),
      null
    );
  });

  it.each(['edit', 'replacement', 'rejection'] as const)(
    'refuses %s during held exit request',
    async (change) => {
      const port = createProjectHandlerParams();
      let current = true;
      let release!: () => void;
      let reject!: (error: Error) => void;
      mockPrepareCheckpointExit.mockResolvedValue({ receipt, isCurrent: () => current });
      mockRequestCheckpointExit.mockReturnValue(
        new Promise<void>((resolve, refuse) => {
          release = resolve;
          reject = refuse;
        })
      );
      const task = loadProjectWorkspace('other-project', port);
      await vi.waitFor(() => expect(mockRequestCheckpointExit).toHaveBeenCalledOnce());
      current = false;
      if (change === 'replacement')
        port.getCurrentProject = () => ({ ...createCurrentProject(), id: 'replacement' });
      if (change === 'rejection') reject(new Error('transport unavailable'));
      else release();
      await task;
      expect(mockOpenPersistedProject).not.toHaveBeenCalled();
      expect(port.applyLoadedProject).not.toHaveBeenCalled();
    }
  );

  it('permits retry after advisory rejection only for current witness', async () => {
    const port = createProjectHandlerParams();
    mockPrepareCheckpointExit.mockResolvedValue({ receipt, isCurrent: () => true });
    mockRequestCheckpointExit.mockRejectedValue(new Error('transport unavailable'));
    await loadProjectWorkspace('other-project', port);
    await loadProjectWorkspace('other-project', port);
    expect(mockRequestCheckpointExit).toHaveBeenCalledTimes(2);
    expect(mockRequestCheckpointExit).toHaveBeenNthCalledWith(2, receipt);
    expect(port.applyLoadedProject).toHaveBeenCalledTimes(2);
  });

  it('waits for pending local save before exit request', async () => {
    const port = createProjectHandlerParams();
    let saved!: () => void;
    mockPrepareCheckpointExit.mockImplementation(async () => {
      await new Promise<void>((resolve) => {
        saved = resolve;
      });
      return { receipt, isCurrent: () => true };
    });
    const task = createProjectWorkspace(port, 'New');
    expect(mockRequestCheckpointExit).not.toHaveBeenCalled();
    expect(mockCreateBlankProject).not.toHaveBeenCalled();
    saved();
    await task;
    expect(mockRequestCheckpointExit).toHaveBeenCalledWith(receipt);
    expect(port.applyLoadedProject).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'new-project' }),
      null
    );
  });

  it('skips RPC for clean source without receipt', async () => {
    const port = createProjectHandlerParams();
    await createProjectWorkspace(port, 'New');
    expect(mockRequestCheckpointExit).not.toHaveBeenCalled();
    expect(port.applyLoadedProject).toHaveBeenCalledOnce();
  });

  it('refuses stale witness after target creation', async () => {
    const port = createProjectHandlerParams();
    let current = true;
    let created!: (project: ReturnType<typeof createCurrentProject>) => void;
    mockPrepareCheckpointExit.mockResolvedValue({ receipt: null, isCurrent: () => current });
    mockCreateBlankProject.mockReturnValue(
      new Promise((resolve) => {
        created = resolve;
      })
    );
    const task = createProjectWorkspace(port, 'New');
    await vi.waitFor(() => expect(mockCreateBlankProject).toHaveBeenCalledOnce());
    current = false;
    created({ ...createCurrentProject(), id: 'new-project' });
    await task;
    expect(port.applyLoadedProject).not.toHaveBeenCalled();
  });

  it('guards same-project replacement', async () => {
    const port = createProjectHandlerParams();
    mockPrepareCheckpointExit.mockResolvedValue({ receipt, isCurrent: () => false });
    await loadProjectWorkspace('current-project', port);
    expect(mockOpenPersistedProject).not.toHaveBeenCalled();
    expect(mockRequestCheckpointExit).not.toHaveBeenCalled();
  });
});
