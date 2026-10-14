import { createCameraFollowSettings } from '../project/camera/cursor-policy';
import { expect, it } from 'vitest';
import { normalizeVideoProjectCursorSkin } from '../project/cursor';
import { deriveReviewCursorFocusPath } from './advanced/cursor-focus-path';
import { resolveProjectCursorFocusPath } from '../project/cursor-focus-path/projection';
import {
  authoredCursorFocusPath,
  updateCursorFocusKey,
  cursorFocusOverrideId,
} from '../project/cursor-focus-path/authoring';
import type {
  RecordingActionEvent,
  RecordingTelemetrySignal,
  VideoProjectCursorTrack,
} from '../project/types';
import { createVideoProjectFromRecording } from '../project/factories/creation';
import { parseHydratableVideoProject } from '../project/validation/root';
import { createQuickEditAdvancedContent } from './advanced/defaults';
import { applyRecordingReviewInteractions } from './standalone-interactions';

function recording() {
  return createVideoProjectFromRecording({
    recordingId: 'recording',
    filename: 'source.webm',
    width: 1280,
    height: 720,
    duration: 10,
    mimeType: 'video/webm',
    size: 4,
    recordingSignals: [],
  });
}
it('binds original-source keys and accepted feedback without altering their times or source facts', () => {
  const project = recording(),
    content = createQuickEditAdvancedContent();
  content.cursorFocusPath = {
    version: 1,
    mode: 'follow',
    gapPolicy: 'hold',
    smoothing: 0.5,
    sensitivity: 0.5,
    segments: [
      {
        id: 'segment',
        binding: { kind: 'project' },
        start: 1,
        end: 9,
        keys: [
          {
            id: 'key',
            time: 5,
            x: 0.2,
            y: 0.3,
            anchor: 'manual',
            interpolation: 'smooth',
            outgoing: { x: 0.4, y: 0.5 },
          },
        ],
      },
    ],
  };
  content.actionAudio = [
    {
      ref: { kind: 'signal', id: 'typed' },
      enabled: true,
      presetId: 'typing-recorded-v2',
      volume: 0.35,
      offset: 0,
    },
  ];
  const original = structuredClone(project),
    settings = structuredClone(content);
  const result = applyRecordingReviewInteractions(project, 'recording', content);
  const instance = project.clips.find((clip) => clip.type === 'VIDEO')?.sourceInstanceId;
  expect(result.cursorFocusPath?.segments[0]?.binding).toEqual({
    kind: 'recording-source',
    recordingId: 'recording',
    sourceInstanceId: instance,
  });
  expect(result.cursorFocusPath?.segments[0]?.keys).toEqual(
    content.cursorFocusPath.segments[0]?.keys
  );
  expect(result.actionFeedback?.[0]?.settings).toEqual(content.actionAudio);
  expect(result.version).toBe(3);
  expect(parseHydratableVideoProject(result)).not.toBeNull();
  expect(project).toEqual(original);
  expect(content).toEqual(settings);
  content.actionAudio[0]!.volume = 0.8;
  expect(result.actionFeedback?.[0]?.settings[0]?.volume).toBe(0.35);
  expect(
    applyRecordingReviewInteractions(result, 'recording', settings).actionFeedback
  ).toHaveLength(1);
});
it('preserves ordinary recordings and explicit master disablement, refusing another source', () => {
  const project = recording(),
    content = createQuickEditAdvancedContent();
  expect(applyRecordingReviewInteractions(project, 'recording', content)).toBe(project);
  content.actionsEnabled = false;
  expect(
    applyRecordingReviewInteractions(project, 'recording', content).actionPresentation?.enabled
  ).toBe(false);
  expect(() => applyRecordingReviewInteractions(project, 'other', content)).toThrow('unavailable');
});

