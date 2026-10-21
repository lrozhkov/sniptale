import { expect, it } from 'vitest';
import { createAnnotationClip } from '../factories/overlay-clip';
import { createCanvasComment } from '../../review/comments';
import type { VideoProjectTextDocument } from '../text/types';
import { projectVideoProjectTextFragment } from '../text/projection';
import { projectVideoProjectCommentAnchor } from '../comments/projection';
import { createVideoProjectMotionRegion } from '../motion';
import { bindMotionRegionToClip, projectMotionSourceBinding } from '../motion/source-binding';
import { normalizeVideoProjectCursorSkin } from '../cursor';
import type { VideoProject, VideoProjectClip } from '../types/model';
import type { VideoProjectEffectTarget } from '../effect-instance/types';
import {
  createAudioClip,
  createImageClip,
  createProject,
  createShapeClip,
  createTextClip,
  createVideoClip,
} from './project-meta.test.helpers';
import { prefixVideoProjectComposition } from './composition-prefix';

const delta = 2.75;
function fixture(): VideoProject {
  const clip = createVideoClip({
    startTime: 1,
    duration: 4,
    sourceStart: 2,
    sourceDuration: 8,
    playbackRate: 2,
    sourceInstanceId: 'instance',
  });
  return createProject([clip]);
}
function prefix(project: VideoProject): VideoProject {
  const result = prefixVideoProjectComposition(project, delta);
  if (!result) throw new Error('Expected an admitted composition');
  return result;
}
function textEntry(kind: 'project' | 'source'): VideoProjectTextDocument {
  return {
    id: kind,
    binding:
      kind === 'project'
        ? { kind }
        : { kind, assetId: 'asset-video', sourceInstanceId: 'instance' },
    document: {
      version: 1,
      fragments: [
        {
          id: 'phrase',
          originalText: 'Two words',
          text: 'Two words',
          revision: 3,
          timingRevision: 7,
          alignment: 'word',
          start: 2,
          end: 4,
          timeDomain: kind === 'project' ? 'result' : 'source',
          showInVideo: true,
          words: [
            { text: 'Two', start: 2, end: 3 },
            { text: 'words', start: 3, end: 4 },
          ],
          origin: { kind: 'original', start: 2, end: 4 },
          origins: [{ kind: 'voiceover', start: 5, end: 7 }],
        },
      ],
    },
  };
}

it('translates all clip kinds without changing source intervals', () => {
  const base = createVideoClip();
  const clips: VideoProjectClip[] = [
    base,
    createAudioClip(),
    createImageClip(),
    createTextClip(),
    createShapeClip(),
    { ...base, id: 'subtitle', type: 'SUBTITLE', text: 'Caption' },
    { ...base, id: 'effect', type: 'EFFECT', effectInstanceId: 'fx' },
    createAnnotationClip('track-video', 1280, 720, 0),
  ];
  const project = createProject(clips);
  const before = structuredClone(project);
  const next = prefix(project);
  expect(next.clips).toEqual(clips.map((clip) => ({ ...clip, startTime: delta })));
  expect(project).toEqual(before);
});

it('preserves composition gaps and extends duration', () => {
  const project = fixture();
  const next = prefix(project);
  expect(next.clips[0]!.startTime).toBe(3.75);
  expect(next.duration).toBe(10.75);
  expect(next.assets).toBe(project.assets);
  expect(next.tracks).toBe(project.tracks);
  expect(next.updatedAt).toBe(project.updatedAt);
});

