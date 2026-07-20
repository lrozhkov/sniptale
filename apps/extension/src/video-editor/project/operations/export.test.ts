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
  cancelProjectExport,
  getProjectExportCapabilities,
  getProjectExportOwnerDocumentId,
  resetProjectExportOwnerRuntimeStateForTests,
  startProjectExport,
  type VideoProjectExportClient,
} from './export';

let exportClient: VideoProjectExportClient;
let sendRuntimeMessage: ReturnType<typeof vi.fn<(message: unknown) => Promise<unknown>>>;

beforeEach(() => {
  sendRuntimeMessage = vi.fn<(message: unknown) => Promise<unknown>>();
  exportClient = {
    deleteProjectExportInput: vi.fn(async () => undefined),
    sendRuntimeMessage: sendRuntimeMessage as VideoProjectExportClient['sendRuntimeMessage'],
    stageProjectExportInput: vi.fn(async (jobId, project) =>
      createInputReference(jobId, project.id)
    ),
  };
  resetProjectExportOwnerRuntimeStateForTests();
});

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

function createInputReference(jobId: string, projectId: string) {
  return {
    contentSha256: `sha256:${'a'.repeat(64)}`,
    jobId,
    projectId,
    retainedByteLength: 3 * 1024 * 1024,
  };
}

function createSettings(
  format: VideoExportFormat = VideoExportFormat.MP4
): VideoProjectExportSettings {
  return {
    format,
    width: 1920,
    height: 1080,
    fps: 30,
    quality: VideoExportQualityPreset.HIGH,
    downloadAfterExport: true,
  };
}

it('sends start export requests through the runtime transport', async () => {
  const project = createProject();
  const settings = createSettings();
  sendRuntimeMessage
    .mockResolvedValueOnce({
      success: true,
      capabilityToken: 'start-token-1',
      ownerDocumentId: 'editor-doc-1',
    })
    .mockResolvedValueOnce({
      success: true,
      capabilityToken: 'cancel-token-1',
      ownerDocumentId: 'editor-doc-1',
    });

  await startProjectExport('job-1', project, settings, exportClient);

  expect(sendRuntimeMessage).toHaveBeenNthCalledWith(1, {
    type: VideoMessageType.GET_PROJECT_EXPORT_CAPABILITIES,
    jobId: 'job-1',
    settings,
  });
  expect(sendRuntimeMessage).toHaveBeenNthCalledWith(2, {
    type: VideoMessageType.START_PROJECT_EXPORT,
    capabilityToken: 'start-token-1',
    input: createInputReference('job-1', project.id),
    jobId: 'job-1',
    settings,
  });
  expect(getProjectExportOwnerDocumentId('job-1')).toBe('editor-doc-1');
});

it('sends cancel export requests through the runtime transport', async () => {
  sendRuntimeMessage
    .mockResolvedValueOnce({ success: true, capabilityToken: 'start-token-2' })
    .mockResolvedValueOnce({
      success: true,
      capabilityToken: 'cancel-token-2',
      ownerDocumentId: 'editor-doc-2',
    })
    .mockResolvedValueOnce({ success: true });

  await startProjectExport('job-2', createProject(), createSettings(), exportClient);
  expect(getProjectExportOwnerDocumentId('job-2')).toBe('editor-doc-2');
  await cancelProjectExport('job-2', exportClient);
  expect(getProjectExportOwnerDocumentId('job-2')).toBeNull();

  expect(sendRuntimeMessage).toHaveBeenLastCalledWith({
    type: VideoMessageType.CANCEL_PROJECT_EXPORT,
    capabilityToken: 'cancel-token-2',
    jobId: 'job-2',
  });
});

