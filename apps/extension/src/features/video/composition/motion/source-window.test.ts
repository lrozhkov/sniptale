import { VIDEO_PROJECT_ATTACHMENT_GEOMETRY } from '../../project/types/export';
import { normalizeVideoProjectCursorSkin } from '../../project/cursor';
import { motionCameraProjection } from './spatial';
import { quickEditPlaneProjection, projectQuickEditPoint } from './spatial-geometry';
import { expect, it } from 'vitest';
import { createVideoProjectMotionRegion } from '../../project/motion';
import { planReviewProjectConversion } from '../../review/project-conversion';
import { fixture } from '../../review/project-conversion.test-support';
import {
  computeQuickEditSceneLayout,
  computeQuickEditWindowTransform,
  computeQuickEditSpatialWindow,
  computeQuickEditSceneCamera,
  computeQuickEditSpatialRasterLayout,
  evaluateQuickEditCameraAtTime,
} from '../../review/advanced/scene';
import type { QuickEditZoomRegion } from '../../review/advanced/types';
import { getFittedMediaWindowFrame, getFittedMediaContentFrame } from '../draw/fitted-media';
import { shouldLockVisualLayerToViewport } from './layer-camera';
import { resolveVideoCompositionFrame, resolveVideoCompositionCursor } from '../timeline/frame';
import { applyVideoProjectMutationPatch } from '../../project/mutation';
import { isExportReadyVideoProject } from '../../project/validation/root';
import { motionWindowFocusToComposition } from './source-window';
import {
  mapCompositionPointThroughCamera,
  mapViewportPointToComposition,
  resolveVideoCompositionCamera,
} from './index';

it.each([false, true])(
  'matches Gallery window corners with crop header padding and spatial=%s',
  (spatial) => {
    const input = fixture();
    input.document.advancedContent.canvas = {
      width: 320,
      height: 360,
      crop: { x: 0.1, y: 0.1, width: 0.7, height: 0.8 },
    };
    input.document.advancedContent.windowHeader = {
      kind: 'browser',
      style: 'windows',
      theme: 'light',
      title: 'Window',
      url: 'https://example.com',
      faviconEnabled: false,
    };
    input.document.advancedContent.background = {
      enabled: true,
      type: 'solid',
      color: '#123456ff',
      zoomBehavior: 'window',
      layout: {
        padding: 17.25,
        cornerRadius: 18,
        blur: 0,
        shadow: { intensity: 0, color: '#090a0bcc' },
      },
    };
    const converted = planReviewProjectConversion(input);
    if (converted.status !== 'prepared') throw new Error(JSON.stringify(converted));
    const project = converted.project;
    const clip = project.clips.find((item) => item.type === 'VIDEO')!;
    if (clip.type !== 'VIDEO') throw new Error('Expected video');
    const focus: QuickEditZoomRegion = {
      id: 'focus',
      start: 0,
      end: 2,
      transform: { scale: 2.5, centerX: 0.35, centerY: 0.6 },
      enter: { type: 'linear', duration: 0.5 },
      exit: { type: 'linear', duration: 0.5 },
    };
    if (spatial)
      focus.perspective = { enabled: true, rotateX: 18, rotateY: -23, rotateZ: 7, strength: 0.6 };
    project.motionRegions = [
      {
        ...createVideoProjectMotionRegion(project, 0, { enter: 'linear', exit: 'linear' }),
        id: 'focus',
        duration: 2,
        scale: focus.transform.scale,
        focusMode: 'MANUAL',
        focusPoint: { x: project.width * 0.35, y: project.height * 0.6 },
        ...(focus.perspective ? { perspective: focus.perspective } : {}),
        zoomInDuration: 0.5,
        zoomOutDuration: 0.5,
        sourceBinding: {
          clipId: clip.id,
          coordinateSpace: 'source-window',
          sourceStart: 0,
          sourceEnd: 2,
          animation: { start: 0, end: 2, duration: 2 },
        },
      },
    ];
    const window = getFittedMediaWindowFrame({
      frame: clip.transform,
      fitMode: clip.fitMode,
      sourceWidth: input.source.width,
      sourceHeight: input.source.height,
      ...(clip.sourceCrop ? { sourceCrop: clip.sourceCrop } : {}),
      ...(clip.windowHeader ? { windowHeader: clip.windowHeader } : {}),
    });
    const second = {
      ...clip,
      id: 'independent',
      sourceInstanceId: 'independent',
      transform: { ...clip.transform, x: 200, y: 180, width: 100, height: 90 },
    };
    project.clips.push(second);
    const saved = applyVideoProjectMutationPatch(project, { motionRegions: project.motionRegions });
    expect(saved.version).toBe(34);
    expect(isExportReadyVideoProject(JSON.parse(JSON.stringify(saved)))).toBe(true);
    const scene = {
      source: input.source,
      output: { width: project.width, height: project.height },
      ...(input.document.advancedContent.canvas
        ? { canvas: input.document.advancedContent.canvas }
        : {}),
      background: input.document.advancedContent.background,
      windowHeader: input.document.advancedContent.windowHeader,
    };
    for (const time of [0.125, 0.25, 0.5, 1, 1.75, 1.875]) {
      const layout = computeQuickEditSceneLayout({
        ...scene,
        camera: evaluateQuickEditCameraAtTime([focus], time, scene),
      });
      const expected = computeQuickEditWindowTransform(layout);
      const actual = resolveVideoCompositionCamera({
        project,
        currentTime: time,
        actions: [],
        cursorSample: null,
      });
      const topLeft = mapCompositionPointThroughCamera({ x: window.x, y: window.y }, actual)!;
      const bottomRight = mapCompositionPointThroughCamera(
        { x: window.x + window.width, y: window.y + window.height },
        actual
      )!;
      expect(actual.sourceClipId).toBe(clip.id);
      const frame = resolveVideoCompositionFrame(project, time);
      const ownerLayer = frame.visualLayers.find((item) => item.clipId === clip.id)!;
      const independentLayer = frame.visualLayers.find((item) => item.clipId === second.id)!;
      expect(shouldLockVisualLayerToViewport(ownerLayer, actual)).toBe(false);
      expect(shouldLockVisualLayerToViewport(independentLayer, actual)).toBe(true);
      const rawPoint = project.motionRegions[0]!.focusPoint!;
      const scenePoint = motionWindowFocusToComposition(
        project,
        project.motionRegions[0]!,
        rawPoint,
        time
      );
      const restored = motionWindowFocusToComposition(
        project,
        project.motionRegions[0]!,
        scenePoint,
        time,
        true
      );
      expect(restored.x).toBeCloseTo(rawPoint.x, 9);
      expect(restored.y).toBeCloseTo(rawPoint.y, 9);
      if (layout.spatial) {
        const matrix = quickEditPlaneProjection(
          layout.windowRect,
          computeQuickEditSpatialWindow(layout, scene.background),
          layout.spatial
        );
        const expectedLeft = projectQuickEditPoint(matrix, { x: window.x, y: window.y })!;
        const expectedRight = projectQuickEditPoint(matrix, {
          x: window.x + window.width,
          y: window.y + window.height,
        })!;
        expect(topLeft.x).toBeCloseTo(expectedLeft.x, 7);
        expect(topLeft.y).toBeCloseTo(expectedLeft.y, 7);
        expect(bottomRight.x).toBeCloseTo(expectedRight.x, 7);
        expect(bottomRight.y).toBeCloseTo(expectedRight.y, 7);
      } else {
        expect(topLeft.x, `left at ${time}`).toBeCloseTo(expected.x, 7);
        expect(topLeft.y, `top at ${time}`).toBeCloseTo(expected.y, 7);
        expect(bottomRight.x - topLeft.x).toBeCloseTo(expected.width, 7);
        expect(bottomRight.y - topLeft.y).toBeCloseTo(expected.height, 7);
      }
    }
  }
);

