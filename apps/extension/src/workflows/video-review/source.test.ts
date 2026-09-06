import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  media: vi.fn(),
  recording: vi.fn(),
  asset: vi.fn(),
  export: vi.fn(),
  telemetry: vi.fn(),
  open: vi.fn(),
  dispose: vi.fn(),
  duration: vi.fn(),
  metadataDuration: vi.fn(),
  metadata: vi.fn(),
}));
vi.mock('../../composition/persistence/media-library', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../composition/persistence/media-library')>()),
  getMediaLibraryEntry: mocks.media,
}));
vi.mock('../../composition/persistence/recordings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../composition/persistence/recordings')>()),
  getRecording: mocks.recording,
}));
vi.mock('../../composition/persistence/projects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../composition/persistence/projects')>()),
  getProjectAsset: mocks.asset,
}));
vi.mock('../../composition/persistence/projects/index.exports', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../composition/persistence/projects/index.exports')
  >()),
  getProjectExport: mocks.export,
}));
vi.mock('../../composition/persistence/recordings/telemetry', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../composition/persistence/recordings/telemetry')>()),
  getRecordingTelemetry: mocks.telemetry,
}));
vi.mock('../../composition/persistence/review-workspaces/store', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../composition/persistence/review-workspaces/store')
  >()),
  openVideoWorkspace: mocks.open,
}));
vi.mock('mediabunny', () => ({
  ALL_FORMATS: [],
  BlobSource: class {},
  Input: class {
    dispose = mocks.dispose;
    computeDuration = mocks.duration;
    getDurationFromMetadata = mocks.metadataDuration;
    getMetadataTags = mocks.metadata;
    async getPrimaryVideoTrack() {
      return { getDisplayWidth: async () => 360, getDisplayHeight: async () => 640 };
    }
    async getMimeType() {
      return 'video/webm';
    }
  },
}));
import { loadVideoReviewSource } from './source';
import { projectReviewTelemetry } from '../../features/video/review/telemetry';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.metadata.mockResolvedValue({});
  mocks.media.mockResolvedValue({
    filename: 'clip.webm',
    mimeType: 'video/webm',
    source: { kind: 'recording', recordingId: 'r' },
  });
  mocks.recording.mockResolvedValue({
    assetId: 'immutable-file',
    file: new File(['video'], 'clip.webm', { type: 'video/webm' }),
  });
  mocks.duration.mockResolvedValue(12);
  mocks.metadataDuration.mockResolvedValue(null);
  mocks.telemetry.mockResolvedValue(undefined);
  mocks.open.mockResolvedValue({ workspace: {}, draft: null });
});

it('binds the decoded oriented source to the immutable file identity before opening', async () => {
  const result = await loadVideoReviewSource('recording:r', new AbortController().signal);
  expect(result.source).toMatchObject({ duration: 12, width: 360, height: 640, size: 5 });
  expect(mocks.open).toHaveBeenCalledWith('recording:r', result.source, 'immutable-file');
  expect(mocks.dispose).toHaveBeenCalledOnce();
});

it('loads saved action history using the recording identity and exposes its source-time markers', async () => {
  const telemetry = {
    recordingId: 'r',
    captureMode: 'TAB',
    createdAt: 1,
    updatedAt: 1,
    viewport: null,
    cursorTrack: null,
    signals: [],
    actionEvents: [
      {
        id: 'click',
        kind: 'CLICK' as const,
        time: 2,
        duration: 0.2,
        point: { x: 50, y: 60 },
        label: '',
        data: {},
        preset: 'NONE' as const,
      },
    ],
  };
  mocks.telemetry.mockResolvedValueOnce(telemetry);
  const result = await loadVideoReviewSource('recording:r', new AbortController().signal);
  expect(mocks.telemetry).toHaveBeenCalledWith('r');
  expect(result.telemetry).toEqual(telemetry);
  expect(projectReviewTelemetry(result.telemetry!, result.source.duration).markers).toEqual([
    { ref: { kind: 'action', id: 'click' }, eventType: 'CLICK', start: 2, end: 2.2 },
  ]);
});

it('aborts loading without creating a session and releases the parser', async () => {
  let resolveDuration: (duration: number) => void = () => undefined;
  mocks.duration.mockImplementation(
    () =>
      new Promise<number>((resolve) => {
        resolveDuration = resolve;
      })
  );
  const controller = new AbortController();
  const pending = loadVideoReviewSource('recording:r', controller.signal);
  await vi.waitFor(() => expect(mocks.duration).toHaveBeenCalled());
  controller.abort();
  resolveDuration(12);
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  expect(mocks.dispose).toHaveBeenCalled();
  expect(mocks.open).not.toHaveBeenCalled();
});

it('opens project exports and ready project assets without inferring recording telemetry', async () => {
  const entry = {
    assetId: 'project-bytes',
    file: new File(['bytes'], 'clip.webm', { type: 'video/webm' }),
  };
  mocks.export.mockResolvedValue(entry);
  mocks.media.mockResolvedValue({
    filename: 'export.webm',
    mimeType: 'video/webm',
    source: { kind: 'project-export', exportId: 'export' },
  });
  await loadVideoReviewSource('project-export:export', new AbortController().signal);
  expect(mocks.export).toHaveBeenCalledWith('export');
  mocks.asset.mockResolvedValue({ status: 'ready', entry });
  mocks.media.mockResolvedValue({
    filename: 'asset.webm',
    mimeType: 'video/webm',
    source: { kind: 'project-asset', projectAssetId: 'asset' },
  });
  await loadVideoReviewSource('project-asset:asset', new AbortController().signal);
  expect(mocks.asset).toHaveBeenCalledWith('asset');
  expect(mocks.telemetry).not.toHaveBeenCalled();
  mocks.asset.mockResolvedValue({ status: 'missing' });
  await expect(
    loadVideoReviewSource('project-asset:asset', new AbortController().signal)
  ).rejects.toThrow('Video source');
});

it('rejects unavailable, non-video and invalid-duration sources before persisting a session', async () => {
  for (const media of [
    null,
    { mimeType: 'image/png' },
    { mimeType: 'video/webm', source: { kind: 'screenshot' } },
  ]) {
    mocks.media.mockResolvedValueOnce(media);
    await expect(loadVideoReviewSource('media', new AbortController().signal)).rejects.toThrow();
  }
  mocks.duration.mockResolvedValueOnce(Number.NaN);
  await expect(loadVideoReviewSource('media', new AbortController().signal)).rejects.toThrow(
    'metadata'
  );
  expect(mocks.open).not.toHaveBeenCalled();
});

it('uses declared container duration when the last WebM packet has no inferred duration', async () => {
  mocks.metadataDuration.mockResolvedValue(8);
  mocks.duration.mockResolvedValue(7.98);
  const result = await loadVideoReviewSource('recording:r', new AbortController().signal);
  expect(result.source.duration).toBe(8);
  expect(mocks.duration).not.toHaveBeenCalled();
});
