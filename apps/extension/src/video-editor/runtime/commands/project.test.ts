import { beforeEach, describe, expect, it, vi } from 'vitest';
import { translate } from '../../../platform/i18n';
import { VideoTimelinePlacementMode } from '../../../features/video/project/types';
import type { UseVideoEditorActionHandlersParams } from './types';
import { createInitialExportState } from '../../state/export-state';

const mockCreateBlankProject = vi.fn();
const mockDeletePersistedProject = vi.fn();
const mockOpenPersistedProject = vi.fn();

vi.mock('../../project/operations/ops', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../project/operations/ops')>()),
  createBlankProject: mockCreateBlankProject,
  deletePersistedProject: mockDeletePersistedProject,
  openPersistedProject: mockOpenPersistedProject,
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

function createProjectHandlerParams(): UseVideoEditorActionHandlersParams {
  return {
    project: createCurrentProject(),
    currentTime: 0,
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
    exportState: createInitialExportState(),
    libraries: {
      projects: [],
      recordings: [],
      projectExports: [],
      refreshProjects: vi.fn().mockResolvedValue(undefined),
      refreshRecordings: vi.fn().mockResolvedValue(undefined),
      refreshProjectExports: vi.fn().mockResolvedValue(undefined),
    },
    applyLoadedProject: vi.fn(),
    setError: vi.fn(),
    upsertAsset: vi.fn(),
    addAssetClip: vi.fn(),
    moveClip: vi.fn(),
    trimClipEnd: vi.fn(),
    trimClipStart: vi.fn(),
    startExport: vi.fn(),
    failExportCancellation: vi.fn(),
    failExport: vi.fn(),
    cancelExport: vi.fn(),
  };
}

describe('deleteProjectWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('skips deletion when the user cancels the confirm dialog', async () => {
    const { deleteProjectWorkspace } = await import('./project');
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
    const { deleteProjectWorkspace } = await import('./project');
    const params = createProjectHandlerParams();
    const requestConfirm = vi.fn().mockResolvedValue(true);
    mockDeletePersistedProject.mockResolvedValue([]);

    await deleteProjectWorkspace('other-project', params, requestConfirm);

    expect(mockDeletePersistedProject).toHaveBeenCalledWith('other-project');
    expect(params.libraries.refreshProjects).toHaveBeenCalledTimes(1);
    expect(mockOpenPersistedProject).not.toHaveBeenCalled();
    expect(mockCreateBlankProject).not.toHaveBeenCalled();
  });
});
