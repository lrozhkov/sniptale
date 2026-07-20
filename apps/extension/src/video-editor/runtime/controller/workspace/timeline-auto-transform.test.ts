import { expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
import { DEFAULT_VIDEO_AUTO_PROCESSING_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { VideoAutoProcessingAction } from '@sniptale/runtime-contracts/video/types/types';
import { createAutoTransformRecordingAction } from './timeline-auto-transform';

const { autoTransformRecordingProjectMock } = vi.hoisted(() => ({
  autoTransformRecordingProjectMock: vi.fn(),
}));

vi.mock('../../../project/operations/auto-transform', () => ({
  autoTransformRecordingProject: autoTransformRecordingProjectMock,
}));

function createStore(project = createEmptyVideoProject('Timeline actions')) {
  const authority = { project };
  const store = {
    project,
    recordingId: 'recording-1',
    setError: vi.fn(),
    updateProject: vi.fn((updater: (currentProject: typeof project) => typeof project) => {
      authority.project = updater(authority.project);
    }),
  };
  return { authority, store };
}

function createRemoveSettings() {
  return {
    ...DEFAULT_VIDEO_AUTO_PROCESSING_SETTINGS,
    enabled: true,
    stableSegments: {
      ...DEFAULT_VIDEO_AUTO_PROCESSING_SETTINGS.stableSegments,
      action: VideoAutoProcessingAction.REMOVE,
    },
  };
}

it('passes wizard settings into the recording auto-transform action', async () => {
  const { authority, store } = createStore();
  const settings = createRemoveSettings();
  const nextProject = { ...store.project, name: 'Transformed' };

  autoTransformRecordingProjectMock.mockResolvedValue(nextProject);
  createAutoTransformRecordingAction(store)(settings);
  await Promise.resolve();

  expect(autoTransformRecordingProjectMock).toHaveBeenCalledWith(
    expect.objectContaining({ id: store.project.id }),
    'recording-1',
    settings
  );
  expect(store.updateProject).toHaveBeenCalledTimes(1);
  expect(authority.project.name).toBe('Transformed');
});

it('keeps the stale project guard for async auto-transform results', async () => {
  const project = createEmptyVideoProject('Original');
  const { authority, store } = createStore(project);
  const nextProject = { ...project, name: 'Late transform' };

  autoTransformRecordingProjectMock.mockResolvedValue(nextProject);
  createAutoTransformRecordingAction(store)(createRemoveSettings());
  authority.project = { ...project, updatedAt: project.updatedAt + 1 };
  await Promise.resolve();

  expect(store.updateProject).toHaveBeenCalledOnce();
  expect(store.project).toBe(project);
  expect(authority.project.name).toBe('Original');
  expect(authority.project.updatedAt).toBe(project.updatedAt + 1);
});