it.each(
  [false, true].flatMap((decorated) =>
    [false, true].flatMap((moving) =>
      (['none', 'linear', 'ease-in-out', 'implicit'] as const).map(
        (phase) => [decorated, moving, phase] as const
      )
    )
  )
)(
  'matches Gallery recorded follow across rates with decorated=%s moving=%s phase=%s',
  async (decorated, moving, phase) => {
    const curve = phase === 'implicit' ? 'ease-in-out' : phase;
    const { createVideoProjectFromRecording } = await import('../../project/factories/creation');
    const { normalizeVideoProjectCursorSkin } = await import('../../project/cursor');
    const { deriveReviewCursorFocusPath } = await import('../../review/advanced/cursor-focus-path');
    const { projectReviewFocus } = await import('../../review/focus-edits');
    const { buildReviewTimeMap } = await import('../../review/timeline');
    const { projectMotionSourceBinding } = await import('../../project/motion/source-binding');
    const input = fixture();
    input.document.edits = [
      {
        id: 'speed',
        kind: 'speed',
        start: 1,
        end: 3,
        requestedStart: 1,
        requestedEnd: 3,
        rate: 2,
        audio: 'speed',
      },
    ];
    const facts = {
      captureMode: 'embedded-fallback' as const,
      skin: normalizeVideoProjectCursorSkin(undefined),
      samples: [0, 2, 4, 8].map((time, index) => ({
        id: `sample-${index}`,
        time,
        x: 640 * (moving ? [0.3, 0.35, 0.65, 0.7][index]! : 0.58),
        y: 360 * 0.53,
        visible: true,
        observation: 'observed' as const,
        recordingPoint: { x: moving ? [0.3, 0.35, 0.65, 0.7][index]! : 0.58, y: 0.53 },
        captureSegment: 0,
      })),
    };
    input.seed = createVideoProjectFromRecording({
      ...input.source,
      filename: 'Follow.webm',
      recordingId: 'recording',
      hasAudio: false,
      cursorTrack: facts,
    });
    if (decorated) {
      input.document.advancedContent.canvas = {
        width: 320,
        height: 360,
        crop: { x: 0.1, y: 0.1, width: 0.7, height: 0.8 },
      };
      input.document.advancedContent.windowHeader = {
        kind: 'browser',
        style: 'windows',
        theme: 'light',
        title: 'Window',
        url: 'https://example.com',
        faviconEnabled: false,
      };
      input.document.advancedContent.background = {
        enabled: true,
        type: 'solid',
        color: '#123456ff',
        zoomBehavior: 'window',
        layout: {
          padding: 17.25,
          cornerRadius: 18,
          blur: 0,
          shadow: { intensity: 0, color: '#090a0bcc' },
        },
      };
    }
    const converted = planReviewProjectConversion(input);
    if (converted.status !== 'prepared') throw new Error(JSON.stringify(converted));
    const project = converted.project;
    const scene = {
      source: input.source,
      output: { width: project.width, height: project.height },
      ...(input.document.advancedContent.canvas
        ? { canvas: input.document.advancedContent.canvas }
        : {}),
      background: input.document.advancedContent.background,
      ...(input.document.advancedContent.windowHeader
        ? { windowHeader: input.document.advancedContent.windowHeader }
        : {}),
    };
    const path = deriveReviewCursorFocusPath(
      { cursorTrack: facts, actionEvents: [], signals: [] },
      input.source
    );
    path.mode = 'follow';
    const focus: QuickEditZoomRegion = {
      id: 'follow',
      start: 0,
      end: 8,
      sourceAnchor: { start: 0, end: 8 },
      transform: { scale: 2, centerX: 0.5, centerY: 0.5 },
      enter: { type: curve, duration: phase === 'none' ? 0 : 2 },
      exit: { type: curve, duration: phase === 'none' ? 0 : 1 },
      cursorFocus: {
        scene,
        path,
        observed: deriveReviewCursorFocusPath(
          { cursorTrack: facts, actionEvents: [], signals: [] },
          input.source,
          true
        ),
        timeMap: buildReviewTimeMap(8, input.document.edits),
      },
    };
    const gallery = projectReviewFocus([focus], focus.cursorFocus!.timeMap!);
    project.motionRegions = project.clips
      .filter((clip) => clip.type === 'VIDEO')
      .map((clip) =>
        projectMotionSourceBinding(project, {
          ...createVideoProjectMotionRegion(
            project,
            0,
            phase === 'implicit' ? undefined : { enter: phase, exit: phase }
          ),
          id: `follow:${clip.id}`,
          duration: 8,
          scale: 2,
          focusMode: 'CURSOR',
          zoomInDuration: focus.enter.duration,
          zoomOutDuration: focus.exit.duration,
          focusPoint: { x: project.width / 2, y: project.height / 2 },
          sourceBinding: {
            clipId: clip.id,
            animationGroupId: 'follow',
            phaseProjection: 'retained-result',
            coordinateSpace: 'source-window',
            sourceStart: 0,
            sourceEnd: 8,
            animation: { start: 0, end: 8, duration: 8 },
          },
        })
      );
    for (const time of [0.125, 1.25, 1.75, 2.5, 6.75, 0.5]) {
      const layout = computeQuickEditSceneLayout({
        ...scene,
        camera: evaluateQuickEditCameraAtTime(gallery, time, scene),
      });
      const expected = computeQuickEditSceneCamera(layout, scene.background).windowClip;
      const clip = project.clips.find(
        (item) =>
          item.type === 'VIDEO' && item.startTime <= time && item.startTime + item.duration > time
      )!;
      if (clip.type !== 'VIDEO') throw new Error('Expected video');
      const window = getFittedMediaWindowFrame({
        frame: clip.transform,
        fitMode: clip.fitMode,
        sourceWidth: input.source.width,
        sourceHeight: input.source.height,
        ...(clip.sourceCrop ? { sourceCrop: clip.sourceCrop } : {}),
        ...(clip.windowHeader ? { windowHeader: clip.windowHeader } : {}),
      });
      const actual = resolveVideoCompositionCamera({
        project,
        currentTime: time,
        actions: [],
        cursorSample: null,
      });
      const corner = mapCompositionPointThroughCamera({ x: window.x, y: window.y }, actual)!;
      expect(corner.x, `left at ${time}`).toBeCloseTo(expected.x, 6);
      expect(corner.y, `top at ${time}`).toBeCloseTo(expected.y, 6);
      expect(actual.scale).toBeCloseTo(expected.width / window.width, 8);
      expect(actual.sourceClipId).toBe(clip.id);
      const video = getFittedMediaContentFrame({
        frame: clip.transform,
        fitMode: clip.fitMode,
        sourceWidth: input.source.width,
        sourceHeight: input.source.height,
        ...(clip.sourceCrop ? { sourceCrop: clip.sourceCrop } : {}),
        ...(clip.windowHeader ? { windowHeader: clip.windowHeader } : {}),
      });
      const sourcePoint = { x: video.x + video.width * 0.3, y: video.y + video.height * 0.6 };
      const inner = actual.sourceContentTransform
        ? projectQuickEditPoint(actual.sourceContentTransform, sourcePoint)!
        : sourcePoint;
      const body = mapCompositionPointThroughCamera(inner, actual)!;
      expect(body.x, `source x at ${time}`).toBeCloseTo(
        layout.videoTransform.x + layout.videoTransform.width * 0.3,
        6
      );
      expect(body.y, `source y at ${time}`).toBeCloseTo(
        layout.videoTransform.y + layout.videoTransform.height * 0.6,
        6
      );
    }
  }
);