it('retains source phase camera timing and voice snapshots', () => {
  const project = fixture();
  const video = project.clips[0]!;
  if (video.type !== 'VIDEO') throw new Error('Expected video');
  video.cameraHiddenRanges = [{ id: 'hidden', start: 3, end: 4 }];
  video.cameraPositions = [
    {
      id: 'position',
      sourceTime: 3,
      transform: video.transform,
      fitMode: 'CONTAIN',
      transition: { kind: 'smooth', duration: 0.5 },
    },
  ];
  const audio = createAudioClip({
    textSnapshot: {
      version: 1,
      documentId: 'text',
      binding: { kind: 'project' },
      basisHash: 'basis',
      text: {
        kind: 'ai',
        textId: 'phrase',
        revision: 3,
        timingRevision: 7,
        text: 'Accepted speech',
        start: 2,
        end: 4,
        timeDomain: 'result',
      },
    },
  });
  project.clips.push(audio);
  const next = prefix(project);
  expect(next.clips[0]).toEqual({ ...project.clips[0], startTime: 3.75 });
  expect(next.clips[1]).toEqual({ ...audio, startTime: delta });
  const acceptedAudio = next.clips[1]!;
  expect(acceptedAudio.type === 'AUDIO' && acceptedAudio.textSnapshot).toBe(audio.textSnapshot);
});

it('translates every effect target and preserves document phase', () => {
  const project = fixture();
  const targets: VideoProjectEffectTarget[] = [
    { kind: 'scene' },
    { kind: 'track', trackId: 'track-video' },
    { kind: 'video-group' },
    { kind: 'clip', clipId: 'clip-video' },
    { kind: 'transition', transitionId: 'join' },
  ];
  project.effectInstances = targets.map((target, index) => ({
    id: String(index),
    target,
    snapshotId: 'snapshot',
    kind:
      target.kind === 'scene'
        ? 'standalone'
        : target.kind === 'transition'
          ? 'transition'
          : 'targetEffect',
    controls: { amount: 0.5 },
    enabled: true,
    startTime: 2,
    duration: 3,
    sourceStart: 1.25,
    playbackRate: 0.5,
    sceneAnchors: { a: { x: 0.2, y: 0.3 } },
  }));
  expect(prefix(project).effectInstances).toEqual(
    project.effectInstances.map((effect) => ({ ...effect, startTime: 4.75 }))
  );
});

it('translates motion windows and retains animation clocks', () => {
  const project = fixture();
  const clip = project.clips[0]!;
  if (clip.type !== 'VIDEO') throw new Error('Expected video');
  const region = { ...createVideoProjectMotionRegion(project, 2), duration: 1 };
  project.motionRegions = [
    region,
    projectMotionSourceBinding(project, bindMotionRegionToClip({ ...region, id: 'bound' }, clip)),
  ];
  const next = prefix(project);
  expect(next.motionRegions).toEqual(
    project.motionRegions.map((item) => ({ ...item, startTime: 4.75 }))
  );
  expect(projectMotionSourceBinding(next, next.motionRegions![1]!)).toEqual(next.motionRegions![1]);
  expect(next.motionRegions![1]!.sourceBinding).toBe(project.motionRegions[1]!.sourceBinding);
});

it('translates cursor caches once and retains native anchors', () => {
  const project = fixture();
  project.cursorTrack = {
    captureMode: 'embedded-fallback',
    skin: normalizeVideoProjectCursorSkin(undefined),
    samples: [
      { id: 'project', time: 2, x: 0.2, y: 0.3, visible: true },
      {
        id: 'source',
        time: 3,
        x: 0.5,
        y: 0.6,
        visible: true,
        sourceAnchor: {
          kind: 'recording-source',
          recordingId: 'rec-asset-video',
          sourceClipId: 'clip-video',
          sourceTime: 6,
        },
        recordingPoint: { x: 0.5, y: 0.6 },
        interpolationRange: { start: 0.25, end: 0.75 },
      },
    ],
  };
  const next = prefix(project);
  expect(next.cursorTrack).not.toBe(project.cursorTrack);
  expect(next.cursorTrack!.samples).toEqual(
    project.cursorTrack.samples.map((sample) => ({ ...sample, time: sample.time + delta }))
  );
});

