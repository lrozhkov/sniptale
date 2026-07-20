import { beforeEach, expect, it, vi } from 'vitest';

import {
  VideoExportFormat,
  VideoExportQualityPreset,
  type VideoProjectExportSettings,
} from '../../../features/video/project/types/export';
import {
  VideoTimelinePlacementMode,
  type VideoProject,
} from '../../../features/video/project/types/model';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import {
  resetProjectExportOwnerRuntimeStateForTests,
  startProjectExport,
  type VideoProjectExportClient,
} from './use-case';

let sendRuntimeMessage: ReturnType<typeof vi.fn<(message: unknown) => Promise<unknown>>>;

beforeEach(() => {
  sendRuntimeMessage = vi.fn<(message: unknown) => Promise<unknown>>();
  resetProjectExportOwnerRuntimeStateForTests();
});

function createClient(): VideoProjectExportClient {
  return {
    deleteProjectExportInput: vi.fn(async () => undefined),
    sendRuntimeMessage: sendRuntimeMessage as VideoProjectExportClient['sendRuntimeMessage'],
    stageProjectExportInput: vi.fn(async (jobId, project) =>
      createInputReference(jobId, project.id)
    ),
  };
}

function createInputReference(jobId: string, projectId: string) {
  return {
    contentSha256: `sha256:${'a'.repeat(64)}`,
    jobId,
    projectId,
    retainedByteLength: 3 * 1024 * 1024,
  };
}

function createProject(): VideoProject {
  return {
    version: 2,
    id: 'project-1',
    name: 'Project',
    source: { kind: 'manual' },
    baseRecordingId: null,
    width: 1280,
    height: 720,
    fps: 30,
    backgroundColor: '#000000',
    timelinePlacementMode: VideoTimelinePlacementMode.ALLOW_OVERLAP,
    duration: 10,
    createdAt: 1,
    updatedAt: 1,
    assets: [],
    tracks: [],
    clips: [],
    cursorTrack: null,
    actionEvents: [],
  };
}

function createSettings(): VideoProjectExportSettings {
  return {
    format: VideoExportFormat.MP4,
    width: 1920,
    height: 1080,
    fps: 30,
    quality: VideoExportQualityPreset.HIGH,
    downloadAfterExport: true,
  };
}

it('requests start capability before starting project export', async () => {
  const settings = createSettings();
  const project = createProject();
  sendRuntimeMessage
    .mockResolvedValueOnce({ success: true, capabilityToken: 'start-token' })
    .mockResolvedValueOnce({ success: true, capabilityToken: 'cancel-token' });

  await startProjectExport('job-1', project, settings, createClient());

  expect(sendRuntimeMessage).toHaveBeenNthCalledWith(1, {
    type: VideoMessageType.GET_PROJECT_EXPORT_CAPABILITIES,
    jobId: 'job-1',
    settings,
  });
  expect(sendRuntimeMessage).toHaveBeenNthCalledWith(2, {
    type: VideoMessageType.START_PROJECT_EXPORT,
    capabilityToken: 'start-token',
    input: createInputReference('job-1', project.id),
    jobId: 'job-1',
    settings,
  });
});
