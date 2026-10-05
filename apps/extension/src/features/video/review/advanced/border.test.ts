import { createQuickEditAdvancedState } from './defaults';
import { loadQuickEditAdvancedState, loadQuickEditAdvancedContentState } from './validation';
import { expect, it } from 'vitest';
import {
  createQuickEditBorder,
  evaluateQuickEditBordersAtTime,
  parseQuickEditBorder,
  quickEditBorderPath,
} from './border';
import { createQuickEditZoomRegion, updateQuickEditZoomRegion } from './zoom';
import { createQuickEditSpotlight, evaluateQuickEditSpotlightsAtTime } from './focus';
import {
  quickEditFocusConflicts,
  resolveQuickEditFocusLink,
  packQuickEditFocusRows,
} from './focus-layout';
import { computeQuickEditSceneLayout, evaluateQuickEditCameraAtTime } from './scene';
import { projectReviewFocus } from '../focus-edits';
import { buildReviewTimeMap } from '../timeline';

const camera = (id: string, start: number, end: number) =>
  createQuickEditZoomRegion({ id, at: start, duration: end - start });
const border = () => ({
  ...camera('border', 0, 10),
  border: createQuickEditBorder(),
  sourceAnchor: { start: 0, end: 10 },
});
const geometry = {
  output: { width: 100, height: 100 },
  video: { x: 0, y: 0, width: 100, height: 100 },
  scale: 1,
};
it('admits strict annotation payloads and rejects malformed finite geometry/styles', () => {
  const good = createQuickEditBorder();
  expect(parseQuickEditBorder(good)).toEqual(good);
  for (const patch of [
    { width: Infinity },
    { width: 25 },
    { period: 0 },
    { color: 'red' },
    { style: 'wave' },
    { loop: 1 },
    { area: { x: 0.9, y: 0, width: 0.5, height: 1 } },
  ])
    expect(parseQuickEditBorder({ ...good, ...patch })).toBeNull();
});
it('reserves camera links across overlays and refuses conversion without changing history content', () => {
  const a = { ...camera('a', 0, 2), linkTo: 'b' };
  const b = camera('b', 5, 7);
  const s = { ...camera('s', 3, 4), spotlight: createQuickEditSpotlight() };
  const regions = [s, b, a];
  expect(resolveQuickEditFocusLink(regions, 'a')?.target.id).toBe('b');
  expect(quickEditFocusConflicts(regions, camera('s', 3, 4))).toBe(true);
  expect(updateQuickEditZoomRegion(regions, 's', { spotlight: null })).toEqual(regions);
  expect(quickEditFocusConflicts(regions, camera('touch', 7, 8))).toBe(false);
  expect(
    quickEditFocusConflicts(
      [...regions, { ...camera('hidden', 9, 10), sourceAnchor: { start: 20, end: 30 } }],
      { ...camera('x', 0, 1), sourceAnchor: { start: 25, end: 26 } }
    )
  ).toBe(true);
  expect(quickEditFocusConflicts([{ ...a, dormant: true }, b], camera('x', 0, 1))).toBe(false);
});
it('samples camera independently and packs overlays reproducibly', () => {
  const z = camera('z', 0, 10),
    s = { ...camera('s', 0, 10), spotlight: createQuickEditSpotlight() },
    b = border();
  expect(evaluateQuickEditCameraAtTime([s, b, z], 2).scale).toBe(1.5);
  expect([...packQuickEditFocusRows([s, z, b])]).toEqual([...packQuickEditFocusRows([b, s, z])]);
  expect(
    evaluateQuickEditSpotlightsAtTime({
      ...geometry,
      regions: [s, { ...s, id: 'second' }],
      time: 2,
    })
  ).toHaveLength(2);
});
it('starts clockwise at the tangent with analytic circular perimeter', () => {
  const path = quickEditBorderPath({ x: 0, y: 0, width: 20, height: 10 }, 2);
  expect(path.path.startsWith('M2 0H18')).toBe(true);
  expect(path.perimeter).toBeCloseTo(44 + 4 * Math.PI);
});
it('preserves source-clock phase across cut and speed slices and strips no authored fields', () => {
  const region = border();
  region.border = { ...region.border, loop: true, reveal: 'draw', exitReveal: 'erase' };
  const map = buildReviewTimeMap(10, [
    {
      id: 'speed',
      kind: 'speed',
      start: 0,
      end: 5,
      requestedStart: 0,
      requestedEnd: 5,
      rate: 2,
      audio: 'speed',
    },
    { id: 'cut', kind: 'cut', start: 5, end: 7, requestedStart: 5, requestedEnd: 7 },
  ]);
  const projected = projectReviewFocus([region], map);
  const actual = evaluateQuickEditBordersAtTime({ ...geometry, regions: projected, time: 3 });
  const expected = evaluateQuickEditBordersAtTime({ ...geometry, regions: [region], time: 7.5 });
  expect(actual[0]).toEqual({ ...expected[0], id: actual[0]!.id });
  expect(evaluateQuickEditBordersAtTime({ ...geometry, regions: projected, time: 3 })).toEqual(
    actual
  );
});
it('holds a full line initially, shrinks to a quarter and exits without a segment flash', () => {
  const region = border();
  region.border = { ...region.border, loop: true, exitReveal: 'erase', segmentPercent: 25 };
  const sample = (time: number) =>
    evaluateQuickEditBordersAtTime({ ...geometry, regions: [region], time })[0]!;
  expect(sample(0.3).end - sample(0.3).start).toBe(1);
  expect(sample(1).end - sample(1).start).toBeCloseTo(0.25);
  expect(sample(9.700001).end - sample(9.700001).start).toBeLessThanOrEqual(0.25);
  expect(sample(9.9).end - sample(9.9).start).toBeLessThan(0.1);
});