it('translates object samples anchors and analysis once', () => {
  const project = fixture();
  project.objectTracks = [
    {
      id: 'tracked',
      kind: 'object',
      source: 'visualDetection',
      samples: [
        { sourceClipId: 'clip-video', time: 2, x: 0.2, y: 0.4, visible: true, confidence: 0.8 },
      ],
      correctionAnchors: [
        { id: 'correction', sourceClipId: 'clip-video', time: 3, x: 0.3, y: 0.4 },
      ],
      analysis: {
        sourceAssetId: 'asset-video',
        sourceClipId: 'clip-video',
        projectStartTime: 1,
        projectEndTime: 5,
        sampleFps: 12,
      },
    },
  ];
  const next = prefix(project);
  expect(next.objectTracks).not.toBe(project.objectTracks);
  expect(next.objectTracks![0]).toMatchObject({
    samples: [{ time: 4.75, confidence: 0.8, sourceClipId: 'clip-video' }],
    correctionAnchors: [{ time: 5.75 }],
    analysis: { projectStartTime: 3.75, projectEndTime: 7.75, sampleFps: 12 },
  });
});

it('translates project actions without rewriting recorded facts', () => {
  const project = fixture();
  project.actionEvents = [
    {
      id: 'manual',
      kind: 'KEY',
      label: 'A',
      point: null,
      anchor: { kind: 'project', time: 2 },
      data: { downTime: 1, upTime: 3 },
      capturedDuration: 2,
      keyboardRepeats: [
        {
          version: 1,
          id: 'rhythm',
          startTime: 1,
          quantumMs: 1,
          count: 2,
          encoding: 'delta',
          ticks: [0, 100],
        },
      ],
    },
    {
      id: 'recorded',
      kind: 'CLICK',
      label: 'Click',
      point: null,
      anchor: {
        kind: 'recording-source',
        recordingId: 'rec-asset-video',
        sourceInstanceId: 'instance',
        sourceEventId: 'event',
        sourceTime: 4,
      },
      data: {},
    },
  ];
  const next = prefix(project);
  expect(next.actionEvents[0]).toEqual({
    ...project.actionEvents[0],
    anchor: { kind: 'project', time: 4.75 },
  });
  expect(next.actionEvents[1]).toBe(project.actionEvents[1]);
});

it('translates project focus and retains source focus', () => {
  const project = fixture();
  const segment = {
    id: 'manual',
    binding: { kind: 'project' } as const,
    start: 1,
    end: 5,
    keys: [
      {
        id: 'key',
        time: 2,
        x: 0.4,
        y: 0.5,
        anchor: 'manual' as const,
        interpolation: 'smooth' as const,
      },
    ],
  };
  project.cursorFocusPath = {
    version: 1,
    mode: 'follow',
    smoothing: 0.5,
    sensitivity: 0.5,
    gapPolicy: 'hold',
    segments: [
      segment,
      {
        ...segment,
        id: 'source',
        binding: { kind: 'recording-source', recordingId: 'rec', sourceInstanceId: 'instance' },
      },
    ],
  };
  const next = prefix(project);
  expect(next.cursorFocusPath!.segments[0]).toEqual({
    ...segment,
    start: 3.75,
    end: 7.75,
    keys: [{ ...segment.keys[0], time: 4.75 }],
  });
  expect(next.cursorFocusPath!.segments[1]).toBe(project.cursorFocusPath.segments[1]);
});

it('translates project text and aligned words without changing provenance', () => {
  const project = fixture();
  project.textDocuments = [textEntry('project'), textEntry('source')];
  const next = prefix(project);
  const fragment = next.textDocuments![0]!.document.fragments[0]!;
  expect(fragment).toMatchObject({
    start: 4.75,
    end: 6.75,
    revision: 3,
    timingRevision: 8,
    alignment: 'word',
    words: [
      { start: 4.75, end: 5.75 },
      { start: 5.75, end: 6.75 },
    ],
    origin: { start: 2, end: 4 },
    origins: [{ start: 5, end: 7 }],
  });
  expect(next.textDocuments![1]).toBe(project.textDocuments[1]);
  for (const [index, expected] of [
    [0, { start: 4.75, end: 6.75 }],
    [1, { start: 3.75, end: 4.75 }],
  ] as const) {
    const entry = next.textDocuments![index]!;
    expect(
      projectVideoProjectTextFragment(next, entry, entry.document.fragments[0]!).ranges
    ).toEqual([expected]);
  }
});

