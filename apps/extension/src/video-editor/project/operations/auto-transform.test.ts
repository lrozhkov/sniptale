import { beforeEach, expect, it, vi } from 'vitest';
import {
  createProject,
  createVideoClip,
  createTrack,
} from '../../../features/video/project/timeline/project-meta.test.helpers';
import { DEFAULT_VIDEO_AUTO_PROCESSING_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import type { RecordingTelemetryEntry } from '../../../composition/persistence/recordings/contracts';
import { RecordingTelemetrySignalKind } from '../../../features/video/project/types';
vi.mock('./auto-transform.audio', () => ({
  analyzeAutoProcessingAudio: vi.fn(async () => ({ status: 'absent' })),
}));
const { getTelemetry } = vi.hoisted(() => ({ getTelemetry: vi.fn() }));
vi.mock('../../../composition/persistence/recordings/telemetry', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../composition/persistence/recordings/telemetry')
  >()),
  getRecordingTelemetry: getTelemetry,
}));
import {
  prepareAutoProcessing,
  getAutoProcessingClipChoices,
  type AutoProcessingRequest,
} from './auto-transform';
function telemetry(recordingId = 'rec-asset-video'): RecordingTelemetryEntry {
  return {
    recordingId,
    captureMode: 'TAB',
    createdAt: 1,
    updatedAt: 2,
    viewport: null,
    cursorTrack: null,
    actionEvents: [],
    signals: [
      RecordingTelemetrySignalKind.CURSOR_IDLE,
      RecordingTelemetrySignalKind.STATIC_FRAME,
    ].map((kind, index) => ({
      id: `signal-${index}`,
      kind,
      startTime: 2,
      endTime: 6,
      point: null,
      data: {},
    })),
  };
}
function fixture() {
  const project = createProject([
    createVideoClip({ id: 'screen', sourceInstanceId: 'instance' }),
    createVideoClip({ id: 'repeat', sourceInstanceId: 'repeat-instance', startTime: 10 }),
  ]);
  project.baseRecordingId = 'unrelated-base';
  project.duration = 18;
  return project;
}
const request: AutoProcessingRequest = {
  targets: [{ clipId: 'screen', recordingId: 'rec-asset-video', sourceInstanceId: 'instance' }],
  camera: false,
  settings: {
    ...DEFAULT_VIDEO_AUTO_PROCESSING_SETTINGS,
    enabled: true,
    stableSegments: {
      ...DEFAULT_VIDEO_AUTO_PROCESSING_SETTINGS.stableSegments,
      shoulderSeconds: 0,
      speedUpPlaybackRate: 2,
    },
  },
};
beforeEach(() => {
  vi.clearAllMocks();
  getTelemetry.mockImplementation(async (id: string) => telemetry(id));
});
it('C4 acceptance: never infers scope from baseRecordingId and returns no candidate for empty scope', async () => {
  const project = fixture();
  const result = await prepareAutoProcessing(project, { ...request, targets: [] });
  expect(result.status).toBe('unchanged');
  expect(result.project).toBe(project);
  expect(getTelemetry).not.toHaveBeenCalled();
});
it('prepares a real immutable candidate for exactly the selected placement', async () => {
  const project = fixture();
  const before = structuredClone(project);
  const result = await prepareAutoProcessing(project, request);
  expect(result.status).toBe('ready');
  expect(result.summary).toMatchObject({
    beforeDuration: 18,
    afterDuration: 16,
    removedDuration: 2,
  });
  expect(result.project?.clips.find((clip) => clip.id === 'repeat')).toMatchObject({
    startTime: 8,
    duration: 8,
    sourceDuration: 8,
  });
  expect(result.selectedIds).toHaveLength(1);
  expect(result.suggestions[0]).toMatchObject({
    beforeDuration: 4,
    afterDuration: 2,
    status: 'available',
  });
  expect(project).toEqual(before);
  expect(getTelemetry).toHaveBeenCalledWith('rec-asset-video');
});
it('shows blocked rows but defaults to the applicable subset, with explicit deselection yielding no-op', async () => {
  const project = fixture();
  project.tracks.push({ ...createTrack('locked', 1), locked: true });
  project.clips[1]!.trackId = 'locked';
  const both = {
    ...request,
    targets: [
      ...request.targets,
      { clipId: 'repeat', recordingId: 'rec-asset-video', sourceInstanceId: 'repeat-instance' },
    ],
  };
  const result = await prepareAutoProcessing(project, both);
  expect(result.suggestions.map((row) => row.status)).toEqual(['available', 'blocked']);
  expect(result.selectedIds).toHaveLength(1);
  expect(result.status).toBe('ready');
  const blocked = await prepareAutoProcessing(
    project,
    both,
    result.suggestions.map((row) => row.id)
  );
  expect(blocked.status).toBe('blocked');
  expect(blocked.project).toBeNull();
  const empty = await prepareAutoProcessing(project, both, []);
  expect(empty.status).toBe('unchanged');
  expect(empty.project).toBe(project);
});
it('rejects disappeared selected suggestions instead of applying the surviving prefix', async () => {
  const result = await prepareAutoProcessing(fixture(), request, ['no-longer-present']);
  expect(result.status).toBe('blocked');
  expect(result.project).toBeNull();
});
it('supports multiple recordings while leaving unselected repeated source settings intact', async () => {
  const project = fixture();
  project.assets.push({
    ...project.assets[0]!,
    id: 'second-asset',
    source: { kind: 'recording', recordingId: 'second' },
  });
  project.clips.push(
    createVideoClip({
      id: 'second',
      assetId: 'second-asset',
      sourceInstanceId: 'second-instance',
      startTime: 20,
    })
  );
  project.duration = 28;
  const result = await prepareAutoProcessing(project, {
    ...request,
    targets: [
      ...request.targets,
      { clipId: 'second', recordingId: 'second', sourceInstanceId: 'second-instance' },
    ],
  });
  expect(result.status).toBe('ready');
  expect(result.summary.afterDuration).toBe(24);
  expect(getTelemetry.mock.calls.map((call) => call[0])).toEqual(['rec-asset-video', 'second']);
  expect(result.project?.clips.find((clip) => clip.id === 'repeat')).toMatchObject({
    duration: 8,
    sourceDuration: 8,
  });
});
it('does not offer camera-only tracks as duplicate screen targets', () => {
  const project = fixture();
  project.tracks.find((track) => track.id === 'track-video')!.role = 'CAMERA';
  expect(getAutoProcessingClipChoices(project)).toEqual([]);
});
it('keeps unavailable telemetry visible without inventing a preview', async () => {
  getTelemetry.mockResolvedValue(undefined);
  const result = await prepareAutoProcessing(fixture(), request);
  expect(result.status).toBe('unchanged');
  expect(result.suggestions[0]).toMatchObject({ status: 'blocked', reason: 'missing-source' });
});
it.each([false, true])(
  'camera is opt-in and repeat processing is stable (nearby second click: %s)',
  async (nearby) => {
    const project = fixture();
    project.actionEvents = [
      {
        id: 'click',
        kind: 'CLICK',
        label: 'Click',
        data: {},
        point: { x: 0.5, y: 0.5 },
        anchor: {
          kind: 'recording-source',
          recordingId: 'rec-asset-video',
          sourceInstanceId: 'instance',
          sourceEventId: 'raw',
          sourceTime: 1,
        },
      },
    ];
    if (nearby)
      project.actionEvents.push({
        ...project.actionEvents[0]!,
        id: 'nearby',
        point: { x: 0.9, y: 0.9 },
        anchor: {
          kind: 'recording-source',
          recordingId: 'rec-asset-video',
          sourceInstanceId: 'instance',
          sourceEventId: 'nearby-raw',
          sourceTime: 3,
        },
      });
    const cameraRequest = {
      ...request,
      settings: {
        ...request.settings,
        stableSegments: { ...request.settings.stableSegments, action: 'skip' as const },
      },
    };
    const off = await prepareAutoProcessing(project, cameraRequest);
    expect(off.status).toBe('unchanged');
    expect(off.project).toBe(project);
    const on = await prepareAutoProcessing(project, { ...cameraRequest, camera: true });
    expect(on.status).toBe('ready');
    expect(on.suggestions).toHaveLength(1);
    expect(on.project?.motionRegions?.[0]?.targetAction).toEqual({
      eventId: 'click',
      clipId: 'screen',
    });
    const reapplied = await prepareAutoProcessing(on.project!, { ...cameraRequest, camera: true });
    expect(reapplied.status).toBe('unchanged');
    expect(reapplied.project).toBe(on.project);
    expect(reapplied.suggestions.every((row) => row.status !== 'available')).toBe(true);
    const edited = {
      ...on.project!,
      motionRegions: on.project!.motionRegions!.map((region) => ({
        ...region,
        scale: 3,
        zoomInDuration: 0.8,
      })),
    };
    const reprocessed = await prepareAutoProcessing(edited, { ...cameraRequest, camera: true });
    expect(reprocessed.status).toBe('unchanged');
    expect(reprocessed.project?.motionRegions).toEqual(edited.motionRegions);
    const empty = await prepareAutoProcessing(project, { ...cameraRequest, camera: true }, []);
    expect(empty.status).toBe('unchanged');
    expect(empty.project).toBe(project);
  }
);
it('binds camera before time edits and preserves exact split lineage', async () => {
  const project = fixture();
  project.actionEvents = [
    {
      id: 'click',
      kind: 'CLICK',
      label: 'Click',
      data: {},
      point: { x: 0.5, y: 0.5 },
      anchor: {
        kind: 'recording-source',
        recordingId: 'rec-asset-video',
        sourceInstanceId: 'instance',
        sourceEventId: 'raw',
        sourceTime: 3,
      },
    },
  ];
  const result = await prepareAutoProcessing(project, { ...request, camera: true });
  expect(result.status).toBe('ready');
  const middle = result.project!.clips.find(
    (clip) => clip.type === 'VIDEO' && clip.sourceStart === 2 && clip.playbackRate === 2
  )!;
  const camera = result.project!.motionRegions?.find(
    (region) => region.duration > 0 && region.sourceBinding?.clipId === middle.id
  );
  expect(camera).toBeDefined();
  expect(camera?.targetAction?.clipId).toBe(middle.id);
  expect(camera?.startTime).toBe(2.5);
  expect(camera?.duration).toBe(1.5);
  const dormant = result.project!.motionRegions?.find(
    (region) => region.sourceBinding?.clipId === 'screen'
  );
  expect(dormant?.duration).toBe(0);
  expect(dormant?.sourceBinding?.sourceStart).toBe(3);
});
it('keeps sourceless video visible as an unavailable choice instead of hiding the reason', () => {
  const project = fixture();
  project.assets[0]!.source = {
    kind: 'project-asset',
    projectAssetId: 'uploaded-without-recording',
  };
  expect(getAutoProcessingClipChoices(project)).toEqual(
    expect.arrayContaining([expect.objectContaining({ clipId: 'screen', recordingId: '' })])
  );
});

it('one pass shortens both typing and pauses while preserving the immutable source project', async () => {
  getTelemetry.mockResolvedValue({
    ...telemetry(),
    signals: [
      { id: 'input', kind: 'typing', startTime: 1, endTime: 3, point: null, data: {} },
      { id: 'idle', kind: 'cursor-idle', startTime: 0, endTime: 8, point: null, data: {} },
    ],
  });
  const project = fixture();
  const result = await prepareAutoProcessing(project, { ...request, typingRate: 2 });
  expect(result.status).toBe('ready');
  expect(result.suggestions.map((row) => row.category)).toEqual(['idle', 'typing', 'idle']);
  expect(result.summary.afterDuration).toBe(14);
  expect(project.clips[0]?.duration).toBe(8);
  expect(
    result.project?.clips
      .filter((clip) => clip.type === 'VIDEO' && clip.sourceInstanceId === 'instance')
      .reduce((sum, clip) => sum + clip.duration, 0)
  ).toBe(4);
});