it.each(['MANUAL', 'CURSOR'] as const)(
  'uses the shared window phase curve for Native %s without rewriting authored phases',
  (focusMode) => {
    const converted = planReviewProjectConversion(fixture());
    if (converted.status !== 'prepared') throw new Error(JSON.stringify(converted));
    const project = converted.project;
    project.sceneBackground = { ...project.sceneBackground!, zoomBehavior: 'window' };
    const clip = project.clips.find((item) => item.type === 'VIDEO')!;
    const region = {
      ...createVideoProjectMotionRegion(project, 0),
      duration: 2,
      scale: 2,
      focusMode,
      zoomInDuration: 0.5,
      zoomOutDuration: 0.5,
      sourceBinding: {
        clipId: clip.id,
        coordinateSpace: 'source-window' as const,
        sourceStart: 0,
        sourceEnd: 2,
        animation: { start: 0, end: 2, duration: 2 },
      },
    };
    project.motionRegions = [region];
    const canonical = {
      ...project,
      motionRegions: [
        {
          ...region,
          phaseTransitions: { enter: 'ease-in-out' as const, exit: 'ease-in-out' as const },
        },
      ],
    };
    const before = structuredClone(project);
    for (const currentTime of [0.125, 0.375, 1.625, 1.875]) {
      const actual = resolveVideoCompositionCamera({
        project,
        currentTime,
        actions: [],
        cursorSample: null,
      });
      const expected = resolveVideoCompositionCamera({
        project: canonical,
        currentTime,
        actions: [],
        cursorSample: null,
      });
      expect(actual.scale).toBeCloseTo(expected.scale, 9);
      expect(actual.viewportX).toBeCloseTo(expected.viewportX, 7);
      expect(actual.viewportY).toBeCloseTo(expected.viewportY, 7);
    }
    expect(project).toEqual(before);
    expect(region.phaseTransitions).toBeUndefined();
  }
);