it('uses target protection with animation presence and full presence for linked morphs', () => {
  const a = {
    ...camera('a', 0, 2),
    spotlight: { ...createQuickEditSpotlight(), reveal: 'contract' as const },
    linkTo: 'b',
  };
  const b = {
    ...camera('b', 4, 6),
    spotlight: { ...createQuickEditSpotlight(), area: { x: 0.5, y: 0.5, width: 0.4, height: 0.4 } },
  };
  const entering = evaluateQuickEditSpotlightsAtTime({
    ...geometry,
    regions: [a, b],
    time: 0.15,
  })[0]!;
  expect(entering.presence).toBeCloseTo(0.5);
  expect(entering.openingClipProgress).toBeCloseTo(0.5);
  expect(entering.protectionOpening).toEqual({ x: 25, y: 25, width: 50, height: 50 });
  expect(entering.opening.width).toBeGreaterThan(50);
  const morph = evaluateQuickEditSpotlightsAtTime({ ...geometry, regions: [b, a], time: 3 })[0]!;
  expect(morph.presence).toBe(1);
  expect(morph.openingClipProgress).toBe(1);
  expect(morph.protectionOpening).toEqual(morph.opening);
});

it('normalizes legacy state and admits overlay overlap while rejecting exclusive payloads and camera overlap', () => {
  const defaults = createQuickEditAdvancedState();
  expect(loadQuickEditAdvancedState({ ...defaults, schemaVersion: 2 })?.schemaVersion).toBe(3);
  const z = camera('z', 0, 10),
    b = border();
  const state = { ...defaults, zoom: { enabled: true, regions: [b, z] } };
  expect(loadQuickEditAdvancedState(state)?.zoom.regions).toHaveLength(2);
  expect(
    loadQuickEditAdvancedState({
      ...state,
      zoom: { enabled: true, regions: [z, { ...camera('z2', 2, 3) }] },
    })
  ).toBeNull();
  expect(
    loadQuickEditAdvancedState({
      ...state,
      zoom: { enabled: true, regions: [{ ...b, spotlight: createQuickEditSpotlight() }] },
    })
  ).toBeNull();
  const derived = {
    ...b,
    borderClock: { offset: 2, rate: 2, duration: 10, enter: b.enter, exit: b.exit },
  };
  expect(
    loadQuickEditAdvancedState({ ...state, zoom: { enabled: true, regions: [derived] } })?.zoom
      .regions[0]
  ).not.toHaveProperty('borderClock');
});

