import { readFileSync } from 'node:fs';
import { parseEffectRuntimeSnapshotDocument } from '../effect-runtime/runtime/snapshot-document';
import { createEffectHostClip } from '../../project/factories/overlay-clip';
import { createProject, createVideoClip } from '../../project/timeline/project-meta.test.helpers';
import { createVideoProjectMotionRegion } from '../../project/motion';
import {
  bindMotionRegionToClip,
  projectMotionSourceBinding,
} from '../../project/motion/source-binding';
import { expect, it } from 'vitest';
import { createEmptyVideoProject, createVideoProjectTrack } from '../../project/factories/creation';
import { createSubtitleClip } from '../../project/factories/overlay-clip';
import {
  VideoMotionFocusMode,
  VideoTemporalEasing,
  VideoTrackKind,
} from '../../project/types/index';
import { resolveVideoCompositionRenderPasses } from './render';

it('returns a single visual pass when no motion blur is active', () => {
  const project = createEmptyVideoProject('Render passes', 1280, 720);
  const result = resolveVideoCompositionRenderPasses(project, 1);

  expect(result.visualPasses).toHaveLength(1);
  expect(result.visualPasses[0]).toEqual(
    expect.objectContaining({
      alpha: 1,
      frame: result.overlayFrame,
      time: 1,
    })
  );
});

it('builds multiple alpha-normalized visual passes for blurred camera motion', () => {
  const project = createEmptyVideoProject('Motion blur', 1280, 720);
  project.duration = 8;
  project.motionRegions = [
    {
      duration: 2,
      easing: VideoTemporalEasing.EASE_IN_OUT,
      focusMode: VideoMotionFocusMode.MANUAL,
      focusPoint: { x: 900, y: 300 },
      id: 'motion-1',
      motionBlurAmount: 0.75,
      scale: 2,
      startTime: 1,
      targetAction: null,
      zoomInDuration: 1,
      zoomOutDuration: 0.25,
    },
  ];

  const result = resolveVideoCompositionRenderPasses(project, 1.5);

  expect(result.visualPasses.length).toBeGreaterThan(1);
  expect(result.visualPasses.reduce((sum, pass) => sum + pass.alpha, 0)).toBeCloseTo(1);
  expect(result.visualPasses.some((pass) => pass.time === 1.5)).toBe(true);
  expect(
    new Set(
      result.visualPasses.map((pass) => `${pass.frame.camera.viewportX}:${pass.frame.camera.scale}`)
    ).size
  ).toBeGreaterThan(1);
  const centerPass = result.visualPasses.find((pass) => pass.time === 1.5);
  expect(centerPass?.alpha ?? 0).toBeGreaterThan(result.visualPasses[0]?.alpha ?? 0);
});

it('falls back to a single pass when blur sampling produces no meaningful camera spread', () => {
  const project = createEmptyVideoProject('Static blur', 1280, 720);
  project.duration = 8;
  project.motionRegions = [
    {
      duration: 2,
      easing: VideoTemporalEasing.EASE_IN_OUT,
      focusMode: VideoMotionFocusMode.MANUAL,
      focusPoint: { x: 640, y: 360 },
      id: 'motion-1',
      motionBlurAmount: 0.75,
      scale: 1,
      startTime: 1,
      targetAction: null,
      zoomInDuration: 0,
      zoomOutDuration: 0,
    },
  ];

  const result = resolveVideoCompositionRenderPasses(project, 1.5);

  expect(result.visualPasses).toHaveLength(1);
  expect(result.visualPasses[0]).toEqual(
    expect.objectContaining({
      alpha: 1,
      frame: result.overlayFrame,
    })
  );
});

it('forwards subtitle visibility options into the resolved render passes', () => {
  const project = createEmptyVideoProject('Subtitle render', 1280, 720);
  const subtitleTrack = createVideoProjectTrack('Subtitles', 3, VideoTrackKind.SUBTITLE);

  project.tracks.push(subtitleTrack);
  project.clips.push(createSubtitleClip(subtitleTrack.id, 1280, 720, 0));

  expect(
    resolveVideoCompositionRenderPasses(project, 1, { includeSubtitles: false }).overlayFrame
      .visualLayers
  ).toEqual([]);
  expect(
    resolveVideoCompositionRenderPasses(project, 1, { includeSubtitles: true }).overlayFrame
      .visualLayers.length
  ).toBe(1);
});

it('attaches transition overlays to resolved visual passes', verifyTransitionOverlays);

function verifyTransitionOverlays() {
  const project = createTransitionOverlayProject();
  const result = resolveVideoCompositionRenderPasses(project, 3.5);

  expect(result.visualPasses[0]?.transitionOverlays).toEqual([
    expect.objectContaining({ color: '#f97316', kind: 'sweep' }),
  ]);
}

