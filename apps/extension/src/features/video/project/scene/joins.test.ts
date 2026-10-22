import { buildReviewTimeMap } from '../../review/timeline';
import { planReviewCutTransitions } from '../../review/cuts';
import type { ReviewEdit } from '../../review/types';
import { expect, it } from 'vitest';
import {
  createImageClip,
  createProject,
  createVideoClip,
} from '../timeline/project-meta.test.helpers';
import { applyVideoProjectMutationPatch } from '../mutation';
import { hydrateVideoProject } from '../hydration';
import { isExportReadyVideoProject, isHydratableVideoProject } from '../validation/root';
import { syncProjectDuration } from '../timeline/basics';
import { removeVideoProjectLibrarySources } from '../library-source-removal';
import {
  parseVideoProjectCompositionJoins,
  reconcileVideoProjectCompositionJoins,
  resolveVideoProjectCompositionJoinPlans,
  resolveVideoProjectCompositionJoinEndpoints,
} from './joins';
import type { VideoProjectCompositionJoin } from './joins-types';

const transition = { type: 'dissolve' as const, before: 0.4, after: 0.4 };
function fixture() {
  const project = createProject([
    createImageClip({ id: 'intro', startTime: 0, duration: 1 }),
    createVideoClip({ id: 'main', startTime: 1, duration: 0.2, sourceDuration: 0.2 }),
    createImageClip({ id: 'outro', startTime: 1.2, duration: 1 }),
  ]);
  project.duration = 2.2;
  const compositionJoins: VideoProjectCompositionJoin[] = [
    { id: 'intro-join', clipId: 'intro', edge: 'end', transition: { ...transition } },
    { id: 'outro-join', clipId: 'outro', edge: 'start', transition: { ...transition } },
  ];
  return applyVideoProjectMutationPatch(project, { compositionJoins });
}

it('admits exact bounded anchors and remembered None without rewriting reads or older roots', () => {
  const project = fixture();
  expect(project.version).toBe(26);
  expect(isExportReadyVideoProject(project)).toBe(true);
  expect(parseVideoProjectCompositionJoins(project.compositionJoins)).toEqual(
    project.compositionJoins
  );
  expect(hydrateVideoProject(project).compositionJoins).toEqual(project.compositionJoins);
  const none = {
    ...project,
    compositionJoins: project.compositionJoins!.map(({ transition: _settings, ...entry }) => entry),
  };
  expect(isExportReadyVideoProject(none)).toBe(true);
  expect(resolveVideoProjectCompositionJoinPlans(none)).toEqual([]);
  expect(isHydratableVideoProject({ ...project, version: 25 })).toBe(false);
  expect(isHydratableVideoProject({ ...project, version: Number.MAX_SAFE_INTEGER })).toBe(false);
  expect(isHydratableVideoProject(createProject([]))).toBe(true);
  const cleared = { ...project };
  delete cleared.compositionJoins;
  expect(applyVideoProjectMutationPatch(cleared, {}).version).toBe(26);
});

it('refuses malformed or duplicate anchors while retaining shape-only recovery for missing references', () => {
  const project = fixture();
  const entry = project.compositionJoins![0]!;
  for (const value of [
    null,
    {},
    [null],
    [{ ...entry, extra: true }],
    [{ ...entry, edge: 'middle' }],
    [{ ...entry, clipId: '' }],
    [{ ...entry, transition: { ...transition, extra: true } }],
    [entry, entry],
    [entry, { ...entry, id: 'duplicate-edge' }],
    Array.from({ length: 129 }, (_, n) => ({ ...entry, id: String(n), clipId: String(n) })),
  ]) {
    expect(parseVideoProjectCompositionJoins(value)).toBeNull();
  }
  const missing = {
    ...project,
    compositionJoins: [{ ...entry, clipId: 'missing', edge: 'end' as const }],
  };
  expect(isHydratableVideoProject(missing)).toBe(true);
  expect(isExportReadyVideoProject(missing)).toBe(false);
  expect(() => resolveVideoProjectCompositionJoinPlans(missing)).toThrow(
    'Missing composition join anchor'
  );
  expect(
    parseVideoProjectCompositionJoins([
      { ...entry, transition: { type: 'fade-black', before: 0, after: 0.2, color: '#abcdef' } },
    ])
  ).not.toBeNull();
});

