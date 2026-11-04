// @vitest-environment jsdom
import { MotionBehaviorFields, MotionCameraFields } from './content';
import { createVideoProjectMotionRegion } from '../../../../../features/video/project/motion';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MotionFocusModeField } from './fields';
import { createVideoProjectFromRecording } from '../../../../../features/video/project/factories/creation';
import { normalizeVideoProjectCursorSkin } from '../../../../../features/video/project/cursor';
import {
  createCursorTrajectoryBlockPacker,
  decodeCursorTrajectoryBlock,
} from '../../../../../features/video/project/cursor-trajectory/blocks';
import { createRecordingCursorTrajectoryReader } from '../../../../../composition/persistence/recordings/cursor-trajectory/reader';
import { motionRegionHasAvailableCursor } from '../../../../../features/video/project/cursor-trajectory/availability';
import type { RecordingCursorTrajectoryHead } from '../../../../../composition/persistence/recordings/cursor-trajectory/contracts';
import type {
  CursorTrajectoryDescriptor,
  CursorTrajectoryRecord,
  CursorTrajectorySegment,
} from '../../../../../features/video/project/cursor-trajectory/types';
import type { ReadCursorTrajectoryWindow } from '../../../../../features/video/project/cursor-trajectory/project-window';
const archiveFactory = vi.hoisted(() => vi.fn());
vi.mock('../../../../../workflows/video-review/cursor-trajectory', () => ({
  createRecordingCursorAvailabilityReader: archiveFactory,
}));
import { createEmptyVideoProject } from '../../../../../features/video/project/factories/creation';
import {
  VideoEditorSelectionKind,
  type VideoEditorSelection,
} from '../../../../contracts/selection';
import { VideoMotionOverlayZoomMode } from '../../../../../features/video/project/types';
import { MotionBlurField, MotionTransitionTypeField, MotionOverlayZoomField } from './fields';
import type { WorkspaceSidebarSelectionPanelProps } from '../../contracts/selection-panel';

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
  useAppLocale: () => 'en',
}));

function createCallbacks() {
  return {
    onAddActionEvent: vi.fn(),
    onAddMotionRegion: vi.fn(),
    onClearCursorSampleSkinOverride: vi.fn(),
    onClearPlacementMode: vi.fn(),
    onDeleteActionEvent: vi.fn(),
    onDeleteCursorSample: vi.fn(),
    onDeleteMotionRegion: vi.fn(),
    onDetachClipGroup: vi.fn(),
    onEnableCursorTrack: vi.fn(),
    onInsertCursorSample: vi.fn(),
    onPreviewSceneBackground: vi.fn(),
    onRememberRecentColor: vi.fn(async () => undefined),
    onResetSceneBackgroundPreview: vi.fn(),
    onResizeProject: vi.fn(),
    onSetCursorCaptureMode: vi.fn(),
    onSetSceneBackground: vi.fn(),
    onStartActionPointPlacement: vi.fn(),
    onStartMotionAreaPlacement: vi.fn(),
    onStartMotionFocusPlacement: vi.fn(),
    onUpdateActionEventDetails: vi.fn(),
    onUpdateClipAudioEnvelope: vi.fn(),
    onUpdateClipFades: vi.fn(),
    onUpdateClipMuted: vi.fn(),
    onUpdateClipTransform: vi.fn(),
    onUpdateClipVolume: vi.fn(),
    onUpdateCursorSampleInterpolation: vi.fn(),
    onUpdateCursorSampleSkinOverride: vi.fn(),
    onUpdateCursorSampleVisibility: vi.fn(),
    onUpdateCursorSkin: vi.fn(),
    onUpdateMediaClipFitMode: vi.fn(),
    onUpdateMotionRegion: vi.fn(),
    onUpdateShapeStyle: vi.fn(),
    onUpdateTextContent: vi.fn(),
    onUpdateTextStyle: vi.fn(),
    onUpdateTransitionDuration: vi.fn(),
    onUpdateTransitionEasing: vi.fn(),
    onUpdateTransitionTemplate: vi.fn(),
  };
}

function createPanelProps(): WorkspaceSidebarSelectionPanelProps {
  const project = createEmptyVideoProject('Motion');

  return {
    placementMode: null,
    project,
    recentColors: [],
    selectedActionOccurrence: null,
    selectedClip: null,
    selectedCursorSample: null,
    selectedMotionRegion: null,
    selectedTrack: null,
    selectedTransition: null,
    selection: {
      kind: VideoEditorSelectionKind.SCENE,
    } as VideoEditorSelection,
    ...createCallbacks(),
  };
}

