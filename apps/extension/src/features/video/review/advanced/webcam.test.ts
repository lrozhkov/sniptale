import { describe, expect, it } from 'vitest';
import { buildReviewTimeMap } from '../timeline';
import { replayReviewHistory, reviewAdvancedContentBaseline } from '../document';
import { createQuickEditAdvancedState } from './defaults';
import { loadQuickEditAdvancedState } from './validation';
import {
  createQuickEditWebcam,
  parseQuickEditWebcam,
  quickEditWebcamFrameAt,
  quickEditWebcamPlacementAt,
  quickEditWebcamScreenPlacementAt,
  quickEditWebcamBounds,
  quickEditWebcamCropAt,
  moveQuickEditWebcamPosition,
} from './webcam';

const camera = () =>
  createQuickEditWebcam(
    'project-asset:camera',
    { width: 640, height: 480 },
    { width: 1920, height: 1080 }
  );

it('retains optional webcam content through parsing, baseline, undo and redo', () => {
  const original = createQuickEditAdvancedState();
  expect(loadQuickEditAdvancedState(original)).toEqual(original);
  const state = { ...original, webcam: camera() };
  const parsed = loadQuickEditAdvancedState(state);
  expect(parsed).toEqual(state);
  const before = reviewAdvancedContentBaseline(original);
  const after = reviewAdvancedContentBaseline(state);
  const source = { duration: 12, width: 1920, height: 1080, mimeType: 'video/webm', size: 100 };
  const history = [{ id: 'attach', at: 1, target: 'advancedContent' as const, before, after }];
  expect(replayReviewHistory(history, 0, source, before).advancedContent).toEqual(before);
  expect(replayReviewHistory(history, 1, source, before).advancedContent).toEqual(after);
  expect(after).toHaveProperty('webcam', state.webcam);
  expect(loadQuickEditAdvancedState({ ...state, schemaVersion: 2 })).toBeNull();
});

describe('persisted boundary', () => {
  it.each([
    { offsetSeconds: NaN },
    { offsetSeconds: Infinity },
    { offsetSeconds: 86_401 },
    { assetId: 'recording:camera' },
    { assetId: 'project-asset:' },
    { enabled: 'true' },
    { placement: { x: 0.9, y: 0, width: 0.2, height: 0.2 } },
    { placement: { x: 0, y: 0, width: 0, height: 0.2 } },
    { hiddenRanges: [{ id: 'h', start: 3, end: 2 }] },
    {
      hiddenRanges: [
        { id: 'h', start: 1, end: 3 },
        { id: 'h2', start: 2, end: 4 },
      ],
    },
    {
      hiddenRanges: [
        { id: 'h', start: 1, end: 2 },
        { id: 'h', start: 3, end: 4 },
      ],
    },
    { positions: Array.from({ length: 513 }, () => ({})) },
    { appearance: { ...camera().appearance, zoom: 5 } },
    { shadow: { intensity: 101, color: '#000000ff' } },
    { shadow: { intensity: NaN, color: '#000000ff' } },
    { shadow: { intensity: 30, color: 'url(https://example.test)' } },
    { shadow: null },
    { split: 'diagonal' },
    { appearance: { ...camera().appearance, shape: 'circle', zoom: 0 } },
  ])('rejects malformed camera content without dropping it: %j', (patch) => {
    const webcam = { ...camera(), ...patch };
    expect(parseQuickEditWebcam(webcam)).toBeNull();
    expect(loadQuickEditAdvancedState({ ...createQuickEditAdvancedState(), webcam })).toBeNull();
  });

  it('accepts adjacent hidden intervals and canonicalizes owned fields only', () => {
    const webcam = {
      ...camera(),
      hiddenRanges: [
        { id: 'a', start: 0, end: 2 },
        { id: 'b', start: 2, end: 4 },
      ],
      appearance: { ...camera().appearance, arbitrary: 'discard' },
    };
    const parsed = parseQuickEditWebcam(webcam)!;
    expect(parsed.hiddenRanges).toEqual(webcam.hiddenRanges);
    expect(parsed.appearance).not.toHaveProperty('arbitrary');
    expect(parseQuickEditWebcam(parsed)).toEqual(parsed);
  });
});