it('fits both joins proportionally without changing montage duration, sources or authored settings', () => {
  const project = fixture();
  const before = structuredClone(project);
  const plans = resolveVideoProjectCompositionJoinPlans(project);
  expect(plans).toHaveLength(2);
  expect(plans[0]).toMatchObject({ seam: 1, before: 0.4, outgoingStart: 0, incomingEnd: 1.2 });
  expect(resolveVideoProjectCompositionJoinEndpoints(plans[0]!, 30)).toEqual({
    outgoingTime: 29 / 30,
    incomingTime: 1,
  });
  expect(plans[0]!.after).toBeCloseTo(0.1, 12);
  expect(plans[1]!.before).toBeCloseTo(0.1, 12);
  expect(project).toEqual(before);
  const { transition: _disabled, ...boundary } = project.compositionJoins![1]!;
  project.compositionJoins![1] = boundary;
  expect(resolveVideoProjectCompositionJoinPlans(project)[0]!.after).toBeCloseTo(0.2, 12);
});

it('keeps blank main heads and project-text tails instead of selecting a neighbouring video track', () => {
  const project = fixture();
  project.clips = project.clips
    .filter(({ id }) => id !== 'outro')
    .map((clip) => (clip.id === 'main' ? { ...clip, startTime: 5 } : clip));
  project.compositionJoins = [project.compositionJoins![0]!];
  project.textDocuments = [
    {
      id: 'script',
      binding: { kind: 'project' },
      document: {
        version: 1,
        fragments: [
          {
            id: 'text-tail',
            text: 'Tail',
            originalText: 'Tail',
            start: 6,
            end: 8,
            revision: 0,
            timingRevision: 0,
            alignment: 'manual',
            timeDomain: 'result',
            showInVideo: true,
            words: [],
          },
        ],
      },
    },
  ];
  const next = syncProjectDuration(project);
  expect(next.duration).toBe(8);
  expect(resolveVideoProjectCompositionJoinPlans(next)[0]).toMatchObject({
    seam: 1,
    incomingEnd: 8,
    after: 0.4,
  });
  expect(next.clips.find(({ id }) => id === 'main')!.startTime).toBe(5);
});

it('follows split, trim, rate and free movement and never redirects a removed endpoint', () => {
  const project = fixture();
  const original = project.clips[0]!;
  const split = {
    ...project,
    clips: [
      { ...original, duration: 0.5 },
      { ...original, id: 'intro-tail', startTime: 0.5, duration: 0.5 },
      ...project.clips.slice(1),
    ],
  };
  const next = reconcileVideoProjectCompositionJoins(split, new Map([['intro', 'intro-tail']]));
  expect(next.compositionJoins![0]!.clipId).toBe('intro-tail');
  expect(resolveVideoProjectCompositionJoinPlans(next)[0]!.seam).toBe(1);
  const moved = {
    ...next,
    clips: next.clips.map((clip) =>
      clip.id === 'intro-tail' ? { ...clip, startTime: 0.6, duration: 0.25 } : clip
    ),
  };
  expect(resolveVideoProjectCompositionJoinPlans(moved)[0]!.seam).toBe(0.85);
  const deleted = reconcileVideoProjectCompositionJoins({
    ...moved,
    clips: moved.clips.filter(({ id }) => id !== 'intro-tail'),
  });
  expect(deleted.compositionJoins!.map(({ id }) => id)).toEqual(['outro-join']);
  expect(reconcileVideoProjectCompositionJoins(project)).toBe(project);
  const copied = { ...project, id: 'independent-project-copy' };
  expect(copied.compositionJoins).toBe(project.compositionJoins);
});