it('keeps cropped follow fallback after trimming the start of its authored clock', async () => {
  const { createVideoProjectFromRecording } = await import('../../project/factories/creation');
  const project = createVideoProjectFromRecording({
    recordingId: 'fallback',
    filename: 'Fallback.webm',
    width: 640,
    height: 360,
    duration: 8,
    mimeType: 'video/webm',
    size: 100,
    hasAudio: false,
  });
  const clip = project.clips[0]!;
  if (clip.type !== 'VIDEO') throw new Error('Expected video');
  clip.sourceCrop = { x: 0.2, y: 0.1, width: 0.6, height: 0.8 };
  const region = {
    ...createVideoProjectMotionRegion(project, 0, { enter: 'linear', exit: 'linear' }),
    duration: 8,
    scale: 2.5,
    focusMode: 'CURSOR' as const,
    focusPoint: { x: 640 * 0.3, y: 360 * 0.65 },
    animation: { start: 0, end: 8, duration: 8 },
    sourceBinding: {
      clipId: clip.id,
      coordinateSpace: 'source-window' as const,
      sourceStart: 0,
      sourceEnd: 8,
      animation: { start: 0, end: 8, duration: 8 },
    },
  };
  project.motionRegions = [region];
  const trimmed = {
    ...project,
    clips: [{ ...clip, startTime: 1, duration: 7, sourceStart: 1, sourceDuration: 7 }],
    motionRegions: [
      { ...region, startTime: 1, duration: 7, animation: { start: 1, end: 8, duration: 8 } },
    ],
  };
  const before = structuredClone(trimmed);
  for (const currentTime of [1.25, 3, 7.875]) {
    const actual = resolveVideoCompositionCamera({
      project: trimmed,
      currentTime,
      actions: [],
      cursorSample: null,
    });
    const expected = resolveVideoCompositionCamera({
      project,
      currentTime,
      actions: [],
      cursorSample: null,
    });
    expect(actual.viewportX).toBeCloseTo(expected.viewportX, 7);
    expect(actual.viewportY).toBeCloseTo(expected.viewportY, 7);
    expect(actual.scale).toBeCloseTo(expected.scale, 9);
  }
  expect(trimmed).toEqual(before);
});