it('rejects Border in legacy state and history envelopes rather than upgrading mislabeled new content', () => {
  const state = { ...createQuickEditAdvancedState(), zoom: { enabled: true, regions: [border()] } };
  expect(loadQuickEditAdvancedState({ ...state, schemaVersion: 2 })).toBeNull();
  const { ui: _ui, ...content } = state;
  expect(loadQuickEditAdvancedContentState({ ...content, schemaVersion: 2 })).toBeNull();
});

it.each([
  ['draw', 'erase'],
  ['draw-ccw', 'erase-ccw'],
] as const)(
  'matches source %s and %s exactly after cuts and across speed boundaries',
  (reveal, exitReveal) => {
    const region = {
      ...border(),
      enter: { type: 'linear' as const, duration: 3 },
      exit: { type: 'linear' as const, duration: 3 },
    };
    region.border = { ...region.border, reveal, exitReveal, loop: true, segmentPercent: 37 };
    const map = buildReviewTimeMap(10, [
      {
        id: 'speed',
        kind: 'speed',
        start: 0,
        end: 8,
        requestedStart: 0,
        requestedEnd: 8,
        rate: 2,
        audio: 'speed',
      },
      {
        id: 'enter-cut',
        kind: 'cut',
        start: 0.5,
        end: 1.5,
        requestedStart: 0.5,
        requestedEnd: 1.5,
      },
      { id: 'exit-cut', kind: 'cut', start: 8.5, end: 9, requestedStart: 8.5, requestedEnd: 9 },
    ]);
    const projected = projectReviewFocus([region], map);
    for (const span of map.filter((part) => part.kind !== 'cut')) {
      for (const time of [
        span.resultStart,
        span.resultStart + (span.resultEnd - span.resultStart) / 2,
        span.resultEnd - 0.000001,
      ]) {
        const source = span.sourceStart + (time - span.resultStart) * span.rate;
        const actual = evaluateQuickEditBordersAtTime({
          ...geometry,
          regions: projected,
          time,
        })[0]!;
        const expected = evaluateQuickEditBordersAtTime({
          ...geometry,
          regions: [region],
          time: source,
        })[0]!;
        expect(actual.start).toBeCloseTo(expected.start, 10);
        expect(actual.end).toBeCloseTo(expected.end, 10);
        expect(actual.opacity).toBeCloseTo(expected.opacity, 10);
        expect(actual.dashOffset).toBeCloseTo(expected.dashOffset!, 10);
        expect(
          evaluateQuickEditBordersAtTime({ ...geometry, regions: projected, time })[0]
        ).toEqual(actual);
      }
    }
  }
);

it('fits phase budget, omits looping without hold and gives immediate zero phases', () => {
  const base = {
    ...camera('short', 0, 1),
    border: {
      ...createQuickEditBorder(),
      loop: true,
      reveal: 'draw' as const,
      exitReveal: 'erase' as const,
    },
    enter: { type: 'linear' as const, duration: 3 },
    exit: { type: 'linear' as const, duration: 3 },
  };
  const sample = (region: typeof base, time: number) =>
    evaluateQuickEditBordersAtTime({ ...geometry, regions: [region], time })[0]!;
  expect(sample(base, 0.25).end).toBeCloseTo(0.5);
  expect(sample(base, 0.5)).toMatchObject({ start: 0, end: 1 });
  expect(sample(base, 0.75)).toMatchObject({ start: 0.5, end: 1 });
  const instant = {
    ...base,
    enter: { ...base.enter, duration: 0 },
    exit: { ...base.exit, duration: 0 },
    border: { ...base.border, loop: false },
  };
  expect(sample(instant, 0)).toMatchObject({ start: 0, end: 1, opacity: 1 });
  expect(sample(instant, 0.999)).toMatchObject({ start: 0, end: 1, opacity: 1 });
});