it.each([0.5, 1, 24, 30_000 / 1001, 60_000 / 1001, 240])(
  'selects actual output cadence endpoints at %s fps, including sparse access',
  (fps) => {
    const project = fixture();
    project.clips = project.clips.filter(({ id }) => id !== 'outro');
    project.compositionJoins = [project.compositionJoins![0]!];
    project.duration = 8;
    const timing = resolveVideoProjectCompositionJoinPlans(project)[0]!;
    const plan = { ...timing, ...resolveVideoProjectCompositionJoinEndpoints(timing, fps) };
    expect(plan.outgoingTime).toBeLessThan(plan.seam);
    expect(plan.incomingTime).toBeGreaterThanOrEqual(plan.seam);
    expect((plan.outgoingTime * Math.max(1, fps)) % 1).toBeCloseTo(0, 10);
    expect(plan.incomingTime - plan.outgoingTime).toBeCloseTo(1 / Math.max(1, fps), 12);
  }
);

it('refuses nonrepresentable dissolve or collapsed active regions without a hard-cut substitute', () => {
  const project = fixture();
  const sparse = {
    ...project,
    clips: project.clips.map((clip) => (clip.id === 'intro' ? { ...clip, duration: 1.1 } : clip)),
  };
  const timing = resolveVideoProjectCompositionJoinPlans(sparse)[0]!;
  expect(() => resolveVideoProjectCompositionJoinEndpoints(timing, 1)).toThrow('no output frame');
  expect(() => resolveVideoProjectCompositionJoinEndpoints(timing, NaN)).toThrow('frame rate');
  const outro = project.clips.find(({ id }) => id === 'outro')!;
  const collapsed = {
    ...project,
    clips: project.clips.map((clip) => (clip.id === 'outro' ? { ...outro, startTime: 1 } : clip)),
  };
  expect(() => resolveVideoProjectCompositionJoinPlans(collapsed)).toThrow('collapsed');
  const edgeOnly = { ...project, duration: 1, compositionJoins: [project.compositionJoins![0]!] };
  expect(resolveVideoProjectCompositionJoinPlans(edgeOnly)).toEqual([]);
});

it('confirmed source purge removes only exact clip anchors and keeps remembered transition recipes', () => {
  const project = fixture();
  const presets = {
    intro: { mode: 'none' as const },
    outro: { mode: 'none' as const },
    introTransition: { ...transition },
  };
  project.bookendPresets = presets;
  const next = removeVideoProjectLibrarySources(project, [
    project.assets.find(({ id }) => id === 'asset-video')!.source,
  ]);
  expect(next.compositionJoins).toEqual([]);
  expect(next.bookendPresets?.introTransition).toEqual(transition);
  expect(project.compositionJoins).toHaveLength(2);
});

it.each(['start', 'end'] as const)(
  'keeps the full composition region after a split beside its %s anchor',
  (edge) => {
    const left = createImageClip({ id: 'left', duration: 1 });
    const right = createImageClip({ id: 'right', startTime: 1, duration: 1 });
    const project = createProject([left, right]);
    project.duration = 2;
    project.compositionJoins = [
      { id: 'join', clipId: edge === 'end' ? left.id : right.id, edge, transition },
    ];
    const before = resolveVideoProjectCompositionJoinPlans(project)[0]!;
    const split =
      edge === 'end'
        ? [
            { ...left, duration: 0.95 },
            { ...left, id: 'tail', startTime: 0.95, duration: 0.05 },
            right,
          ]
        : [
            left,
            { ...right, duration: 0.05 },
            { ...right, id: 'tail', startTime: 1.05, duration: 0.95 },
          ];
    const after = reconcileVideoProjectCompositionJoins(
      { ...project, clips: split },
      new Map([[edge === 'end' ? left.id : right.id, 'tail']])
    );
    const plan = resolveVideoProjectCompositionJoinPlans(after)[0]!;
    expect({ ...plan, boundary: before.boundary }).toEqual(before);
    expect(resolveVideoProjectCompositionJoinEndpoints(plan, 4)).toEqual({
      outgoingTime: 0.75,
      incomingTime: 1,
    });
    expect(after.duration).toBe(project.duration);
    expect(after.compositionJoins![0]!.transition).toEqual(transition);
  }
);