function createTransitionOverlayProject() {
  const project = createEmptyVideoProject('Transition overlays', 1280, 720);
  const trackId = project.tracks[0]?.id ?? '';

  project.clips = [
    createRenderClip(trackId, 'clip-a', 0, 'NONE', 'CROSSFADE'),
    createRenderClip(trackId, 'clip-b', 3, 'CROSSFADE', 'NONE'),
  ] as never;
  project.transitions = [
    {
      direction: 'RIGHT',
      duration: 1,
      easing: 'LINEAR',
      highlightColor: '#f97316',
      id: 'transition-1',
      intensity: 'BOLD',
      kind: 'LIGHT_SWEEP',
      leadingClipId: 'clip-a',
      renderKind: 'CSS_LIKE',
      templateKind: 'LIGHT_SWEEP',
      trailingClipId: 'clip-b',
    },
  ];

  return project;
}

function createRenderClip(
  trackId: string,
  id: string,
  startTime: number,
  transitionIn: 'NONE' | 'CROSSFADE',
  transitionOut: 'NONE' | 'CROSSFADE'
) {
  return {
    assetId: id === 'clip-a' ? 'asset-a' : 'asset-b',
    duration: 4,
    fadeInMs: 0,
    fadeOutMs: 0,
    fitMode: 'CONTAIN',
    groupId: null,
    id,
    linkMode: 'DETACHED',
    muted: false,
    name: id === 'clip-a' ? 'Clip A' : 'Clip B',
    sourceDuration: 4,
    sourceStart: 0,
    startTime,
    trackId,
    transform: { height: 720, opacity: 1, rotation: 0, width: 1280, x: 0, y: 0 },
    transitionIn,
    transitionOut,
    type: 'VIDEO',
    volume: 1,
  };
}

it('keeps low blur strengths effective and increases exposure throughout the whole slider', () => {
  const project = createEmptyVideoProject('Blur strength', 1280, 720);
  project.duration = 8;
  const region = {
    duration: 3,
    easing: VideoTemporalEasing.LINEAR,
    focusMode: VideoMotionFocusMode.MANUAL,
    focusPoint: { x: 900, y: 300 },
    id: 'motion-strength',
    motionBlurAmount: 0.1,
    scale: 3,
    startTime: 1,
    targetAction: null,
    zoomInDuration: 2,
    zoomOutDuration: 0.25,
  };
  project.motionRegions = [region];
  const exposure = (amount: number) => {
    region.motionBlurAmount = amount;
    const { visualPasses } = resolveVideoCompositionRenderPasses(project, 1.5);
    return (
      Math.max(...visualPasses.map((pass) => pass.time)) -
      Math.min(...visualPasses.map((pass) => pass.time))
    );
  };
  expect(exposure(0.1)).toBeGreaterThan(0);
  expect(exposure(0.9)).toBeGreaterThan(exposure(0.6));
});

function boundaryMotion(id: string, startTime: number, duration: number, scale: number) {
  return {
    id,
    startTime,
    duration,
    scale,
    focusMode: VideoMotionFocusMode.MANUAL,
    focusPoint: { x: 900, y: 300 },
    targetAction: null,
    easing: VideoTemporalEasing.LINEAR,
    zoomInDuration: 0,
    zoomOutDuration: 0,
    motionBlurAmount: 1,
  };
}

it.each([
  [1.999, 'first'],
  [2.001, 'second'],
] as const)('keeps exposure on the represented side of an unconnected cut at %s', (time, id) => {
  const project = createEmptyVideoProject('Hard cut', 1280, 720);
  project.duration = 6;
  project.motionRegions = [boundaryMotion('first', 1, 1, 3), boundaryMotion('second', 2, 1, 1.5)];
  const result = resolveVideoCompositionRenderPasses(project, time);
  expect(result.visualPasses.every((pass) => pass.frame.camera.regionId === id)).toBe(true);
  expect(result.visualPasses).toHaveLength(1);
});

it('keeps exposure out of an ended overlapping camera', () => {
  const project = createEmptyVideoProject('Overlap', 1280, 720);
  project.duration = 6;
  project.motionRegions = [boundaryMotion('first', 1, 4, 3), boundaryMotion('second', 2, 1, 1.5)];
  const result = resolveVideoCompositionRenderPasses(project, 3.001);
  expect(result.visualPasses.every((pass) => pass.frame.camera.regionId === 'first')).toBe(true);
  expect(result.visualPasses).toHaveLength(1);
});

