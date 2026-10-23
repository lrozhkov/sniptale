import { materializeVideoProjectCursorSourceObservations } from '../cursor-source-observations';
import type { VideoProject } from '../types';
import { expect, it } from 'vitest';
import { createVideoProjectFromRecording } from '../factories/creation';
import { normalizeVideoProjectCursorSkin } from '../cursor';
import { applyVideoProjectMutationPatch } from '../mutation';
import { hydrateVideoProject } from '../hydration';
import {
  deriveProjectCursorFocusPath,
  resolveProjectSourceCursorObservation,
  projectCursorFocusKeyOccurrences,
  resolveProjectCursorFocus,
  resolveProjectCursorFocusSamples,
  resolveProjectCursorFocusPath,
} from './projection';
import { insertCursorFocusKey, updateCursorFocusKey, authoredCursorFocusPath } from './authoring';
import { isValidVideoProject } from '../validation';

function fixture() {
  return createVideoProjectFromRecording({
    recordingId: 'recording',
    filename: 'focus.webm',
    width: 100,
    height: 100,
    duration: 4,
    mimeType: 'video/webm',
    size: 100,
    cursorTrack: {
      captureMode: 'embedded-fallback',
      skin: normalizeVideoProjectCursorSkin(undefined),
      samples: [
        {
          id: 'start',
          time: 0,
          x: 10,
          y: 10,
          visible: true,
          observation: 'observed',
          captureSegment: 0,
          recordingPoint: { x: 0.1, y: 0.1 },
        },
        {
          id: 'middle',
          time: 1,
          x: 40,
          y: 50,
          visible: true,
          observation: 'observed',
          captureSegment: 0,
          recordingPoint: { x: 0.4, y: 0.5 },
        },
        {
          id: 'loss',
          time: 2,
          x: 40,
          y: 50,
          visible: false,
          observation: 'outside',
          captureSegment: 0,
          recordingPoint: null,
        },
        {
          id: 'return',
          time: 3,
          x: 80,
          y: 80,
          visible: true,
          observation: 'observed',
          captureSegment: 1,
          recordingPoint: { x: 0.8, y: 0.8 },
        },
      ],
    },
  });
}
it('keeps source geometry and observation gaps separate from authored overrides', () => {
  const project = fixture();
  const source = structuredClone(project.cursorTrack);
  const derived = deriveProjectCursorFocusPath(project);
  expect(derived.segments).toHaveLength(2);
  expect(resolveProjectCursorFocus(project, 2.5, derived)).toBeNull();
  let path = insertCursorFocusKey(derived, derived.segments[0]!.id, {
    id: 'manual',
    time: 0.5,
    x: 0.2,
    y: 0.6,
  });
  path = updateCursorFocusKey(path, 'manual', { outgoing: { x: 1.2, y: 0.8 } });
  const authored = applyVideoProjectMutationPatch(project, {
    cursorFocusPath: authoredCursorFocusPath(path),
  });
  expect(authored.version).toBe(3);
  expect(authored.cursorTrack).toEqual(source);
  expect(isValidVideoProject(authored)).toBe(true);
  expect(hydrateVideoProject(structuredClone(authored)).cursorFocusPath).toEqual(
    authoredCursorFocusPath(path)
  );
});

it('normalizes legacy scene-pixel click anchors without changing the recorded points', () => {
  const project = fixture();
  project.cursorTrack = {
    ...project.cursorTrack!,
    samples: [
      { id: 'first', time: 0, x: 10, y: 10, visible: true },
      { id: 'last', time: 4, x: 80, y: 80, visible: true },
    ],
  };
  project.actionEvents = [
    {
      id: 'legacy',
      kind: 'CLICK',
      anchor: { kind: 'project', time: 1 },
      point: { x: 25, y: 75 },
      label: 'Click',
      data: {},
    },
  ];
  const facts = structuredClone({ track: project.cursorTrack, events: project.actionEvents });
  const path = deriveProjectCursorFocusPath(project);
  expect(path.segments[0]!.keys.find((key) => key.id === 'click:legacy')).toMatchObject({
    x: 0.25,
    y: 0.75,
    time: 1,
    anchor: 'click',
  });
  expect(resolveProjectCursorFocus(project, 1, path)).toMatchObject({ x: 25, y: 75 });
  expect({ track: project.cursorTrack, events: project.actionEvents }).toEqual(facts);
});

it('retains normalized recording-source click geometry independently of scene dimensions', () => {
  const project = fixture();
  const video = project.clips.find((clip) => clip.type === 'VIDEO')!;
  project.actionEvents = [
    {
      id: 'captured',
      kind: 'CLICK',
      anchor: {
        kind: 'recording-source',
        recordingId: 'recording',
        sourceInstanceId: video.sourceInstanceId!,
        sourceEventId: 'raw-click',
        sourceTime: 1,
      },
      point: { x: 0.25, y: 0.75 },
      label: 'Click',
      data: {},
    },
  ];
  const path = deriveProjectCursorFocusPath(project);
  expect(
    path.segments.flatMap((segment) => segment.keys).find((key) => key.id === 'click:captured')
  ).toMatchObject({ x: 0.25, y: 0.75, time: 1 });
  expect(resolveProjectCursorFocus(project, 1, path)).toMatchObject({ x: 25, y: 75 });
});