it.each(
  [false, true].flatMap((cut) =>
    (['linear', 'ease-in-out'] as const).map((curve) => [curve, cut] as const)
  )
)(
  'matches Gallery linked manual windows with %s curve across cut=%s and leaves another video fixed',
  (easing, cut) => {
    const input = fixture();
    input.document.edits = [];
    input.document.advancedContent.canvas = {
      width: 400,
      height: 360,
      crop: { x: 0.1, y: 0.1, width: 0.7, height: 0.8 },
    };
    input.document.advancedContent.background = {
      enabled: true,
      type: 'solid',
      color: '#123456ff',
      zoomBehavior: 'window',
      layout: {
        padding: 15,
        cornerRadius: 0,
        blur: 0,
        shadow: { intensity: 0, color: '#000000ff' },
      },
    };
    const result = planReviewProjectConversion(input);
    if (result.status !== 'prepared') throw new Error(JSON.stringify(result));
    const project = result.project;
    const clip = project.clips.find((item) => item.type === 'VIDEO')!;
    if (clip.type !== 'VIDEO') throw new Error('Expected video');
    const first: QuickEditZoomRegion = {
      id: 'first',
      start: 0,
      end: 2,
      transform: { scale: 2, centerX: 0.3, centerY: 0.6 },
      enter: { type: 'linear', duration: 0.5 },
      exit: { type: 'linear', duration: 0.5 },
      linkTo: 'second',
      linkEasing: easing,
    };
    const second: QuickEditZoomRegion = {
      ...first,
      id: 'second',
      start: 4,
      end: 6,
      transform: { scale: 3, centerX: 0.65, centerY: 0.4 },
    };
    delete second.linkTo;
    delete second.linkEasing;
    project.motionRegions = [first, second].map((region) => ({
      ...createVideoProjectMotionRegion(project, region.start, {
        enter: region.enter.type,
        exit: region.exit.type,
      }),
      id: region.id,
      startTime: region.start,
      duration: region.end - region.start,
      scale: region.transform.scale,
      focusMode: 'MANUAL',
      focusPoint: {
        x: region.transform.centerX * project.width,
        y: region.transform.centerY * project.height,
      },
      zoomInDuration: region.enter.duration,
      zoomOutDuration: region.exit.duration,
      ...(region.id === 'second'
        ? {
            incomingConnection: {
              fromRegionId: 'first',
              easing: easing === 'linear' ? 'LINEAR' : 'EASE_IN_OUT',
            },
          }
        : {}),
      sourceBinding: {
        clipId: clip.id,
        coordinateSpace: 'source-window',
        sourceStart: region.start,
        sourceEnd: region.end,
        animation: { start: 0, end: 2, duration: 2 },
      },
    }));
    const other = {
      ...clip,
      id: 'other',
      sourceInstanceId: 'other',
      transform: { ...clip.transform, x: 250, width: 70 },
    };
    project.clips.push(other);
    if (cut) {
      const tail = {
        ...clip,
        id: 'retained-tail',
        startTime: 3,
        duration: 4,
        sourceStart: 4,
        sourceDuration: 4,
      };
      clip.duration = 3;
      clip.sourceDuration = 3;
      project.clips.push(tail);
      const destination = project.motionRegions[1]!;
      destination.sourceBinding = {
        ...destination.sourceBinding!,
        clipId: tail.id,
        sourceStart: 5,
        sourceEnd: 7,
      };
    }
    const before = structuredClone(project);
    const scene = {
      source: input.source,
      output: { width: project.width, height: project.height },
      canvas: input.document.advancedContent.canvas,
      background: input.document.advancedContent.background,
    };
    const window = getFittedMediaWindowFrame({
      frame: clip.transform,
      fitMode: clip.fitMode,
      sourceWidth: input.source.width,
      sourceHeight: input.source.height,
      ...(clip.sourceCrop ? { sourceCrop: clip.sourceCrop } : {}),
    });
    for (const time of [0.125, 1.875, 2, 2.00001, 2.5, 3, 3.5, 3.999, 4, 4.125, 5.875]) {
      const expected = computeQuickEditWindowTransform(
        computeQuickEditSceneLayout({
          ...scene,
          camera: evaluateQuickEditCameraAtTime([first, second], time, scene),
        })
      );
      const actual = resolveVideoCompositionCamera({
        project,
        currentTime: time,
        actions: [],
        cursorSample: null,
      });
      const point = mapCompositionPointThroughCamera(window, actual)!;
      expect(actual.sourceClipId, `scope at ${time}`).toBe(
        cut && time >= 3 ? 'retained-tail' : clip.id
      );
      expect(point.x, `left at ${time}`).toBeCloseTo(expected.x, 7);
      expect(point.y, `top at ${time}`).toBeCloseTo(expected.y, 7);
      expect(actual.scale, `scale at ${time}`).toBeCloseTo(expected.width / window.width, 8);
      const layer = resolveVideoCompositionFrame(project, time).visualLayers.find(
        (item) => item.clipId === other.id
      )!;
      expect(shouldLockVisualLayerToViewport(layer, actual)).toBe(true);
    }
    expect(project).toEqual(before);
  }
);

