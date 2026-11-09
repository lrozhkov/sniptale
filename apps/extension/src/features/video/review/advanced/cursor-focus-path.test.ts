import { createQuickEditAdvancedContent } from './defaults';
import { loadQuickEditAdvancedContentState } from './validation';
import {
  createCameraFollowSettings,
  resolveCameraFollowPolicy,
} from '../../project/camera/cursor-policy';
import { expect, it } from 'vitest';
import { normalizeVideoProjectCursorSkin } from '../../project/cursor';
import type { CursorFocusPath } from '../../project/cursor-focus-path/types';
import {
  deriveReviewCursorFocusPath,
  evaluateReviewCursorFocus,
  evaluateReviewFollowCursor,
  reviewCameraPlanObservations,
  type ReviewCursorFacts,
} from './cursor-focus-path';
import {
  evaluateQuickEditCameraAtTime,
  resolveReviewCameraGeometry,
  resolveReviewSceneCameraPlan,
} from './scene';
import type { QuickEditZoomRegion } from './types';

it.each([undefined, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4])(
  'emits both exact capture endpoints before the next 30Hz observation at rate %s',
  (rate) => {
    const cut = 2.01;
    const resultStart = 0.123;
    const sourceStart = 0.2;
    const resultEnd = rate === undefined ? 4 : resultStart + (4 - sourceStart) / rate;
    const resultCut = rate === undefined ? cut : resultStart + (cut - sourceStart) / rate;
    const path: CursorFocusPath = {
      version: 1,
      mode: 'follow',
      smoothing: 0,
      sensitivity: 0.5,
      gapPolicy: 'hold',
      segments: [
        {
          id: 'before',
          start: 0,
          end: cut,
          binding: { kind: 'project' },
          keys: [
            { id: 'a', time: 0, x: 0.26, y: 0.42, anchor: 'boundary', interpolation: 'linear' },
            { id: 'b', time: cut, x: 0.26, y: 0.42, anchor: 'movement', interpolation: 'linear' },
          ],
        },
        {
          id: 'after',
          start: cut,
          end: 4,
          binding: { kind: 'project' },
          keys: [
            { id: 'c', time: cut, x: 0.27, y: 0.41, anchor: 'boundary', interpolation: 'linear' },
            { id: 'd', time: 4, x: 0.3, y: 0.18, anchor: 'movement', interpolation: 'linear' },
          ],
        },
      ],
    };
    const region: QuickEditZoomRegion = {
      id: 'capture-cut',
      start: 0,
      end: resultEnd,
      transform: { scale: 1.5, centerX: 0.5, centerY: 0.5 },
      enter: { type: 'none', duration: 0 },
      exit: { type: 'none', duration: 0 },
      cursorFocus: {
        path,
        observed: path,
        ...(rate === undefined
          ? {}
          : {
              timeMap: [{ kind: 'speed', sourceStart, sourceEnd: 4, resultStart, resultEnd, rate }],
            }),
      },
    };
    const before = structuredClone(region);
    const frames = reviewCameraPlanObservations(region);
    expect(frames.filter((frame) => frame.time === resultCut)).toEqual([
      expect.objectContaining({
        x: 0.26,
        y: 0.42,
        segmentId: 'before:0',
        actual: { x: 0.26, y: 0.42 },
      }),
      expect.objectContaining({
        x: 0.27,
        y: 0.41,
        segmentId: 'after:0',
        actual: { x: 0.27, y: 0.41 },
      }),
    ]);
    expect(frames.find((frame) => frame.segmentId === 'after:0')?.time).toBe(resultCut);
    expect(reviewCameraPlanObservations(region)).toEqual(frames);
    expect(region).toEqual(before);
  }
);

