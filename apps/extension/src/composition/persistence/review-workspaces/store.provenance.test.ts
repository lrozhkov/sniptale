import { beforeEach, expect, it, vi } from 'vitest';
import { createReviewWorkspaceStoreFixture } from './store.test-support';
import { betaV1Fixture } from '../infrastructure/indexed-db/fixtures/beta-v1';
import {
  createPresentationReviewProvenance,
  encodeReviewProvenance,
} from '../../../features/video/review/provenance';
import { createNeutralPresentationSettings } from '../../../features/video/review/advanced/presentation';
import { planReviewPresentationSequence } from '../../../features/video/review/presentation-sequence';
const mocks = vi.hoisted(() => ({
  database: vi.fn(),
  media: vi.fn(),
  recording: vi.fn(),
  metadata: vi.fn(),
}));
vi.mock('../infrastructure/indexed-db/core', () => ({
  initDB: mocks.database,
  MEDIA_LIBRARY_STORE: 'media_library',
  VIDEO_WORKSPACES_STORE: 'video_workspaces',
  VIDEO_WORKSPACE_DRAFTS_STORE: 'video_workspace_drafts',
}));
vi.mock('../infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: async (operation: (db: unknown) => Promise<unknown>) =>
    operation(await mocks.database()),
}));
vi.mock('../assets/opfs-store', async (original) => ({
  ...(await original<typeof import('../assets/opfs-store')>()),
  listReadyJournals: vi.fn(async () => []),
}));
vi.mock('../media-library', () => ({ getMediaLibraryEntry: mocks.media }));
vi.mock('../recordings', () => ({ getRecording: mocks.recording }));
vi.mock('../recordings/telemetry', () => ({ getRecordingTelemetry: async () => undefined }));
vi.mock('../projects', () => ({ getProjectAsset: vi.fn() }));
vi.mock('../projects/index.exports', () => ({ getProjectExport: vi.fn() }));
vi.mock('mediabunny', () => ({
  ALL_FORMATS: [],
  BlobSource: class {},
  Input: class {
    dispose() {}
    async getPrimaryVideoTrack() {
      return { getDisplayWidth: async () => 160, getDisplayHeight: async () => 90 };
    }
    async getDurationFromMetadata() {
      return 10;
    }
    async getMimeType() {
      return 'video/webm';
    }
    getMetadataTags = mocks.metadata;
  },
}));
import { loadVideoReviewSource } from '../../../workflows/video-review/source';
import { readVideoWorkspace } from './store';

beforeEach(() => {
  vi.clearAllMocks();
  const fixture = createReviewWorkspaceStoreFixture(() => false);
  mocks.database.mockResolvedValue(fixture.database);
  mocks.media.mockResolvedValue({
    ...betaV1Fixture.records.media_library[0],
    filename: 'baked.webm',
  });
  mocks.recording.mockResolvedValue({
    assetId: betaV1Fixture.records.recordings[0]!.assetId,
    file: new File(['video'], 'baked.webm', { type: 'video/webm' }),
  });
});

it.each(['sniptale.video-edit.v1', 'sniptale.video-edit.v2'] as const)(
  'opens and reopens baked bytes with %s metadata without replaying their source edits',
  async (format) => {
    const settings = createNeutralPresentationSettings();
    settings.fadeIn = { enabled: true, duration: 1 };
    const result = planReviewPresentationSequence({
      settings,
      mainDuration: 10,
      fragmentOffset: 0,
      includeBookends: true,
      rate: { numerator: 30, denominator: 1 },
    });
    if (!result.ok) throw new Error('Invalid fixture plan');
    const base = {
      timeUnit: 'seconds' as const,
      source: {
        filename: 'original.webm',
        duration: 12,
        width: 640,
        height: 360,
        mimeType: 'video/webm',
        size: 1000,
      },
      revision: 7,
      exportedAt: 10,
      audioReencoded: true,
      edits: [
        { id: 'cut', kind: 'cut' as const, start: 2, end: 4, requestedStart: 2, requestedEnd: 4 },
      ],
    };
    const provenance =
      format === 'sniptale.video-edit.v1'
        ? { ...base, format }
        : createPresentationReviewProvenance({
            base,
            plan: result.plan,
            output: {
              format: 'webm',
              videoCodec: 'vp9',
              width: 160,
              height: 90,
              frameRateMode: 'constant',
            },
            includeBookends: true,
            watermarkBaked: true,
          });
    mocks.metadata.mockResolvedValue({ comment: encodeReviewProvenance(provenance) });
    const first = await loadVideoReviewSource(
      'recording:beta-v1-recording',
      new AbortController().signal
    );
    expect(first.provenance).toEqual(provenance);
    expect(first.snapshot.workspace.source).toMatchObject({
      duration: 10,
      width: 160,
      height: 90,
      size: 5,
    });
    expect(first.snapshot.workspace.history).toEqual([]);
    expect(first.snapshot.workspace.cursor).toBe(0);
    expect(first.snapshot.workspace.advanced.presentation?.intro.mode).toBe('none');
    expect(first.snapshot.workspace.advanced.presentation?.fadeIn.duration).toBe(0.4);
    const persisted = await readVideoWorkspace('recording:beta-v1-recording');
    expect(persisted).toEqual(first.snapshot);
    const reopened = await loadVideoReviewSource(
      'recording:beta-v1-recording',
      new AbortController().signal
    );
    expect(reopened.snapshot).toEqual(first.snapshot);
  }
);