it('represents a Gallery cut across several speed clips without shortening either side', () => {
  const cutTransition = { ...transition, before: 0.8, after: 0.8 };
  const edits: ReviewEdit[] = [
    {
      id: 'cut',
      kind: 'cut',
      start: 4,
      end: 6,
      requestedStart: 4,
      requestedEnd: 6,
      transition: cutTransition,
    },
    {
      id: 'speed-left',
      kind: 'speed',
      start: 3,
      end: 4,
      requestedStart: 3,
      requestedEnd: 4,
      rate: 4,
      audio: 'speed',
    },
    {
      id: 'speed-right',
      kind: 'speed',
      start: 6,
      end: 7,
      requestedStart: 6,
      requestedEnd: 7,
      rate: 4,
      audio: 'speed',
    },
  ];
  const segments = buildReviewTimeMap(8, edits).filter((segment) => segment.kind !== 'cut');
  const clips = segments.map((segment, index) =>
    createVideoClip({
      id: `part-${index}`,
      startTime: segment.resultStart,
      duration: segment.resultEnd - segment.resultStart,
      sourceStart: segment.sourceStart,
      sourceDuration: segment.sourceEnd - segment.sourceStart,
      playbackRate: segment.rate,
    })
  );
  const project = createProject(clips);
  project.duration = segments.at(-1)!.resultEnd;
  const reference = planReviewCutTransitions(8, edits)[0]!;
  project.compositionJoins = [
    {
      id: 'cut',
      clipId: clips[1]!.id,
      edge: 'end',
      transition: cutTransition,
    },
  ];
  const before = structuredClone(project);
  expect(resolveVideoProjectCompositionJoinPlans(project)[0]).toMatchObject({
    seam: reference.seam,
    before: reference.before,
    after: reference.after,
    outgoingStart: 0,
    incomingEnd: project.duration,
  });
  expect(project).toEqual(before);
});

it('admits moving cut sampling separately from held bookend endpoints', () => {
  const project = fixture();
  const original = project.compositionJoins![0]!;
  const plan = resolveVideoProjectCompositionJoinPlans(project)[0]!;
  const held = resolveVideoProjectCompositionJoinEndpoints(plan, 10);
  // Gallery keeps one side moving. A pair of held output ticks cannot encode that policy.
  expect(held).toEqual({ outgoingTime: 0.9, incomingTime: 1 });
  expect(held.outgoingTime).not.toBe(0.8);
  expect(held.incomingTime).not.toBe(1.1);
  const moving = { ...original, sampling: 'cut' };
  expect(parseVideoProjectCompositionJoins([moving])).toEqual([moving]);
});

it('moves only the current cut side without rounding its camera clock to output cadence', () => {
  const initial = fixture();
  const project = applyVideoProjectMutationPatch(initial, {
    compositionJoins: initial.compositionJoins!.map((join) => ({ ...join, sampling: 'cut' })),
  });
  const before = structuredClone(project);
  const plan = resolveVideoProjectCompositionJoinPlans(project)[0]!;
  for (const fps of [1, 23.976, 30, 60]) {
    expect(resolveVideoProjectCompositionJoinEndpoints(plan, fps, 0.8)).toEqual({
      outgoingTime: 0.8,
      incomingTime: 1,
    });
    const after = resolveVideoProjectCompositionJoinEndpoints(plan, fps, 1.05);
    expect(after.incomingTime).toBe(1.05);
    expect(after.outgoingTime).toBeLessThan(1);
    expect(1 - after.outgoingTime).toBeLessThanOrEqual(Number.EPSILON);
    expect(resolveVideoProjectCompositionJoinEndpoints(plan, fps, 1).outgoingTime).toBe(
      after.outgoingTime
    );
  }
  expect(project).toEqual(before);
  expect(project.version).toBe(40);
  expect(isExportReadyVideoProject(project)).toBe(true);
  expect(hydrateVideoProject(JSON.parse(JSON.stringify(project))).compositionJoins).toEqual(
    project.compositionJoins
  );
  expect(isHydratableVideoProject({ ...project, version: 39 })).toBe(false);
  expect(isHydratableVideoProject({ ...project, version: 43 })).toBe(false);
  for (const time of [undefined, NaN, -1, 1.2])
    expect(() => resolveVideoProjectCompositionJoinEndpoints(plan, 30, time)).toThrow(
      'Invalid moving composition join time'
    );
  expect(
    parseVideoProjectCompositionJoins([{ ...project.compositionJoins![0]!, sampling: 'other' }])
  ).toBeNull();
});