it('keeps all style geometry finite for tiny edge annotations and decorated camera transforms', () => {
  for (const style of ['solid', 'dashed', 'dotted'] as const) {
    for (const header of [false, true]) {
      const region = {
        ...border(),
        border: {
          ...createQuickEditBorder(),
          style,
          width: 24,
          roundness: 0.5,
          area: { x: 0.99, y: 0.99, width: 0.01, height: 0.01 },
        },
      };
      const layout = computeQuickEditSceneLayout({
        output: { width: 100, height: 120 },
        source: { width: 100, height: 100 },
        background: { enabled: false },
        camera: { scale: 2, centerX: 0.5, centerY: 0.5 },
        ...(header ? { windowHeader: { kind: 'browser' as const, title: 'Test' } } : {}),
      });
      const frame = evaluateQuickEditBordersAtTime({
        ...geometry,
        video: layout.videoTransform,
        scale: 2,
        regions: [region],
        time: 1,
      })[0]!;
      expect(frame.path).not.toMatch(/NaN|Infinity/);
      for (const value of [frame.width, frame.perimeter, frame.start, frame.end, frame.opacity])
        expect(Number.isFinite(value)).toBe(true);
      expect(frame.width).toBeLessThanOrEqual(layout.videoTransform.width * 0.01);
      expect(frame.perimeter).toBeGreaterThan(0);
      expect(frame.style).toBe(style);
    }
  }
});

it('refuses link creation and relinking across a camera while allowing unrelated overlays', () => {
  const a = camera('a', 0, 2),
    b = camera('b', 4, 6),
    c = camera('c', 8, 10);
  const overlay = { ...camera('overlay', 2, 4), border: createQuickEditBorder() };
  const original = [a, overlay, b, c];
  expect(updateQuickEditZoomRegion(original, 'a', { linkTo: 'c' })).toEqual(original);
  const linked = updateQuickEditZoomRegion(original, 'a', { linkTo: 'b' });
  expect(resolveQuickEditFocusLink(linked, 'a')?.target.id).toBe('b');
  expect(updateQuickEditZoomRegion(linked, 'a', { linkTo: 'c' })).toEqual(linked);
  expect(updateQuickEditZoomRegion(linked, 'overlay', { linkTo: 'b' })).toEqual(linked);
});

it('retains independent third Spotlight throughout a linked morph with full morph protection presence', () => {
  const a = { ...camera('a', 0, 2), spotlight: createQuickEditSpotlight(), linkTo: 'b' };
  const b = {
    ...camera('b', 5, 7),
    spotlight: { ...createQuickEditSpotlight(), area: { x: 0.5, y: 0.5, width: 0.4, height: 0.4 } },
  };
  const third = { ...camera('third', 1, 6), spotlight: createQuickEditSpotlight() };
  const regions = [third, b, a];
  expect(resolveQuickEditFocusLink(regions, 'a')?.target.id).toBe('b');
  const frames = evaluateQuickEditSpotlightsAtTime({ ...geometry, regions, time: 3 });
  expect(frames).toHaveLength(2);
  expect(frames.map((frame) => frame.presence)).toEqual([1, 1]);
  for (const frame of frames) expect(frame.protectionOpening).toEqual(frame.opening);
  const rows = packQuickEditFocusRows(regions);
  expect(rows.get('a')).toBe(rows.get('b'));
  expect(rows.get('third')).not.toBe(rows.get('a'));
  expect(updateQuickEditZoomRegion(regions, 'third', { linkTo: 'b' })).toEqual(regions);
  for (const time of [1.9, 5])
    expect(
      evaluateQuickEditSpotlightsAtTime({ ...geometry, regions, time }).every(
        (frame) => frame.presence === 1
      )
    ).toBe(true);
});

it('uses continuous straight segments for square corners without degenerate dash-resetting arcs', () => {
  const path = quickEditBorderPath({ x: 1, y: 2, width: 20, height: 10 }, 0);
  expect(path).toEqual({ path: 'M1 2H21V12H1V2Z', perimeter: 60 });
});