it('animates split to docked and restores the authored overlay rectangle', () => {
  const webcam = camera();
  webcam.split = 'left';
  webcam.positions = [
    {
      id: 'dock',
      time: 2,
      placement: { x: 0.7, y: 0.7, width: 0.2, height: 0.2 },
      split: null,
      transition: { type: 'ease-in-out', duration: 2 },
    },
  ];
  expect(quickEditWebcamPlacementAt(webcam, 1)).toEqual({ x: 0, y: 0, width: 0.49, height: 1 });
  expect(quickEditWebcamScreenPlacementAt(webcam, 1)).toEqual({
    x: 0.51,
    y: 0,
    width: 0.49,
    height: 1,
  });
  expect(quickEditWebcamScreenPlacementAt(webcam, 3)).toEqual({
    x: 0.255,
    y: 0,
    width: 0.745,
    height: 1,
  });
  expect(quickEditWebcamPlacementAt(webcam, 4)).toEqual(webcam.positions[0]!.placement);
  expect(quickEditWebcamScreenPlacementAt(webcam, 4)).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  expect(
    parseQuickEditWebcam({ ...webcam, positions: [{ ...webcam.positions[0], split: 'unknown' }] })
  ).toBeNull();
});

it('uses a signed offset and half-open coverage without frozen endpoint frames', () => {
  const webcam = { ...camera(), offsetSeconds: 2 };
  expect(quickEditWebcamFrameAt(webcam, 1.99, 5)).toBeNull();
  expect(quickEditWebcamFrameAt(webcam, 2, 5)?.time).toBe(0);
  expect(quickEditWebcamFrameAt(webcam, 6.99, 5)?.time).toBeCloseTo(4.99);
  expect(quickEditWebcamFrameAt(webcam, 7, 5)).toBeNull();
  expect(quickEditWebcamFrameAt({ ...webcam, offsetSeconds: -2 }, 0, 5)?.time).toBe(2);
  expect(quickEditWebcamFrameAt({ ...webcam, enabled: false }, 3, 5)).toBeNull();
});

it('keeps hide intervals on main source time independently of camera offset and playback edits', () => {
  const webcam = { ...camera(), offsetSeconds: -1, hiddenRanges: [{ id: 'h', start: 3, end: 5 }] };
  expect(quickEditWebcamFrameAt(webcam, 2.99, 20)?.time).toBeCloseTo(3.99);
  expect(quickEditWebcamFrameAt(webcam, 3, 20)).toBeNull();
  expect(quickEditWebcamFrameAt(webcam, 5, 20)?.time).toBe(6);
  const map = buildReviewTimeMap(12, [
    { id: 'cut', kind: 'cut', start: 0, end: 2, requestedStart: 0, requestedEnd: 2 },
    {
      id: 'fast',
      kind: 'speed',
      rate: 2,
      audio: 'speed',
      start: 2,
      end: 6,
      requestedStart: 2,
      requestedEnd: 6,
    },
    {
      id: 'slow',
      kind: 'speed',
      rate: 0.25,
      audio: 'speed',
      start: 6,
      end: 10,
      requestedStart: 6,
      requestedEnd: 10,
    },
  ]);
  const fast = map.find((part) => part.sourceStart === 2)!;
  const slow = map.find((part) => part.sourceStart === 6)!;
  expect(quickEditWebcamFrameAt(webcam, fast.sourceStart + fast.rate, 20)).toBeNull();
  expect(quickEditWebcamFrameAt(webcam, slow.sourceStart + slow.rate, 20)?.time).toBe(7.25);
  expect(webcam.hiddenRanges).toEqual([{ id: 'h', start: 3, end: 5 }]);
});

it('evaluates source-anchored placement transitions even when their start is cut away', () => {
  const webcam = camera();
  const first = { x: 0, y: 0, width: 0.4, height: 0.4 };
  webcam.positions = [
    { id: 'a', time: 2, placement: first, transition: { type: 'ease-in-out', duration: 4 } },
    {
      id: 'b',
      time: 4,
      placement: { x: 0, y: 0, width: 1, height: 1 },
      transition: { type: 'none', duration: 0 },
    },
  ];
  expect(quickEditWebcamPlacementAt(webcam, 1)).toEqual(webcam.placement);
  expect(quickEditWebcamPlacementAt(webcam, 3).width).toBeCloseTo(
    (webcam.placement.width + 0.4) / 2
  );
  expect(quickEditWebcamPlacementAt(webcam, 3.999).width).toBeCloseTo(0.4, 5);
  expect(quickEditWebcamPlacementAt(webcam, 5)).toEqual(webcam.positions[1]!.placement);
  expect(parseQuickEditWebcam(webcam)).toEqual(webcam);
  expect(
    parseQuickEditWebcam({ ...webcam, positions: [webcam.positions[1], webcam.positions[0]] })
  ).toBeNull();
  expect(
    parseQuickEditWebcam({ ...webcam, positions: [webcam.positions[0], webcam.positions[0]] })
  ).toBeNull();
});