const facts: ReviewCursorFacts = {
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
        x: 80,
        y: 80,
        visible: true,
        observation: 'observed',
        captureSegment: 0,
        recordingPoint: { x: 0.8, y: 0.8 },
      },
      {
        id: 'end',
        time: 4,
        x: 90,
        y: 90,
        visible: true,
        observation: 'observed',
        captureSegment: 0,
        recordingPoint: { x: 0.9, y: 0.9 },
      },
    ],
  },
  actionEvents: [],
  signals: [],
};
const source = { width: 100, height: 100, duration: 4 };
const authored: CursorFocusPath = {
  version: 1,
  smoothing: 0.5,
  sensitivity: 0.5,
  mode: 'follow',
  gapPolicy: 'hold',
  segments: [
    {
      id: 'authored',
      binding: { kind: 'project' },
      start: 0,
      end: 4,
      keys: [{ id: 'manual', time: 0, x: 0.1, y: 0.1, anchor: 'manual', interpolation: 'hold' }],
    },
  ],
};

it.each([0.5, 1, 2, 4].flatMap((rate) => [1.2, 2, 2.5, 4].map((scale) => [rate, scale] as const)))(
  [
    'evaluates Follow at speed %s and zoom %s ',
    'and contains the physical pointer over an opposing authored path',
  ].join(''),
  (rate, scale) => {
    const stationaryFacts = {
      ...facts,
      cursorTrack: {
        ...facts.cursorTrack!,
        samples: facts.cursorTrack!.samples.map((sample, index) => ({
          ...sample,
          recordingPoint: { x: [0.57, 0.58, 0.56][index]!, y: 0.57 },
        })),
      },
    };
    const region: QuickEditZoomRegion = {
      id: 'follow',
      start: 0,
      end: 4 / rate,
      transform: { scale, centerX: 0.5, centerY: 0.5 },
      enter: { type: 'linear', duration: 0 },
      exit: { type: 'linear', duration: 0 },
      cursorFocus: {
        scene: { source, background: { enabled: false } },
        path: authored,
        observed: deriveReviewCursorFocusPath(stationaryFacts, source, true),
        timeMap: [
          {
            kind: rate === 1 ? 'keep' : 'speed',
            rate,
            sourceStart: 0,
            sourceEnd: 4,
            resultStart: 0,
            resultEnd: 4 / rate,
          },
        ],
      },
    };
    expect(resolveReviewSceneCameraPlan([region], region)?.status).toBe('ready');
    for (const outputTime of [0.75 / rate, 1.25 / rate, 2 / rate]) {
      const shared = evaluateQuickEditCameraAtTime([region], outputTime);
      const adapter = evaluateReviewFollowCursor(
        region,
        outputTime,
        region.transform,
        resolveReviewCameraGeometry([region], region)
      );
      expect(shared).toEqual(adapter);
      const actual = evaluateReviewCursorFocus(region.cursorFocus!.observed!, outputTime * rate)!;
      expect(Math.abs(actual.x - shared.centerX)).toBeLessThanOrEqual(1 / shared.scale / 2 + 1e-9);
      expect(Math.abs(actual.y - shared.centerY)).toBeLessThanOrEqual(1 / shared.scale / 2 + 1e-9);
      expect(shared.scale).toBe(scale);
      expect(evaluateQuickEditCameraAtTime([region], outputTime)).toEqual(shared);
    }
  }
);

it('does not bridge captured gaps or create source geometry for legacy unverified samples', () => {
  const track = facts.cursorTrack!;
  const split = deriveReviewCursorFocusPath(
    {
      ...facts,
      cursorTrack: {
        ...track,
        samples: [
          ...track.samples.slice(0, 2),
          {
            id: 'loss',
            time: 2,
            x: 80,
            y: 80,
            visible: false,
            observation: 'outside',
            captureSegment: 0,
            recordingPoint: null,
          },
          { ...track.samples[2]!, time: 3, captureSegment: 1 },
        ],
      },
    },
    source
  );
  expect(evaluateReviewCursorFocus(split, 2.5)).toBeNull();
  const unverified = deriveReviewCursorFocusPath(
    {
      ...facts,
      cursorTrack: {
        ...track,
        samples: track.samples.map(({ recordingPoint: _point, ...sample }) => sample),
      },
    },
    source
  );
  expect(unverified.segments).toEqual([]);
});