it.each([1, 1.001, 2.499, 2.5, 2.501])(
  'keeps legacy instant exposure on its pose at %s',
  (time) => {
    const project = createEmptyVideoProject('Instant legacy', 1280, 720);
    project.duration = 6;
    project.motionRegions = [
      {
        ...boundaryMotion('instant', 1, 2, 3),
        easing: VideoTemporalEasing.INSTANT,
        zoomInDuration: 0.5,
        zoomOutDuration: 0.5,
      },
    ];
    const result = resolveVideoCompositionRenderPasses(project, time);
    expect(
      result.visualPasses.every(
        (pass) => pass.frame.camera.scale === (time === 1 || time > 2.5 ? 1 : 3)
      )
    ).toBe(true);
    expect(result.visualPasses).toHaveLength(1);
  }
);

it('keeps legacy exposure before an instantaneous connection sharp', () => {
  const project = createEmptyVideoProject('Instant legacy link', 1280, 720);
  project.duration = 8;
  project.motionRegions = [
    boundaryMotion('first', 1, 2, 3),
    {
      ...boundaryMotion('second', 5, 2, 2),
      incomingConnection: { fromRegionId: 'first', easing: VideoTemporalEasing.INSTANT },
    },
  ];
  const result = resolveVideoCompositionRenderPasses(project, 2.999);
  expect(result.visualPasses.every((pass) => pass.frame.camera.scale === 3)).toBe(true);
  expect(result.visualPasses).toHaveLength(1);
});

it.each(
  [
    { start: 0, offset: 0, duration: 5 / 3, time: 1.57 },
    { start: 0, offset: 1.57, duration: 5 / 3 - 1.57, time: 0.001 },
    { start: 2, offset: 1.57, duration: 5 / 3 - 1.57, time: 2 + 5 / 3 - 1.57 - 0.001 },
  ].flatMap((entry) =>
    (['viewport', 'source'] as const).map((attachment) => ({ ...entry, attachment }))
  )
)(
  'retains original camera and $attachment content exposure at $start with offset $offset',
  ({ start, offset, duration, time, attachment }) => {
    const clip = createVideoClip({
      id: 'held-source',
      startTime: 0,
      duration: 1.5,
      sourceStart: 0,
      sourceDuration: 0.15,
      playbackRate: 0.1,
      fadeOutMs: 1000,
    });
    const project = createProject([clip]);
    project.motionRegions = [
      bindMotionRegionToClip(
        {
          ...createVideoProjectMotionRegion(project, 0),
          duration: 1.5,
          scale: 2,
          zoomInDuration: 0,
          zoomOutDuration: 0.5,
          motionBlurAmount: 1,
          easing: 'LINEAR',
        },
        clip
      ),
    ];
    const source = readFileSync(
      'packages/runtime-contracts/src/effect-v1/fixtures/valid/neutral-standalone.sniptale-effect.json',
      'utf8'
    );
    const document = parseEffectRuntimeSnapshotDocument({ source });
    const snapshot = {
      id: `effect:${'7'.repeat(64)}`,
      documentId: document.id,
      source,
      sha256: '7'.repeat(64),
      kind: 'standalone' as const,
      schemaVersion: 'sniptale.effect.v1' as const,
      assets: [],
      retainedByteLength: new TextEncoder().encode(source).byteLength,
    };
    project.effectSnapshots = [snapshot];
    project.effectInstances = [
      {
        id: 'exposure-effect',
        kind: 'standalone',
        target: { kind: 'scene' },
        snapshotId: snapshot.id,
        enabled: true,
        startTime: 0,
        duration: 1.5,
        playbackRate: document.duration / 1.5,
        sourceStart: 0,
        controls: Object.fromEntries(
          document.controls.map((control) => [control.id, control.defaultValue])
        ),
      },
    ];
    const track = createVideoProjectTrack('Exposure annotation', -1, VideoTrackKind.PRIMARY);
    project.tracks.push(track);
    const host = createEffectHostClip({
      trackId: track.id,
      startTime: 0,
      duration: 1.5,
      effectInstanceId: 'exposure-effect',
      name: 'Exposure annotation',
      projectWidth: project.width,
      projectHeight: project.height,
    });
    host.sourceRange = {
      assetId: clip.assetId,
      sourceInstanceId: clip.sourceInstanceId ?? clip.id,
      start: 0,
      end: 0.15,
    };
    host.attachment =
      attachment === 'viewport'
        ? { kind: 'viewport' }
        : {
            kind: 'source',
            assetId: clip.assetId,
            sourceInstanceId: clip.sourceInstanceId ?? clip.id,
          };
    project.clips.push(host);
    const expected = resolveVideoCompositionRenderPasses(project, 1.3);
    expect(expected.visualPasses).toHaveLength(5);
    const candidate = {
      ...project,
      version: 43 as const,
      clips: [
        {
          ...clip,
          startTime: start,
          duration,
          playbackWindow: {
            offset,
            extent: 5 / 3,
            holdAt: 1.3,
            fadePhase: { offset, duration: 1.5 },
          },
        },
        {
          ...host,
          startTime: start,
          duration,
          playbackWindow: { offset, extent: 5 / 3, holdAt: 1.3 },
        },
      ],
      effectInstances: project.effectInstances.map((instance) => ({
        ...instance,
        startTime: start,
      })),
    };
    candidate.motionRegions = candidate.motionRegions!.map((region) =>
      projectMotionSourceBinding(candidate, region)
    );
    const before = structuredClone(candidate);
    const held = resolveVideoCompositionRenderPasses(candidate, time);
    expect(held.visualPasses).toHaveLength(expected.visualPasses.length);
    held.visualPasses.forEach((pass, index) => {
      expect(pass.alpha).toBe(expected.visualPasses[index]!.alpha);
      expect(pass.frame.camera.scale).toBeCloseTo(
        expected.visualPasses[index]!.frame.camera.scale,
        12
      );
      const body = pass.frame.visualLayers.find((layer) => layer.clipId === clip.id);
      const expectedBody = expected.visualPasses[index]!.frame.visualLayers.find(
        (layer) => layer.clipId === clip.id
      )!;
      expect(body?.opacity).toBeCloseTo(expectedBody.opacity, 12);
      const effect = pass.frame.effectRuntimePlans!.find(
        (plan) => plan.effectInstanceId === 'exposure-effect'
      )!;
      const expectedEffect = expected.visualPasses[index]!.frame.effectRuntimePlans!.find(
        (plan) => plan.effectInstanceId === 'exposure-effect'
      )!;
      expect(effect.time).toBeCloseTo(expectedEffect.time, 12);
    });
    expect(candidate).toEqual(before);
  }
);