it.each(['click:source-click', 'release:source-click', 'dwell-start:idle', 'dwell-end:idle'])(
  'keeps captured controls and override identity for %s through the real recording handoff',
  (capturedId) => {
    const cursorTrack: VideoProjectCursorTrack = {
      captureMode: 'embedded-fallback',
      skin: normalizeVideoProjectCursorSkin(undefined),
      samples: [0, 3, 6, 9].map((time, index) => ({
        id: `sample:${index}`,
        time,
        x: 256,
        y: 216,
        visible: true,
        recordingPoint: { x: 0.2, y: 0.3 },
        observation: 'observed',
        captureSegment: 0,
      })),
    };
    const actions: RecordingActionEvent[] = [
      {
        id: 'source-click',
        kind: 'CLICK',
        time: 1,
        duration: 0.45,
        point: { x: 256, y: 216 },
        recordingPoint: { x: 0.2, y: 0.3 },
        label: '',
        preset: 'CLICK_RIPPLE',
        data: {
          gestureId: 'source-click',
          gestureType: 'drag',
          button: 0,
          downTime: 1,
          downX: 256,
          downY: 216,
          upX: 512,
          upY: 360,
          maxExcursionCssPx: 300,
          pressDuration: 1,
          upTime: 2,
          recordingUpX: 0.4,
          recordingUpY: 0.5,
          completion: 'released',
          captureSegment: 0,
        },
      },
    ];
    const signals: RecordingTelemetrySignal[] = [
      {
        id: 'idle',
        kind: 'cursor-idle',
        startTime: 4,
        endTime: 5,
        point: { x: 256, y: 216 },
        recordingPoint: { x: 0.2, y: 0.3 },
        data: { captureSegment: 0 },
      },
    ];
    const project = createVideoProjectFromRecording({
      recordingId: 'recording',
      filename: 'handoff.webm',
      width: 1280,
      height: 720,
      duration: 10,
      mimeType: 'video/webm',
      size: 4,
      cursorTrack,
      recordingSignals: signals,
      sourceNormalizedActionEvents: actions.map((event) => ({
        ...event,
        point: event.recordingPoint!,
      })),
    });
    expect(parseHydratableVideoProject(project)).not.toBeNull();
    const content = createQuickEditAdvancedContent();
    let path = deriveReviewCursorFocusPath(
      { cursorTrack, actionEvents: actions, signals },
      {
        width: 1280,
        height: 720,
        duration: 10,
      }
    );
    path = updateCursorFocusKey(path, capturedId, {
      interpolation: 'linear',
      outgoing: { x: 0.25, y: 0.35 },
    });
    path = updateCursorFocusKey(path, capturedId, { x: 0.6, y: 0.7 });
    content.cursorFocusPath = authoredCursorFocusPath(path);
    const original = structuredClone(project),
      authored = structuredClone(content);
    const result = applyRecordingReviewInteractions(project, 'recording', content);
    const instance = result.clips.find((clip) => clip.type === 'VIDEO')!.sourceInstanceId!;
    const projectId = capturedId.startsWith('dwell-')
      ? capturedId.replace(':idle', `:${instance}:idle`)
      : capturedId.replace(':source-click', `:${result.actionEvents[0]!.id}`);
    const resolved = resolveProjectCursorFocusPath(result);
    expect(
      resolved.segments.flatMap((segment) => segment.keys).find((key) => key.id === projectId)
    ).toMatchObject({
      authored: true,
      interpolation: 'linear',
      outgoing: { x: 0.25, y: 0.35 },
    });
    const override = cursorFocusOverrideId(projectId);
    expect(
      resolved.segments.flatMap((segment) => segment.keys).find((key) => key.id === override)
    ).toMatchObject({ x: 0.6, y: 0.7 });
    const edited = updateCursorFocusKey(resolved, projectId, { x: 0.8 });
    const overrideKeys = edited.segments
      .flatMap((segment) => segment.keys)
      .filter((key) => key.anchor === 'manual');
    expect(overrideKeys).toHaveLength(1);
    expect(overrideKeys[0]).toMatchObject({ id: override, x: 0.8, y: 0.7 });
    expect(parseHydratableVideoProject(result)).not.toBeNull();
    expect(project).toEqual(original);
    expect(content).toEqual(authored);
  }
);

it('retains camera defaults through a settings-only Gallery-to-Montage handoff and native reopen', () => {
  const project = recording(),
    content = createQuickEditAdvancedContent();
  content.cameraFollowDefaults = createCameraFollowSettings('calm');
  const before = structuredClone(project);
  const result = applyRecordingReviewInteractions(project, 'recording', content);
  expect(result.version).toBe(4);
  expect(
    parseHydratableVideoProject(JSON.parse(JSON.stringify(result)))?.cameraFollowDefaults
  ).toEqual(content.cameraFollowDefaults);
  content.cameraFollowDefaults.zoneSize = 0.25;
  expect(result.cameraFollowDefaults?.zoneSize).toBe(0.55);
  expect(project).toEqual(before);
});