it('admits authored path only under advanced schema 18 and detaches receiving content', () => {
  const content = {
    ...createQuickEditAdvancedContent(),
    cursorFocusPath: structuredClone(authored),
  };
  expect(loadQuickEditAdvancedContentState({ ...content, schemaVersion: 17 })).toBeNull();
  const admitted = loadQuickEditAdvancedContentState(content)!;
  expect(admitted.cursorFocusPath).toEqual(authored);
  content.cursorFocusPath.segments[0]!.keys[0]!.x = 0.9;
  expect(admitted.cursorFocusPath!.segments[0]!.keys[0]!.x).toBe(0.1);
});

it('closes the prior observation run on capture segment change even without a separate loss marker', () => {
  const path = deriveReviewCursorFocusPath(
    {
      ...facts,
      cursorTrack: {
        ...facts.cursorTrack!,
        samples: [
          facts.cursorTrack!.samples[0]!,
          { ...facts.cursorTrack!.samples[2]!, time: 3, captureSegment: 1 },
        ],
      },
    },
    source
  );
  expect(evaluateReviewCursorFocus(path, 2)).toBeNull();
  expect(evaluateReviewCursorFocus(path, 3)).toMatchObject({ x: 0.9, y: 0.9 });
});

it('keeps dense observations intact while offering sparse geometric keys in Gallery', () => {
  const samples = Array.from({ length: 161 }, (_, index) => ({
    ...facts.cursorTrack!.samples[0]!,
    id: `dense:${index}`,
    time: index * 0.025,
    recordingPoint: { x: 0.1 + 0.8 * (index / 160) ** 2, y: 0.4 },
  }));
  const recorded = { ...facts, cursorTrack: { ...facts.cursorTrack!, samples } };
  const before = structuredClone(recorded);
  const focus = deriveReviewCursorFocusPath(recorded, source);
  expect(focus.segments[0]!.keys.map((key) => key.id)).toEqual(['dense:0', 'dense:160']);
  expect(deriveReviewCursorFocusPath(recorded, source, true).segments[0]!.keys).toHaveLength(161);
  expect(recorded).toEqual(before);
});

it('keeps one continuous camera across adjacent speed runs of the same captured source', () => {
  const path: CursorFocusPath = {
    version: 1,
    mode: 'follow',
    smoothing: 0,
    sensitivity: 0.5,
    gapPolicy: 'hold',
    segments: [
      {
        id: 'native',
        start: 0,
        end: 2,
        binding: { kind: 'project' },
        keys: [0, 1, 2].map((time) => ({
          id: `speed-${time}`,
          time,
          x: 0.4 + time * 0.1,
          y: 0.5,
          anchor: 'movement',
          interpolation: 'linear',
        })),
      },
    ],
  };
  const scene = { source: { width: 1000, height: 600 }, background: { enabled: false as const } };
  const region: QuickEditZoomRegion = {
    id: 'speed-camera',
    start: 0,
    end: 2.5,
    transform: { scale: 2, centerX: 0.5, centerY: 0.5 },
    enter: { type: 'none', duration: 0 },
    exit: { type: 'none', duration: 0 },
    cursorFocus: {
      path,
      observed: path,
      scene,
      policy: resolveCameraFollowPolicy({ defaults: createCameraFollowSettings('fast') }),
      timeMap: [
        { kind: 'speed', sourceStart: 0, sourceEnd: 1, resultStart: 0, resultEnd: 2, rate: 0.5 },
        { kind: 'speed', sourceStart: 1, sourceEnd: 2, resultStart: 2, resultEnd: 2.5, rate: 2 },
      ],
    },
  };
  const before = structuredClone(region);
  const plan = resolveReviewSceneCameraPlan([region], region, scene);
  expect(plan?.status).toBe('ready');
  if (plan?.status !== 'ready') return;
  expect(plan.spans).toHaveLength(1);
  expect(plan.discontinuities).not.toContainEqual({ time: 2, reason: 'source' });
  expect(evaluateQuickEditCameraAtTime([region], 2 - 1e-6, scene)).toEqual(
    evaluateQuickEditCameraAtTime([region], 2, scene)
  );
  expect(region).toEqual(before);
});