it('admits retained cut source intent without an anchor and rejects malformed ranges', () => {
  const initial = fixture(),
    video = initial.clips.find((clip) => clip.type === 'VIDEO')!;
  if (video.type !== 'VIDEO') throw new Error('Missing video');
  const sourceRange = {
    assetId: video.assetId,
    sourceInstanceId: video.sourceInstanceId ?? video.id,
    start: 0.1,
    end: 0.8,
  };
  const join = {
    id: 'retained-cut',
    sampling: 'cut' as const,
    sourceRange,
    transition: { type: 'fade-black' as const, before: 0.4, after: 0.2, color: '#123456' },
  };
  const project = applyVideoProjectMutationPatch(initial, { compositionJoins: [join] });
  const before = structuredClone(project);
  expect(project.version).toBe(40);
  expect(isExportReadyVideoProject(project)).toBe(true);
  expect(resolveVideoProjectCompositionJoinPlans(project)).toEqual([]);
  expect(hydrateVideoProject(JSON.parse(JSON.stringify(project))).compositionJoins).toEqual([join]);
  expect(isHydratableVideoProject({ ...project, version: 39 })).toBe(false);
  for (const invalid of [
    { ...join, sampling: undefined },
    { ...join, sourceRange: undefined },
    { ...join, clipId: 'missing' },
    { ...join, edge: 'start' },
    { ...join, sourceRange: { ...sourceRange, end: 0 } },
    { ...join, sourceRange: { ...sourceRange, start: NaN } },
    { ...join, sourceRange: { ...sourceRange, sourceInstanceId: '' } },
    { ...join, sourceRange: { ...sourceRange, extra: true } },
  ])
    expect(parseVideoProjectCompositionJoins([invalid])).toBeNull();
  const removed = removeVideoProjectLibrarySources(project, [
    project.assets.find((asset) => asset.id === video.assetId)!.source,
  ]);
  expect(removed.compositionJoins).toEqual([]);
  expect(project).toEqual(before);
});

it('retains a cut recipe after ordinary anchor deletion and never redirects it to another placement', () => {
  const initial = fixture(),
    video = initial.clips.find((clip) => clip.type === 'VIDEO')!;
  if (video.type !== 'VIDEO') throw new Error('Missing video');
  const sourceRange = {
    assetId: video.assetId,
    sourceInstanceId: video.sourceInstanceId ?? video.id,
    start: 0.1,
    end: 0.8,
  };
  const join = {
    id: 'bound-cut',
    clipId: video.id,
    edge: 'start' as const,
    sampling: 'cut' as const,
    sourceRange,
    transition,
  };
  const project = applyVideoProjectMutationPatch(initial, { compositionJoins: [join] });
  const next = reconcileVideoProjectCompositionJoins({
    ...project,
    clips: project.clips.filter((clip) => clip.id !== video.id),
  });
  expect(next.compositionJoins).toEqual([
    { id: join.id, sampling: 'cut', sourceRange, transition },
  ]);
  expect(resolveVideoProjectCompositionJoinPlans(next)).toEqual([]);
  expect(isExportReadyVideoProject(next)).toBe(true);
  expect(project.compositionJoins).toEqual([join]);
});