it('shares camera gaps but reserves future cameras and whole linked overlay chains', () => {
  const overlay = (id: string, start: number, end: number) => ({
    ...camera(id, start, end),
    spotlight: createQuickEditSpotlight(),
  });
  const regions = [
    camera('z', 4, 6),
    overlay('early', 0, 2),
    overlay('overlap', 3, 5),
    { ...overlay('a', 7, 8), linkTo: 'b' },
    { ...overlay('b', 10, 11), linkTo: 'c' },
    overlay('c', 14, 15),
    overlay('gap', 12, 13),
  ];
  const rows = packQuickEditFocusRows(regions);
  expect(rows.get('early')).toBe(0);
  expect(rows.get('overlap')).toBe(1);
  expect(rows.get('a')).toBe(0);
  expect(rows.get('b')).toBe(0);
  expect(rows.get('c')).toBe(0);
  expect(rows.get('gap')).toBe(1);
  expect([...packQuickEditFocusRows([...regions].reverse())]).toEqual([...rows]);
});

it('normalizes retained segment length and rejects explicitly invalid lengths', () => {
  const current = createQuickEditBorder();
  expect(current.segmentPercent).toBe(100);
  const { segmentPercent: _length, ...legacy } = current;
  expect(parseQuickEditBorder(legacy)?.segmentPercent).toBe(25);
  for (const segmentPercent of [0, 101, Infinity, NaN, null, undefined, '50'])
    expect(parseQuickEditBorder({ ...legacy, segmentPercent })).toBeNull();
  expect(
    parseQuickEditBorder({ ...current, reveal: 'draw-ccw', exitReveal: 'erase-ccw' })
  ).toMatchObject({ reveal: 'draw-ccw', exitReveal: 'erase-ccw' });
});

it('draws and erases from either end and moves a full patterned stroke without changing its length', () => {
  const region = {
    ...border(),
    enter: { type: 'linear' as const, duration: 1 },
    exit: { type: 'linear' as const, duration: 1 },
  };
  const sample = (time: number) =>
    evaluateQuickEditBordersAtTime({ ...geometry, regions: [region], time })[0]!;
  region.border = { ...region.border, reveal: 'draw-ccw', exitReveal: 'erase-ccw' };
  expect(sample(0.25)).toMatchObject({ start: 0.75, end: 1, opacity: 1, dashOffset: 0 });
  expect(sample(9.25)).toMatchObject({ start: 0, end: 0.75 });
  region.border = { ...region.border, loop: true, style: 'dashed' };
  const a = sample(2),
    b = sample(2.5),
    exit = sample(9),
    later = sample(9.5);
  expect(a.end - a.start).toBe(1);
  expect(b.end - b.start).toBe(1);
  expect(b.dashOffset).toBeLessThan(a.dashOffset!);
  expect(later.dashOffset).toBe(exit.dashOffset);
  expect(later.end - later.start).toBeCloseTo(0.5);
});

it('keeps camera link gaps and future-camera intersections out of overlay chains', () => {
  const s = (id: string, start: number, end: number) => ({
    ...camera(id, start, end),
    spotlight: createQuickEditSpotlight(),
  });
  const regions = [
    { ...camera('z1', 4, 5), linkTo: 'z2' },
    camera('z2', 8, 9),
    { ...s('a', 0, 1), linkTo: 'b' },
    s('b', 10, 11),
    s('gap', 6, 7),
    { ...s('hidden', 12, 13), dormant: true },
  ];
  expect(Object.fromEntries(packQuickEditFocusRows(regions))).toEqual({
    z1: 0,
    z2: 0,
    a: 1,
    b: 1,
    gap: 2,
  });
  const moved = regions.map((region) =>
    region.id === 'gap' ? { ...region, start: 11, end: 12 } : region
  );
  expect(packQuickEditFocusRows(moved).get('gap')).toBe(0);
  expect(packQuickEditFocusRows(regions).get('gap')).toBe(2);
});