it('reuses the camera plan as time advances and replaces it after geometry or trajectory changes', () => {
  const scene = { source, background: { enabled: false as const } };
  const region: QuickEditZoomRegion = {
    id: 'retained-camera',
    start: 0,
    end: 4,
    transform: { scale: 2, centerX: 0.5, centerY: 0.5 },
    enter: { type: 'none', duration: 0 },
    exit: { type: 'none', duration: 0 },
    cursorFocus: {
      scene,
      path: authored,
      observed: deriveReviewCursorFocusPath(facts, source, true),
    },
  };
  const plan = resolveReviewSceneCameraPlan([region], region, scene);
  expect(plan?.status).toBe('ready');
  for (const time of [0.1, 0.5, 1, 2, 3.5]) {
    evaluateQuickEditCameraAtTime([region], time, scene);
    expect(resolveReviewSceneCameraPlan([region], region, { ...scene })).toBe(plan);
  }
  const scaled = { ...region, transform: { ...region.transform, scale: 3 } };
  expect(resolveReviewSceneCameraPlan([scaled], scaled, scene)).not.toBe(plan);
  const resized = { ...scene, source: { width: 200, height: 100, duration: 4 } };
  expect(resolveReviewSceneCameraPlan([region], region, resized)).not.toBe(plan);
  const changed = {
    ...region,
    cursorFocus: {
      ...region.cursorFocus!,
      observed: structuredClone(region.cursorFocus!.observed!),
    },
  };
  expect(resolveReviewSceneCameraPlan([changed], changed, scene)).not.toBe(plan);
});

it('retains immutable source-clock observation work across geometry and policy revisions', async () => {
  const { reviewCameraPlanObservations } = await import('./cursor-focus-path');
  const path = deriveReviewCursorFocusPath(facts, source, true);
  let reads = 0;
  for (const segment of path.segments)
    for (const key of segment.keys) {
      const time = key.time;
      Object.defineProperty(key, 'time', {
        get() {
          reads++;
          return time;
        },
      });
    }
  const region: QuickEditZoomRegion = {
    id: 'observations',
    start: 0,
    end: 4,
    transform: { scale: 2, centerX: 0.5, centerY: 0.5 },
    enter: { type: 'none', duration: 0 },
    exit: { type: 'none', duration: 0 },
    cursorFocus: { path, observed: path, scene: { source, background: { enabled: false } } },
  };
  const first = reviewCameraPlanObservations(region);
  reads = 0;
  const changed = {
    ...region,
    cursorFocus: {
      ...region.cursorFocus!,
      policy: resolveCameraFollowPolicy({ defaults: createCameraFollowSettings('fast') }),
      scene: {
        source,
        background: { enabled: false as const },
        canvas: { width: 720, height: 720 },
      },
    },
  };
  const again = reviewCameraPlanObservations(changed);
  expect(again).toEqual(first);
  expect(reads).toBe(0);
  expect(again).not.toBe(first);
  again[0]!.x = -10;
  again[0]!.actual!.x = -10;
  expect(reviewCameraPlanObservations(region)).toEqual(first);
  reads = 0;
  reviewCameraPlanObservations({ ...region, end: 3 });
  expect(reads).toBeGreaterThan(0);
  reads = 0;
  reviewCameraPlanObservations({
    ...region,
    cursorFocus: { ...region.cursorFocus!, path: { ...path, smoothing: 0.9 } },
  });
  expect(reads).toBeGreaterThan(0);
  reads = 0;
  reviewCameraPlanObservations({
    ...region,
    cursorFocus: {
      ...region.cursorFocus!,
      timeMap: [
        { kind: 'speed', sourceStart: 0, sourceEnd: 4, resultStart: 0, resultEnd: 2, rate: 2 },
      ],
    },
  });
  expect(reads).toBeGreaterThan(0);
});