describe('workspace-sidebar/selection/motion-fields', () => {
  it('renders each phase through the canonical mode choices', () => {
    const markup = renderToStaticMarkup(
      <MotionTransitionTypeField
        motionRegion={createVideoProjectMotionRegion(createPanelProps().project, 0)}
        phase="enter"
        panel={createPanelProps()}
      />
    );

    expect(markup).toContain('gallery.videoReview.zoomTransitionType');
    expect(markup).toContain('gallery.videoReview.transitionSmooth');
    expect(markup).toContain('gallery.videoReview.transitionNone');
    expect(markup).toContain('videoEditor.sidebar.temporalEasingInstant');
  });

  it('renders motion blur through canonical slider controls', () => {
    const markup = renderToStaticMarkup(
      <MotionBlurField
        phase="enter"
        panel={createPanelProps()}
        motionRegion={{
          ...createVideoProjectMotionRegion(createPanelProps().project, 0),
          motionBlurAmount: 0.45,
        }}
      />
    );

    expect(markup).toContain('gallery.videoReview.motionBlur');
    expect(markup).toContain('type="range"');
    expect(markup).toContain('45%');
  });

  it('renders overlay zoom mode through compact option buttons', () => {
    const markup = renderToStaticMarkup(
      <MotionOverlayZoomField
        motionRegionId="motion-1"
        panel={createPanelProps()}
        value={VideoMotionOverlayZoomMode.LOCK_OVERLAYS}
      />
    );

    expect(markup).toContain('videoEditor.sidebar.motionOverlayZoomLabel');
    expect(markup).toContain('videoEditor.sidebar.motionOverlayZoomLock');
    expect(markup).toContain('videoEditor.sidebar.motionOverlayZoomFollowCamera');
    expect(markup).toContain('aria-pressed="true"');
  });
});

it('shows explicit camera coverage and omits ineffective overlay controls for source windows', () => {
  const panel = createPanelProps();
  const region = {
    ...createVideoProjectMotionRegion(panel.project, 0),
    sourceBinding: {
      clipId: 'source',
      coordinateSpace: 'source-window' as const,
      sourceStart: 0,
      sourceEnd: 2,
      animation: { start: 0, end: 2, duration: 2 },
    },
  };
  const camera = renderToStaticMarkup(<MotionCameraFields panel={panel} motionRegion={region} />);
  expect(camera).toContain('videoEditor.sidebar.motionCoverage');
  expect(camera).toContain('videoEditor.sidebar.spotlightCoverageWindow');
  const behavior = renderToStaticMarkup(
    <MotionBehaviorFields panel={panel} motionRegion={region} />
  );
  expect(behavior).not.toContain('videoEditor.sidebar.motionOverlayZoomLabel');
});