it('translates editorial notes and retains passive legacy metadata', () => {
  const project = fixture();
  const entry = {
    id: 'notes',
    binding: { kind: 'project' } as const,
    annotations: [
      { id: 'point', text: 'Point', anchor: { kind: 'point' as const, time: 2 } },
      { id: 'range', text: 'Range', anchor: { kind: 'range' as const, start: 2, end: 4 } },
    ],
    canvasComments: [
      createCanvasComment({ id: 'bounded', start: 2, end: 4 }),
      createCanvasComment({ id: 'unbounded' }),
    ],
  };
  project.commentDocuments = [
    entry,
    {
      ...entry,
      id: 'source',
      binding: { kind: 'source', assetId: 'asset-video', sourceInstanceId: 'instance' },
    },
  ];
  const next = prefix(project);
  expect(next.commentDocuments![0]!.canvasComments).toEqual([
    { ...entry.canvasComments[0], start: 4.75, end: 6.75 },
    entry.canvasComments[1],
  ]);
  expect(next.commentDocuments![1]).toBe(project.commentDocuments[1]);
  for (const [index, times] of [
    [0, [4.75, 6.75]],
    [1, [3.75, 4.75]],
  ] as const) {
    const document = next.commentDocuments![index]!;
    expect(
      projectVideoProjectCommentAnchor(next, document, document.annotations[1]!.anchor)
    ).toEqual([{ clipId: index === 0 ? null : 'clip-video', start: times[0], end: times[1] }]);
  }
});

it('retains transition endpoints and whole output settings', () => {
  const project = fixture();
  project.transitions = [];
  project.sceneEdges = {
    intro: { enabled: true, duration: 0.5, color: '#111111', audioFade: true },
    outro: { enabled: false, duration: 1, color: '#ffffff', audioFade: false },
  };
  const next = prefix(project);
  expect(next.transitions).toBe(project.transitions);
  expect(next.sceneEdges).toBe(project.sceneEdges);
});

it('leaves the accepted graph untouched on refusal', () => {
  const project = fixture();
  project.textDocuments = [textEntry('project')];
  project.textDocuments[0]!.document.fragments[0]!.end = 86_399;
  const before = structuredClone(project);
  for (const amount of [-1, NaN, Infinity, 86_400, 2]) {
    expect(prefixVideoProjectComposition(project, amount)).toBeNull();
    expect(project).toEqual(before);
  }
  expect(prefixVideoProjectComposition(project, 0)).toBe(project);
});

it('retains admitted object observations beyond the bounded composition clock', () => {
  const project = fixture();
  project.objectTracks = [
    {
      id: 'dormant',
      kind: 'object',
      source: 'manual',
      samples: [{ time: 90_000, x: 0.5, y: 0.5, visible: false, confidence: 0.2 }],
      correctionAnchors: [{ id: 'later', time: 90_001, x: 0.5, y: 0.5 }],
      analysis: {
        sourceAssetId: 'asset-video',
        sourceClipId: 'clip-video',
        projectStartTime: 90_000,
        projectEndTime: 90_001,
        sampleFps: 1,
      },
    },
  ];
  const next = prefix(project);
  expect(next.objectTracks![0]).toMatchObject({
    samples: [{ time: 90_002.75 }],
    correctionAnchors: [{ time: 90_003.75 }],
    analysis: { projectStartTime: 90_002.75, projectEndTime: 90_003.75 },
  });
});