it('applies current crop and path revisions after retained observation derivation', async () => {
  const { reviewCameraPlanObservations } = await import('./cursor-focus-path');
  const path = deriveReviewCursorFocusPath(facts, source, true);
  const region: QuickEditZoomRegion = {
    id: 'crop-observations',
    start: 0,
    end: 4,
    transform: { scale: 2, centerX: 0.5, centerY: 0.5 },
    enter: { type: 'none', duration: 0 },
    exit: { type: 'none', duration: 0 },
    cursorFocus: { path, observed: path, scene: { source, background: { enabled: false } } },
  };
  const original = reviewCameraPlanObservations(region);
  const authored = structuredClone(path);
  authored.segments[0]!.keys[1]!.x = 0.4;
  const observed = structuredClone(path);
  observed.segments[0]!.keys[1]!.x = 0.6;
  const variants: QuickEditZoomRegion[] = [
    { ...region, cursorFocus: { ...region.cursorFocus!, path: authored } },
    { ...region, cursorFocus: { ...region.cursorFocus!, observed } },
    ...[0, 0.5].map((x) => ({
      ...region,
      cursorFocus: {
        ...region.cursorFocus!,
        scene: {
          source,
          background: { enabled: false as const },
          canvas: { width: 100, height: 100, crop: { x, y: 0.2, width: 0.5, height: 0.5 } },
        },
      },
    })),
    {
      ...region,
      cursorFocus: {
        ...region.cursorFocus!,
        scene: {
          source: { ...source, width: 200 },
          background: { enabled: false },
          canvas: { width: 100, height: 100, crop: { x: 0, y: 0.2, width: 0.5, height: 0.5 } },
        },
      },
    },
  ];
  for (const candidate of variants) {
    const actual = reviewCameraPlanObservations(candidate);
    expect(actual).toEqual(reviewCameraPlanObservations(structuredClone(candidate)));
    expect(actual).not.toEqual(original);
  }
  expect(reviewCameraPlanObservations(region)).toEqual(original);
});

it('continuously centers the new Gallery cursor workflow when 3D is off', () => {
  const path: CursorFocusPath = {
    version: 1,
    smoothing: 0,
    sensitivity: 0.5,
    mode: 'follow',
    gapPolicy: 'hold',
    segments: [
      {
        id: 'sweep',
        binding: { kind: 'project' },
        start: 0,
        end: 4,
        keys: [
          { id: 'a', time: 0, x: 0.4, y: 0.5, anchor: 'boundary', interpolation: 'linear' },
          { id: 'b', time: 4, x: 0.5, y: 0.5, anchor: 'boundary', interpolation: 'linear' },
        ],
      },
    ],
  };
  const region: QuickEditZoomRegion = {
    id: 'continuous',
    start: 0,
    end: 4,
    transform: { scale: 2, centerX: 0.5, centerY: 0.5 },
    enter: { type: 'linear', duration: 0 },
    exit: { type: 'linear', duration: 0 },
    cursorComposition: { mode: 'off', amount: 0.5, smoothness: 0 },
    cursorFocus: {
      scene: { source, background: { enabled: false } },
      policy: resolveCameraFollowPolicy({ defaults: createCameraFollowSettings('fast') }),
      path,
    },
  };
  const plan = resolveReviewSceneCameraPlan([region], region);
  expect(plan?.status).toBe('ready');
  if (plan?.status !== 'ready') return;
  expect(plan.spans.filter((span) => span.kind === 'transition').length).toBeGreaterThan(2);
  expect(
    evaluateQuickEditCameraAtTime([region], 3).centerX -
      evaluateQuickEditCameraAtTime([region], 1).centerX
  ).toBeGreaterThan(0.03);
});