it('projects retained derived keys into source-instance clips and keeps unsupported raw samples unchanged', () => {
  const project = fixture();
  expect(resolveProjectCursorFocusSamples(project)).toBe(project.cursorTrack!.samples);
  const projected = resolveProjectCursorFocusSamples(project, true);
  expect(projected).toContainEqual(expect.objectContaining({ id: 'start', time: 0, x: 10, y: 10 }));
  const video = project.clips.find((item) => item.type === 'VIDEO')!;
  expect(projected.every((sample) => sample.sourceAnchor?.sourceClipId === video.id)).toBe(true);
  expect(projected.map((sample) => sample.time)).toEqual(
    projected.map((sample) => sample.time).toSorted((a, b) => a - b)
  );
});

it('offers the same sparse focus in Video Editor and restores an authored dense-sample identity', () => {
  const project = fixture();
  project.cursorTrack!.samples = Array.from({ length: 161 }, (_, index) => ({
    id: `dense:${index}`,
    time: index * 0.025,
    x: 10 + 80 * (index / 160) ** 2,
    y: 40,
    visible: true,
    recordingPoint: { x: 0.1 + 0.8 * (index / 160) ** 2, y: 0.4 },
  }));
  const before = structuredClone(project.cursorTrack);
  const focus = deriveProjectCursorFocusPath(project);
  expect(focus.segments[0]!.keys.map((key) => key.id)).toEqual(['dense:0', 'dense:160']);
  const selected = deriveProjectCursorFocusPath(project, 'dense:80');
  const edited = updateCursorFocusKey(selected, 'dense:80', { outgoing: { x: 0.6, y: 0.7 } });
  const saved = { ...project, cursorFocusPath: authoredCursorFocusPath(edited) };
  const reopened = resolveProjectCursorFocusPath(hydrateVideoProject(structuredClone(saved)));
  expect(reopened.segments[0]!.keys.find((key) => key.id === 'dense:80')).toMatchObject({
    authored: true,
    outgoing: { x: 0.6, y: 0.7 },
  });
  expect(project.cursorTrack).toEqual(before);
});

it('retains captured and authored source focus plus its key occurrence in a held-only slice', () => {
  const project = fixture();
  const clip = project.clips.find((item) => item.type === 'VIDEO')!;
  clip.sourceInstanceId ??= clip.id;
  const instance = clip.sourceInstanceId;
  project.version = 33;
  project.cursorTrack!.sourceObservations = [
    {
      recordingId: 'recording',
      sourceInstanceId: instance,
      samples: project.cursorTrack!.samples.map(
        ({ sourceAnchor: _anchor, timeBasis: _basis, ...sample }) => sample
      ),
    },
  ];
  project.cursorFocusPath = {
    version: 1,
    smoothing: 0.5,
    sensitivity: 0.5,
    mode: 'follow',
    gapPolicy: 'hold',
    segments: [
      {
        id: 'source-focus',
        binding: { kind: 'recording-source', recordingId: 'recording', sourceInstanceId: instance },
        start: 0,
        end: 4,
        keys: [
          { id: 'focus-start', time: 0, x: 0.1, y: 0.1, anchor: 'manual', interpolation: 'linear' },
          {
            id: 'focus-middle',
            time: 1,
            x: 0.4,
            y: 0.5,
            anchor: 'manual',
            interpolation: 'linear',
          },
          { id: 'focus-end', time: 4, x: 0.8, y: 0.8, anchor: 'manual', interpolation: 'linear' },
        ],
      },
    ],
  };
  const expectedFocus = resolveProjectCursorFocus(project, 1)!;
  const expectedObserved = resolveProjectSourceCursorObservation(project, 1)!;
  expect(expectedFocus).toMatchObject({ sourceTime: 1, x: 40, y: 50 });
  expect(expectedObserved.recordingPoint).toEqual({ x: 0.4, y: 0.5 });
  const candidate: VideoProject = {
    ...project,
    version: 43,
    duration: 10.2,
    clips: [
      {
        ...clip,
        startTime: 10,
        duration: 0.2,
        playbackWindow: { offset: 1.5, extent: 1.7, holdAt: 1 },
      },
    ],
  };
  candidate.cursorTrack = materializeVideoProjectCursorSourceObservations(candidate);
  expect(isValidVideoProject(candidate)).toBe(true);
  const before = structuredClone(candidate);
  expect(resolveProjectCursorFocus(candidate, 10.1)).toMatchObject({
    sourceTime: 1,
    x: expectedFocus.x,
    y: expectedFocus.y,
  });
  expect(resolveProjectSourceCursorObservation(candidate, 10.1)?.recordingPoint).toEqual(
    expectedObserved.recordingPoint
  );
  expect(
    resolveProjectSourceCursorObservation(candidate, 10.2, clip.id, { includeSourceEnd: true })
      ?.sourceAnchor?.sourceTime
  ).toBe(1);
  expect(
    projectCursorFocusKeyOccurrences(candidate, project.cursorFocusPath.segments[0]!).map(
      (item) => [item.key.id, item.time]
    )
  ).toEqual([['focus-middle', 10]]);
  expect(candidate).toEqual(before);
});
