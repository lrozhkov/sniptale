import { beforeEach, expect, it, vi } from 'vitest';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import {
  VideoExportQualityPreset,
  type VideoProjectExportSettings,
} from '../../features/video/project/types/export';
import { handleProjectExportRuntimeMessage } from './routing.project-export';

const mocks = vi.hoisted(() => ({
  prepare: vi.fn(),
  assets: vi.fn(),
  start: vi.fn(),
  cancel: vi.fn(),
  reconcile: vi.fn(),
  capabilities: vi.fn(),
  consume: vi.fn(),
}));
vi.mock('../../platform/i18n', () => ({ prepareTranslations: mocks.prepare }));
vi.mock('./data-readiness', () => ({ offscreenDataReadiness: { ensureAssets: mocks.assets } }));
vi.mock('../project-export', () => ({
  startProjectExport: mocks.start,
  cancelProjectExport: mocks.cancel,
  reconcileProjectExportJobs: mocks.reconcile,
  getProjectExportCapabilities: mocks.capabilities,
}));
vi.mock('../../composition/persistence/project-export-inputs', () => ({
  consumeProjectExportInput: mocks.consume,
}));

const settings: VideoProjectExportSettings = {
  format: 'MP4',
  mp4VideoCodec: 'AVC',
  resolution: 'SOURCE',
  quality: VideoExportQualityPreset.MEDIUM,
  downloadAfterExport: false,
  width: 1280,
  height: 720,
  fps: 30,
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.prepare.mockReset().mockResolvedValue(undefined);
  mocks.assets.mockResolvedValue(undefined);
  mocks.cancel.mockResolvedValue(undefined);
  mocks.reconcile.mockReset().mockResolvedValue(undefined);
  mocks.consume.mockReset().mockResolvedValue({ id: 'project' });
  mocks.capabilities.mockReset();
  mocks.start.mockImplementation(
    async (
      _job: string,
      input: () => Promise<unknown>,
      _settings: unknown,
      prepare: () => Promise<void>
    ) => {
      await prepare();
      await input();
    }
  );
});

it('registers export through the existing preparation seam and leaves cancel independent', async () => {
  let complete!: () => void;
  mocks.prepare.mockReturnValue(
    new Promise<void>((resolve) => {
      complete = resolve;
    })
  );
  const work = handleProjectExportRuntimeMessage({
    type: VideoMessageType.OFFSCREEN_START_PROJECT_EXPORT,
    capabilityToken: 'capability',
    jobId: 'job',
    settings,
    input: {
      jobId: 'job',
      projectId: 'project',
      retainedByteLength: 100,
      contentSha256: `sha256:${'a'.repeat(64)}`,
    },
  });
  expect(mocks.start).toHaveBeenCalledOnce();
  expect(mocks.prepare).toHaveBeenCalledWith('offscreen');
  expect(mocks.consume).not.toHaveBeenCalled();
  await expect(
    handleProjectExportRuntimeMessage({
      type: VideoMessageType.OFFSCREEN_CANCEL_PROJECT_EXPORT,
      capabilityToken: 'capability',
      jobId: 'job',
    })
  ).resolves.toBe('accepted');
  expect(mocks.cancel).toHaveBeenCalledWith('job');
  complete();
  await expect(work).resolves.toBe('accepted');
  expect(mocks.consume).toHaveBeenCalledOnce();
  expect(mocks.consume).toHaveBeenCalledWith(
    expect.objectContaining({ jobId: 'job', projectId: 'project' })
  );
});

it('does not reconcile localized historical export state before catalog preparation', async () => {
  mocks.prepare.mockRejectedValue(new Error('Catalog unavailable'));
  await expect(
    handleProjectExportRuntimeMessage({
      type: VideoMessageType.OFFSCREEN_GET_PROJECT_EXPORT_CAPABILITIES,
      capabilityToken: 'capability',
      settings,
    })
  ).rejects.toThrow('Catalog unavailable');
  expect(mocks.reconcile).not.toHaveBeenCalled();
  expect(mocks.capabilities).not.toHaveBeenCalled();
});

it('publishes checked capabilities only after catalog preparation and interrupted-job reconciliation', async () => {
  let complete!: () => void;
  mocks.prepare.mockReturnValue(
    new Promise<void>((resolve) => {
      complete = resolve;
    })
  );
  const capabilities = {
    formats: [{ format: 'MP4', available: true }],
    mp4Codecs: [{ codec: 'AVC', available: true }],
    defaultMp4VideoCodec: 'AVC',
  };
  mocks.capabilities.mockResolvedValue(capabilities);
  const reply = vi.fn();
  const pending = handleProjectExportRuntimeMessage(
    {
      type: VideoMessageType.OFFSCREEN_GET_PROJECT_EXPORT_CAPABILITIES,
      capabilityToken: 'capability',
      settings,
    },
    reply
  );
  expect(mocks.reconcile).not.toHaveBeenCalled();
  expect(mocks.capabilities).not.toHaveBeenCalled();
  expect(reply).not.toHaveBeenCalled();
  complete();
  await pending;
  expect(mocks.reconcile).toHaveBeenCalledOnce();
  expect(mocks.reconcile).toHaveBeenCalledBefore(mocks.capabilities);
  expect(mocks.capabilities).toHaveBeenCalledExactlyOnceWith(settings);
  expect(reply).toHaveBeenCalledExactlyOnceWith({ success: true, capabilities });
  expect(mocks.consume).not.toHaveBeenCalled();
  expect(mocks.assets).not.toHaveBeenCalled();
});

it('refuses a mismatched input identity before registering or consuming an export', async () => {
  await expect(
    handleProjectExportRuntimeMessage({
      type: VideoMessageType.OFFSCREEN_START_PROJECT_EXPORT,
      capabilityToken: 'capability',
      jobId: 'requested-job',
      settings,
      input: {
        jobId: 'different-job',
        projectId: 'project',
        retainedByteLength: 100,
        contentSha256: `sha256:${'a'.repeat(64)}`,
      },
    })
  ).rejects.toThrow('Project export input job mismatch');
  expect(mocks.start).not.toHaveBeenCalled();
  expect(mocks.prepare).not.toHaveBeenCalled();
  expect(mocks.assets).not.toHaveBeenCalled();
  expect(mocks.consume).not.toHaveBeenCalled();
});