it.each(
  [false, true].flatMap((excursion) =>
    [false, true].flatMap((instant) =>
      [0, 30, -135].map((rotation) => [excursion, instant, rotation] as const)
    )
  )
)(
  'checks an exported follow-link fragment against native observations with excursion=%s instant=%s rotation=%s',
  async (excursion, instant, rotation) => {
    const { createVideoProjectFromRecording } = await import('../../project/factories/creation');
    const { normalizeVideoProjectCursorSkin } = await import('../../project/cursor');
    const { resolveProjectCameraConflicts } = await import('./project-follow');
    const project = createVideoProjectFromRecording({
      recordingId: 'link-observations',
      filename: 'Link.webm',
      width: 1000,
      height: 600,
      duration: 4,
      mimeType: 'video/webm',
      size: 100,
      hasAudio: false,
      cursorTrack: {
        captureMode: 'embedded-fallback',
        skin: normalizeVideoProjectCursorSkin(undefined),
        samples: [0, 1, 2, 3, 4].map((time) => {
          const x =
            excursion && time === 2
              ? 0.05
              : instant
                ? time <= 1
                  ? 0.3
                  : time >= 3
                    ? 0.7
                    : 0.5
                : 0.5;
          return {
            id: `sample-${time}`,
            time,
            x: x * 1000,
            y: 300,
            visible: true,
            observation: 'observed',
            captureSegment: 0,
            recordingPoint: { x, y: 0.5 },
          };
        }),
      },
    });
    const clip = project.clips[0]!;
    clip.transform.rotation = rotation;
    const first = {
      ...createVideoProjectMotionRegion(project, 0, { enter: 'none', exit: 'none' }),
      id: 'from',
      duration: 1,
      scale: 2,
      focusMode: 'CURSOR' as const,
      zoomInDuration: 0,
      zoomOutDuration: 0,
      sourceBinding: {
        clipId: clip.id,
        coordinateSpace: 'source-window' as const,
        sourceStart: 0,
        sourceEnd: 1,
        animation: { start: 0, end: 1, duration: 1 },
      },
    };
    const second = {
      ...first,
      id: 'to',
      startTime: 3,
      focusMode: 'MANUAL' as const,
      ...(instant ? { focusPoint: { x: 700, y: 300 } } : {}),
      sourceBinding: { ...first.sourceBinding, sourceStart: 3, sourceEnd: 4 },
      incomingConnection: {
        fromRegionId: first.id,
        easing: instant ? ('INSTANT' as const) : ('LINEAR' as const),
      },
    };
    project.motionRegions = [first, second];
    const before = structuredClone(project);
    expect(resolveProjectCameraConflicts(project, undefined, { start: 0, end: 0.5 })).toEqual([]);
    const conflicts = resolveProjectCameraConflicts(project, undefined, { start: 1.9, end: 2.1 });
    expect(
      resolveProjectCameraConflicts(
        { ...project, clips: [], [VIDEO_PROJECT_ATTACHMENT_GEOMETRY]: project },
        undefined,
        { start: 1.9, end: 2.1 }
      )
    ).toEqual(conflicts);
    if (excursion || instant)
      expect(conflicts).toContainEqual(
        expect.objectContaining({
          regionId: 'from',
          interval: { start: 1, end: 3 },
          reason: 'viewport',
        })
      );
    else expect(conflicts).toEqual([]);
    expect(project).toEqual(before);
  }
);

it.each(
  [30, 90, -135].flatMap((rotation) => [false, true].map((spatial) => [rotation, spatial] as const))
)('keeps source-window camera attached at %s degrees with spatial=%s', (rotation, spatial) => {
  const input = fixture();
  input.document.edits = [];
  const converted = planReviewProjectConversion(input);
  if (converted.status !== 'prepared') throw new Error(JSON.stringify(converted));
  const project = converted.project;
  const clip = project.clips.find((item) => item.type === 'VIDEO')!;
  if (clip.type !== 'VIDEO') throw new Error('Expected video');
  clip.transform = { ...clip.transform, x: 80, y: 45, width: 400, height: 225 };
  const region = {
    ...createVideoProjectMotionRegion(project, 0, { enter: 'linear', exit: 'linear' }),
    duration: 2,
    scale: 2.5,
    focusMode: 'MANUAL' as const,
    focusPoint: { x: project.width * 0.35, y: project.height * 0.6 },
    zoomInDuration: 0.5,
    zoomOutDuration: 0.5,
    sourceBinding: {
      clipId: clip.id,
      coordinateSpace: 'source-window' as const,
      sourceStart: 0,
      sourceEnd: 2,
      animation: { start: 0, end: 2, duration: 2 },
    },
  };
  if (spatial)
    Object.assign(region, {
      perspective: { enabled: true, rotateX: 18, rotateY: -23, rotateZ: 7, strength: 0.6 },
    });
  project.motionRegions = [region];
  project.clips.push({
    ...clip,
    id: 'independent-affine-video',
    sourceInstanceId: 'independent-affine-instance',
    transform: { ...clip.transform, x: 20, y: 20, width: 100, height: 60 },
  });
  const rotated = structuredClone(project);
  rotated.clips[0]!.transform.rotation = rotation;
  const center = {
    x: clip.transform.x + clip.transform.width / 2,
    y: clip.transform.y + clip.transform.height / 2,
  };
  const angle = (rotation * Math.PI) / 180;
  const turn = (point: { x: number; y: number }) => ({
    x: center.x + (point.x - center.x) * Math.cos(angle) - (point.y - center.y) * Math.sin(angle),
    y: center.y + (point.x - center.x) * Math.sin(angle) + (point.y - center.y) * Math.cos(angle),
  });
  const before = structuredClone(rotated);
  for (const currentTime of [0.125, 0.375, 1, 1.625, 1.875]) {
    const base = resolveVideoCompositionCamera({
      project,
      currentTime,
      actions: [],
      cursorSample: null,
    });
    const actual = resolveVideoCompositionCamera({
      project: rotated,
      currentTime,
      actions: [],
      cursorSample: null,
    });
    for (const point of [
      clip.transform,
      { x: clip.transform.x + 400, y: clip.transform.y + 225 },
    ]) {
      const expected = turn(mapCompositionPointThroughCamera(point, base)!);
      const result = mapCompositionPointThroughCamera(turn(point), actual)!;
      expect(result.x, `corner x at ${currentTime}`).toBeCloseTo(expected.x, 7);
      expect(result.y, `corner y at ${currentTime}`).toBeCloseTo(expected.y, 7);
      const restoredPoint = mapViewportPointToComposition(result, actual)!;
      expect(restoredPoint.x).toBeCloseTo(turn(point).x, 7);
      expect(restoredPoint.y).toBeCloseTo(turn(point).y, 7);
      if (actual.spatial)
        for (const rasterScale of [0.5, 2]) {
          const rasterPoint = projectQuickEditPoint(motionCameraProjection(actual, rasterScale)!, {
            x: turn(point).x * rasterScale,
            y: turn(point).y * rasterScale,
          })!;
          expect(rasterPoint.x).toBeCloseTo(expected.x * rasterScale, 7);
          expect(rasterPoint.y).toBeCloseTo(expected.y * rasterScale, 7);
        }
    }
    expect(actual.sourceClipId).toBe(clip.id);
    const other = resolveVideoCompositionFrame(rotated, currentTime).visualLayers.find(
      (layer) => layer.clipId === 'independent-affine-video'
    )!;
    expect(shouldLockVisualLayerToViewport(other, actual)).toBe(true);
    const expectedFocus = turn(base.focusPoint);
    expect(actual.focusPoint.x).toBeCloseTo(expectedFocus.x, 7);
    expect(actual.focusPoint.y).toBeCloseTo(expectedFocus.y, 7);
    const world = motionWindowFocusToComposition(rotated, region, region.focusPoint, currentTime);
    expect(world.x).toBeCloseTo(expectedFocus.x, 7);
    expect(world.y).toBeCloseTo(expectedFocus.y, 7);
    const restored = motionWindowFocusToComposition(rotated, region, world, currentTime, true);
    expect(restored.x).toBeCloseTo(region.focusPoint.x, 7);
    expect(restored.y).toBeCloseTo(region.focusPoint.y, 7);
  }
  expect(rotated).toEqual(before);
});