const identity = { recordingId: 'recording', trajectoryId: 'a'.repeat(32) };
function sample(time: number, visible = true): CursorTrajectoryRecord {
  return {
    kind: 'sample',
    segmentId: 0,
    observationSeq: time,
    activeTimeUs: time,
    xQ8: visible ? 2560 : null,
    yQ8: visible ? 5120 : null,
    observed: visible,
    visible,
    event: 'move',
    button: 'none',
    relatedObservationSeq: null,
    anchors: [],
  };
}
function fixture(records: CursorTrajectoryRecord[] = [sample(1000000), sample(2000000)]) {
  const segment: CursorTrajectorySegment = {
    kind: 'segment',
    segmentId: 0,
    activeTimeUs: 0,
    reason: 'start',
    width: 100,
    height: 100,
    clock: {
      source: 'dom-event-time',
      timestampQuantumUs: null,
      resolutionBoundUs: null,
      mappingUncertaintyUs: null,
    },
  };
  const writer = createCursorTrajectoryBlockPacker(identity.recordingId, identity.trajectoryId);
  const packed = writer.append(segment);
  for (const record of records) packed.push(...writer.append(record));
  packed.push(...writer.finish());
  const descriptor: CursorTrajectoryDescriptor = {
    format: 'cursor-trajectory-v1',
    formatVersion: 1,
    algorithm: 'sed-window-v1',
    encoding: 'json-ascii-int-v1',
    trajectoryId: identity.trajectoryId,
    state: 'complete',
    finalized: true,
    ...writer.summary(),
  };
  const head: RecordingCursorTrajectoryHead = {
    ...identity,
    ...writer.summary(),
    sourceRecordingId: identity.recordingId,
    writerGeneration: 'generation',
    revision: 1,
    width: 100,
    height: 100,
    retired: false,
    finalized: true,
    state: 'complete',
    activeSegment: segment,
    lastObservationSeq: null,
    lastSegmentId: 0,
    lastTimeUs: 2000000,
  };
  let initial: CursorTrajectorySegment | null = null;
  const rows = packed.map((block) => {
    const row = {
      ...identity,
      sequence: block.entry.sequence,
      startTimeUs: block.entry.startTimeUs,
      entry: block.entry,
      initialSegment: initial,
      bytes: block.bytes,
    };
    const decoded = decodeCursorTrajectoryBlock(block.bytes, initial);
    if (!decoded) throw new Error('Invalid packed fixture.');
    for (const record of decoded.records) {
      if (record.kind === 'segment') initial = record;
      if (record.kind === 'boundary' || record.kind === 'gap') initial = null;
    }
    return row;
  });
  const readWindow = vi.fn(async (_identity: typeof identity, time: number) => {
    const current = Math.max(
      0,
      rows.findLastIndex((row) => row.startTimeUs <= time)
    );
    return {
      head,
      blocks: rows.slice(Math.max(0, current - 1), current + 2),
      fromTimeUs: rows[current]?.startTimeUs ?? 0,
      toTimeUs: rows[current + 1]?.startTimeUs ?? null,
    };
  });
  const reader = createRecordingCursorTrajectoryReader({ getHead: async () => head, readWindow });
  const read = vi.fn<ReadCursorTrajectoryWindow>((...args) => reader.read(...args));
  const project = createVideoProjectFromRecording({
    recordingId: identity.recordingId,
    filename: 'capture.webm',
    width: 100,
    height: 100,
    duration: 10,
    mimeType: 'video/webm',
    size: 100,
  });
  const clip = project.clips.find((item) => item.type === 'VIDEO');
  if (!clip || clip.type !== 'VIDEO') throw new Error('Missing source.');
  clip.sourceInstanceId = 'instance';
  project.cursorTrack = {
    captureMode: 'separate',
    skin: normalizeVideoProjectCursorSkin(undefined),
    samples: [],
    sourceObservations: [
      { ...identity, sourceInstanceId: 'instance', samples: [], trajectory: descriptor },
    ],
  };
  const region = {
    ...createVideoProjectMotionRegion(project, 0),
    startTime: 0,
    duration: 3,
    sourceBinding: {
      clipId: clip.id,
      coordinateSpace: 'source-window' as const,
      sourceStart: 0,
      sourceEnd: 3,
      animation: { start: 0, end: 3, duration: 3 },
    },
  };
  return { project, clip, region, read, reader, readWindow };
}

it.each(['available', 'foreign-source', 'unavailable'] as const)(
  'admits Cursor only for a real readable matching archive: %s',
  async (state) => {
    const { project, region, reader, read } = fixture();
    if (state === 'foreign-source')
      project.cursorTrack!.sourceObservations![0]!.sourceInstanceId = 'foreign';
    archiveFactory.mockReturnValue({
      available: (source: typeof project, motion: typeof region, signal?: AbortSignal) =>
        motionRegionHasAvailableCursor(
          source,
          motion,
          state === 'unavailable' ? async () => null : read,
          signal
        ),
      clear: () => reader.clear(),
    });
    const before = JSON.stringify(project);
    const panel = { ...createPanelProps(), project };
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () =>
        root.render(<MotionFocusModeField motionRegion={region} panel={panel} />)
      );
      const cursor = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find(
        (button) => button.textContent === 'editor.scene.cameraFollowCursor'
      );
      expect(cursor).toBeDefined();
      expect(cursor!.disabled).toBe(state !== 'available');
      if (state === 'available') {
        act(() => cursor!.click());
        expect(panel.onUpdateMotionRegion).toHaveBeenCalledWith(
          region.id,
          expect.objectContaining({ focusMode: 'CURSOR' })
        );
      } else expect(panel.onUpdateMotionRegion).not.toHaveBeenCalled();
      expect(JSON.stringify(project)).toBe(before);
      expect(project.cursorTrack?.samples).toEqual([]);
      expect(project.cursorTrack?.sourceObservations?.[0]?.samples).toEqual([]);
    } finally {
      act(() => root.unmount());
      host.remove();
    }
  }
);