it('keeps an independent Native camera and its exposure on project time over retained source content', () => {
  const clip = createVideoClip({
    id: 'retained',
    startTime: 0,
    duration: 5 / 3,
    sourceStart: 0,
    sourceDuration: 0.15,
    playbackRate: 0.1,
    fadeOutMs: 1000,
    playbackWindow: {
      offset: 0,
      extent: 5 / 3,
      holdAt: 1.3,
      fadePhase: { offset: 0, duration: 1.5 },
    },
  });
  const project = createProject([clip]);
  project.version = 43;
  const source = bindMotionRegionToClip({ ...boundaryMotion('source-camera', 0, 1.5, 2) }, clip);
  const independent = { ...boundaryMotion('native-camera', 1.5, 0.15, 3), zoomInDuration: 0.1 };
  project.motionRegions = [source, independent];
  const reference = { ...project, motionRegions: [independent] };
  const expected = resolveVideoCompositionRenderPasses(reference, 1.57);
  const actual = resolveVideoCompositionRenderPasses(project, 1.57);
  expect(actual.visualPasses).toHaveLength(expected.visualPasses.length);
  actual.visualPasses.forEach((pass, index) => {
    expect(pass.frame.camera.regionId).toBe(independent.id);
    expect(pass.frame.camera.scale).toBeCloseTo(
      expected.visualPasses[index]!.frame.camera.scale,
      12
    );
    expect(pass.frame.visualLayers.find((layer) => layer.clipId === clip.id)?.opacity).toBeCloseTo(
      0.2,
      12
    );
  });
});

it.each([0.7, 1.35])('keeps a mixed Native camera link on project time at %s', (time) => {
  const clip = createVideoClip({
    id: 'retained-source',
    sourceInstanceId: 'mixed-camera',
    startTime: 0,
    duration: 5 / 3,
    sourceStart: 0,
    sourceDuration: 0.15,
    playbackRate: 0.1,
    playbackWindow: { offset: 0, extent: 5 / 3, holdAt: 1.3 },
  });
  const project = createProject([clip]);
  project.version = 43;
  const source = bindMotionRegionToClip(
    { ...boundaryMotion('source-camera', 0, 0.8, 2), zoomOutDuration: 0.2 },
    clip
  );
  const independent = {
    ...boundaryMotion('native-camera', 1.4, 0.1, 1.5),
    incomingConnection: { fromRegionId: source.id, easing: 'LINEAR' as const },
  };
  project.motionRegions = [source, independent];
  const { playbackWindow: _window, ...plain } = clip;
  const reference = { ...project, clips: [{ ...plain, duration: 1.5 }] };
  const expected = resolveVideoCompositionRenderPasses(reference, time);
  const actual = resolveVideoCompositionRenderPasses(project, time);
  expect(actual.visualPasses).toHaveLength(expected.visualPasses.length);
  actual.visualPasses.forEach((pass, index) => {
    expect(pass.frame.camera.scale).toBeCloseTo(
      expected.visualPasses[index]!.frame.camera.scale,
      12
    );
    expect(pass.frame.camera.viewportX).toBeCloseTo(
      expected.visualPasses[index]!.frame.camera.viewportX,
      9
    );
  });
});