it.each(
  (['window', 'content', 'fixed', 'follow-video'] as const).flatMap((mode) =>
    [false, true].flatMap((spatial) => [0, 21].map((rotation) => ({ mode, spatial, rotation })))
  )
)(
  'matches Gallery planes for $mode spatial=$spatial rotation=$rotation',
  ({ mode, spatial, rotation }) => {
    const input = fixture();
    input.document.advancedContent.background = {
      enabled: true,
      type: 'solid',
      color: '#123456ff',
      zoomBehavior: 'window',
      layout: { padding: 40, cornerRadius: 0, blur: 0 },
    };
    const converted = planReviewProjectConversion(input);
    if (converted.status !== 'prepared') throw new Error(JSON.stringify(converted));
    const project = converted.project;
    project.version = 37;
    project.sceneBackground = { ...project.sceneBackground!, zoomBehavior: mode };
    input.document.advancedContent.background.zoomBehavior = mode;
    const clip = project.clips.find((item) => item.type === 'VIDEO')!;
    if (clip.type !== 'VIDEO') throw new Error('Expected video');
    clip.transform.rotation = rotation;
    project.cursorTrack = {
      captureMode: 'separate',
      skin: normalizeVideoProjectCursorSkin(undefined),
      samples: [
        {
          id: 'cursor',
          time: 0,
          x: 0,
          y: 0,
          visible: true,
          recordingPoint: { x: 0.3, y: 0.6 },
          sourceAnchor: {
            kind: 'recording-source',
            recordingId: 'recording',
            sourceClipId: clip.id,
            sourceTime: 0,
          },
        },
      ],
    };
    const rotatePoint = (point: { x: number; y: number }) => {
      const angle = (rotation * Math.PI) / 180;
      const center = {
        x: clip.transform.x + clip.transform.width / 2,
        y: clip.transform.y + clip.transform.height / 2,
      };
      const dx = point.x - center.x,
        dy = point.y - center.y;
      return {
        x: center.x + dx * Math.cos(angle) - dy * Math.sin(angle),
        y: center.y + dx * Math.sin(angle) + dy * Math.cos(angle),
      };
    };
    const focus: QuickEditZoomRegion = {
      id: 'focus',
      start: 0,
      end: 2,
      transform: { scale: 2.5, centerX: 0.4, centerY: 0.65 },
      enter: { type: 'linear', duration: 0.5 },
      exit: { type: 'linear', duration: 0.5 },
      ...(spatial
        ? {
            perspective: { enabled: true, rotateX: 18, rotateY: -23, rotateZ: 7, strength: 0.6 },
          }
        : {}),
    };
    project.motionRegions = [
      {
        ...createVideoProjectMotionRegion(project, 0, { enter: 'linear', exit: 'linear' }),
        id: focus.id,
        duration: 2,
        scale: focus.transform.scale,
        focusMode: 'MANUAL',
        focusPoint: { x: project.width * 0.4, y: project.height * 0.65 },
        zoomInDuration: 0.5,
        zoomOutDuration: 0.5,
        ...(focus.perspective ? { perspective: focus.perspective } : {}),
        sourceBinding: {
          clipId: clip.id,
          coordinateSpace: 'source-window',
          sourceStart: 0,
          sourceEnd: 2,
          animation: { start: 0, end: 2, duration: 2 },
        },
      },
    ];
    const window = getFittedMediaWindowFrame({
      frame: clip.transform,
      fitMode: clip.fitMode,
      sourceWidth: input.source.width,
      sourceHeight: input.source.height,
    });
    const scene = {
      source: input.source,
      output: { width: project.width, height: project.height },
      background: input.document.advancedContent.background,
    };
    for (const time of [0.125, 0.25, 0.5, 1, 1.75, 1.875]) {
      const layout = computeQuickEditSceneLayout({
        ...scene,
        camera: evaluateQuickEditCameraAtTime([focus], time, scene),
      });
      const outer = computeQuickEditSceneCamera(layout, scene.background).windowClip;
      const actual = resolveVideoCompositionCamera({
        project,
        currentTime: time,
        actions: [],
        cursorSample: null,
      });
      const matrix = layout.spatial
        ? quickEditPlaneProjection(window, outer, layout.spatial)
        : null;
      const expectedOuter = rotatePoint(matrix ? projectQuickEditPoint(matrix, window)! : outer);
      const actualOuter = mapCompositionPointThroughCamera(rotatePoint(window), actual)!;
      expect(actualOuter.x, `window x ${time}`).toBeCloseTo(expectedOuter.x, 7);
      expect(actualOuter.y, `window y ${time}`).toBeCloseTo(expectedOuter.y, 7);
      const raster = layout.spatial
        ? computeQuickEditSpatialRasterLayout(layout, scene.background)
        : layout;
      const sourcePoint = { x: window.x + window.width * 0.3, y: window.y + window.height * 0.6 };
      const inner = actual.sourceContentTransform
        ? projectQuickEditPoint(actual.sourceContentTransform, sourcePoint)!
        : sourcePoint;
      const actualBody = mapCompositionPointThroughCamera(rotatePoint(inner), actual)!;
      const expectedPoint = {
        x: raster.videoTransform.x + raster.videoTransform.width * 0.3,
        y: raster.videoTransform.y + raster.videoTransform.height * 0.6,
      };
      const expectedBody = rotatePoint(
        matrix ? projectQuickEditPoint(matrix, expectedPoint)! : expectedPoint
      );
      expect(actualBody.x, `content x ${time}`).toBeCloseTo(expectedBody.x, 7);
      expect(actualBody.y, `content y ${time}`).toBeCloseTo(expectedBody.y, 7);
      const cursor = resolveVideoCompositionFrame(project, time).cursor;
      expect(cursor).not.toBeNull();
      const paintedCursor = mapCompositionPointThroughCamera(cursor!, actual)!;
      expect(paintedCursor.x, `cursor x ${time}`).toBeCloseTo(expectedBody.x, 7);
      expect(paintedCursor.y, `cursor y ${time}`).toBeCloseTo(expectedBody.y, 7);
      expect(cursor!.scale * actual.scale, `cursor size ${time}`).toBeCloseTo(
        layout.videoTransform.width / window.width,
        7
      );
    }
  }
);