it('fits extreme camera aspect ratios inside the complete scene without stretching', () => {
  const webcam = createQuickEditWebcam(
    'project-asset:portrait',
    { width: 90, height: 1600 },
    { width: 1920, height: 1080 }
  );
  expect(parseQuickEditWebcam(webcam)).toEqual(webcam);
  expect(webcam.placement.height).toBeCloseTo(0.94);
  expect((webcam.placement.width * 1920) / (webcam.placement.height * 1080)).toBeCloseTo(90 / 1600);
});

it('roundtrips circle and colored shadow through existing history without changing legacy camera content', () => {
  const original = createQuickEditAdvancedState();
  const webcam = {
    ...camera(),
    appearance: { ...camera().appearance, shape: 'circle' as const },
    shadow: { intensity: 45, color: '#12345680' },
  };
  const advanced = { ...original, webcam };
  expect(loadQuickEditAdvancedState(advanced)).toEqual(advanced);
  const before = reviewAdvancedContentBaseline(original);
  const after = reviewAdvancedContentBaseline(advanced);
  const source = { duration: 12, width: 1920, height: 1080, mimeType: 'video/webm', size: 100 };
  const history = [{ id: 'appearance', at: 1, target: 'advancedContent' as const, before, after }];
  expect(replayReviewHistory(history, 0, source, before).advancedContent).toEqual(before);
  expect(replayReviewHistory(history, 1, source, before).advancedContent.webcam).toEqual(webcam);
  expect(parseQuickEditWebcam(camera())).not.toHaveProperty('shadow');
});

it.each([
  { width: 1920, height: 1080 },
  { width: 600, height: 1000 },
  { width: 1000, height: 1000 },
])('keeps circle bounds square in pixels and centered for scene %j', (output) => {
  const placement = { x: 0.1, y: 0.2, width: 0.4, height: 0.5 };
  const bounds = quickEditWebcamBounds(placement, output, 'circle');
  expect(bounds.width * output.width).toBeCloseTo(bounds.height * output.height);
  expect(bounds.x + bounds.width / 2).toBeCloseTo(placement.x + placement.width / 2);
  expect(bounds.y + bounds.height / 2).toBeCloseTo(placement.y + placement.height / 2);
  expect(quickEditWebcamBounds(placement, output, 'ellipse')).toBe(placement);
});

it('retains bounded per-position crop and shrink transitions through persistence', () => {
  const value = camera();
  value.positions = [
    {
      id: 'a',
      time: 2,
      placement: { ...value.placement, x: 0.1 },
      crop: { zoom: 2, panX: 0.5, panY: -0.5 },
      transition: { type: 'shrink', duration: 2 },
    },
  ];
  expect(parseQuickEditWebcam(value)).toEqual(value);
  const middle = quickEditWebcamPlacementAt(value, 3);
  expect(middle.width).toBeCloseTo(value.placement.width * 0.45);
  expect(middle.x + middle.width / 2).toBeCloseTo(
    (value.placement.x + 0.1) / 2 + value.placement.width / 2
  );
  expect(quickEditWebcamCropAt(value, 3)).toEqual({ zoom: 1.5, panX: 0.25, panY: -0.25 });
  expect(quickEditWebcamFrameAt(value, 4, 12)?.crop).toEqual(value.positions[0]!.crop);
  expect(quickEditWebcamPlacementAt(value, 4)).toEqual(value.positions[0]!.placement);
  for (const crop of [{ zoom: 5, panX: 0, panY: 0 }, { zoom: 2, panX: NaN, panY: 0 }, {}])
    expect(
      parseQuickEditWebcam({ ...value, positions: [{ ...value.positions[0], crop }] })
    ).toBeNull();
  const legacy = {
    ...value,
    positions: value.positions.map(({ crop: _crop, ...position }) => position),
  };
  expect(parseQuickEditWebcam(legacy)).toEqual(legacy);
  expect(quickEditWebcamCropAt(legacy, 4)).toMatchObject({ zoom: 1, panX: 0, panY: 0 });
});

it('clamps marker movement between neighbours, retaining identity, crop and transitions', () => {
  const value = camera();
  value.positions = [2, 4, 6].map((time, i) => ({
    id: String(i),
    time,
    placement: value.placement,
    transition: { type: 'none', duration: 0 },
  }));
  expect(moveQuickEditWebcamPosition(value, '1', 9, 12).positions[1]!.time).toBe(5.999);
  expect(moveQuickEditWebcamPosition(value, '1', -1, 12).positions[1]!.time).toBe(2.001);
  expect(moveQuickEditWebcamPosition(value, '1', 4.12345, 12).positions[1]!.time).toBe(4.123);
  expect(moveQuickEditWebcamPosition(value, 'missing', 1, 12)).toBe(value);
  expect(moveQuickEditWebcamPosition(value, '1', NaN, 12)).toBe(value);
  expect(value.positions[1]!.time).toBe(4);
});