it('keeps cancel authority when a transient cancel request fails', async () => {
  sendRuntimeMessage
    .mockResolvedValueOnce({ success: true, capabilityToken: 'start-token-3' })
    .mockResolvedValueOnce({ success: true, capabilityToken: 'cancel-token-3' })
    .mockRejectedValueOnce(new Error('worker restarted'))
    .mockResolvedValueOnce({ success: true, cancelCapabilityToken: 'cancel-token-3b' })
    .mockResolvedValueOnce({ success: true });

  await startProjectExport('job-3', createProject(), createSettings(), exportClient);
  await cancelProjectExport('job-3', exportClient);

  expect(sendRuntimeMessage).toHaveBeenNthCalledWith(3, {
    type: VideoMessageType.CANCEL_PROJECT_EXPORT,
    capabilityToken: 'cancel-token-3',
    jobId: 'job-3',
  });
  expect(sendRuntimeMessage).toHaveBeenNthCalledWith(4, {
    type: VideoMessageType.GET_PROJECT_EXPORT_CAPABILITIES,
    jobId: 'job-3',
    settings: createSettings(),
  });
  expect(sendRuntimeMessage).toHaveBeenNthCalledWith(5, {
    type: VideoMessageType.CANCEL_PROJECT_EXPORT,
    capabilityToken: 'cancel-token-3b',
    jobId: 'job-3',
  });
});

it('keeps cancel authority when background rejects cancellation', async () => {
  sendRuntimeMessage
    .mockResolvedValueOnce({ success: true, capabilityToken: 'start-token-4' })
    .mockResolvedValueOnce({ success: true, capabilityToken: 'cancel-token-4' })
    .mockResolvedValueOnce({ success: false, error: 'Unauthorized project export capability' })
    .mockResolvedValueOnce({ success: true, cancelCapabilityToken: 'cancel-token-4b' })
    .mockResolvedValueOnce({ success: true });

  await startProjectExport('job-4', createProject(), createSettings(), exportClient);
  await cancelProjectExport('job-4', exportClient);

  expect(sendRuntimeMessage).toHaveBeenNthCalledWith(3, {
    type: VideoMessageType.CANCEL_PROJECT_EXPORT,
    capabilityToken: 'cancel-token-4',
    jobId: 'job-4',
  });
  expect(sendRuntimeMessage).toHaveBeenNthCalledWith(4, {
    type: VideoMessageType.GET_PROJECT_EXPORT_CAPABILITIES,
    jobId: 'job-4',
    settings: createSettings(),
  });
  expect(sendRuntimeMessage).toHaveBeenNthCalledWith(5, {
    type: VideoMessageType.CANCEL_PROJECT_EXPORT,
    capabilityToken: 'cancel-token-4b',
    jobId: 'job-4',
  });
});

it('keeps retry state when reissued cancellation also fails', async () => {
  sendRuntimeMessage
    .mockResolvedValueOnce({ success: true, capabilityToken: 'start-token-5' })
    .mockResolvedValueOnce({ success: true, capabilityToken: 'cancel-token-5' })
    .mockResolvedValueOnce({ success: false, error: 'Offscreen unavailable' })
    .mockResolvedValueOnce({ success: true, cancelCapabilityToken: 'cancel-token-5b' })
    .mockRejectedValueOnce(new Error('worker restarted'))
    .mockResolvedValueOnce({ success: true, cancelCapabilityToken: 'cancel-token-5c' })
    .mockResolvedValueOnce({ success: true });

  await startProjectExport('job-5', createProject(), createSettings(), exportClient);
  await expect(cancelProjectExport('job-5', exportClient)).rejects.toThrow('worker restarted');
  await cancelProjectExport('job-5', exportClient);

  expect(sendRuntimeMessage).toHaveBeenNthCalledWith(6, {
    type: VideoMessageType.GET_PROJECT_EXPORT_CAPABILITIES,
    jobId: 'job-5',
    settings: createSettings(),
  });
  expect(sendRuntimeMessage).toHaveBeenNthCalledWith(7, {
    type: VideoMessageType.CANCEL_PROJECT_EXPORT,
    capabilityToken: 'cancel-token-5c',
    jobId: 'job-5',
  });
});

it('probes export capabilities without issuing a job-bound token', async () => {
  const settings = createSettings(VideoExportFormat.WEBM);
  sendRuntimeMessage.mockResolvedValueOnce({ success: true });

  await getProjectExportCapabilities(settings, exportClient);

  expect(sendRuntimeMessage).toHaveBeenCalledWith({
    type: VideoMessageType.GET_PROJECT_EXPORT_CAPABILITIES,
    settings,
  });
});