it('keeps the cursor of a second video independent from inner source motion', () => {
  const input = fixture();
  const converted = planReviewProjectConversion(input);
  if (converted.status !== 'prepared') throw new Error(JSON.stringify(converted));
  const project = converted.project;
  project.sceneBackground = { ...project.sceneBackground!, zoomBehavior: 'content' };
  const owner = project.clips.find((clip) => clip.type === 'VIDEO')!;
  const second = {
    ...owner,
    id: 'independent-cursor',
    sourceInstanceId: 'independent',
    transform: { ...owner.transform, x: 150, y: 70, width: 100, height: 60 },
  };
  project.clips.push(second);
  project.motionRegions = [
    {
      ...createVideoProjectMotionRegion(project, 0),
      duration: 2,
      scale: 2,
      focusMode: 'MANUAL',
      sourceBinding: {
        clipId: owner.id,
        coordinateSpace: 'source-window',
        sourceStart: 0,
        sourceEnd: 2,
        animation: { start: 0, end: 2, duration: 2 },
      },
    },
  ];
  project.cursorTrack = {
    captureMode: 'separate',
    skin: normalizeVideoProjectCursorSkin(undefined),
    samples: [
      {
        id: 'second-cursor',
        time: 0,
        x: 0,
        y: 0,
        visible: true,
        recordingPoint: { x: 0.4, y: 0.6 },
        sourceAnchor: {
          kind: 'recording-source',
          recordingId: 'recording',
          sourceClipId: second.id,
          sourceTime: 0,
        },
      },
    ],
  };
  const baseline = resolveVideoCompositionCursor(project, 0.5, []);
  expect(baseline).not.toBeNull();
  const frame = resolveVideoCompositionFrame(project, 0.5);
  expect(frame.camera.sourceContentTransform).toBeDefined();
  expect(frame.cursor).toEqual(baseline);
});
