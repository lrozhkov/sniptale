// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { Shadow } from 'fabric';
import { DEFAULT_EDITOR_TOOL_SETTINGS } from '../../../features/editor/document/constants';
import { DEFAULT_BORDER_PRESET } from '../../../features/highlighter/style/defaults';
import {
  createLineObject,
  getLinePoints,
  getLineSettings,
  isEditableLineObject,
  normalizeScaledLineObject,
  readLineSettings,
  setLineEditMode,
  updateLineObject,
  updateLinePointOnDoubleClick,
} from './';

const settings = DEFAULT_EDITOR_TOOL_SETTINGS(DEFAULT_BORDER_PRESET).line;

function writeLegacyLineMetadata(line: ReturnType<typeof createLineObject>) {
  line.sniptaleLinePointsJson = JSON.stringify([
    { x: 1, y: 2 },
    { x: 8, y: 9 },
  ]);
  line.sniptaleLineColor = '#abcdef';
  line.sniptaleLineWidth = 7;
  line.sniptaleLineOpacity = 0.4;
  line.sniptaleLineShadow = 60;
  line.sniptaleLineShadowAngle = 270;
  line.sniptaleLineShadowColor = '#112233';
  line.sniptaleLineStyle = 'dot';
  line.sniptaleLineCorners = 'sharp';
  line.sniptaleLineRoughness = 3;
  line.sniptaleLineBowing = 2;
  line.sniptaleLineFillMode = 'rough';
  line.sniptaleLineFillColor = '#fedcba';
  line.sniptaleLineFillOpacity = 0.3;
  line.sniptaleLineGradientFrom = '#111111';
  line.sniptaleLineGradientTo = '#222222';
  line.sniptaleLineGradientAngle = 90;
  line.sniptaleLineRoughFillStyle = 'zigzag';
  line.sniptaleLineRoughFillColor = '#123abc';
  line.sniptaleLineRoughFillGap = 12;
  line.sniptaleLineRoughFillAngle = 45;
  line.sniptaleLineRoughFillWeight = 2;
  line.sniptaleLineRoughFillRoughness = 3;
  line.sniptaleLineRoughFillBowing = 1.5;
  line.sniptaleLineRoughFillOpacity = 0.6;
}

it('creates line objects, toggles edit controls, and reads metadata settings', () => {
  const line = createLineObject({
    id: 'line-1',
    labelIndex: 7,
    points: [
      { x: 0, y: 0 },
      { x: 30, y: 0 },
    ],
    settings: { ...settings, style: 'dash' },
  });

  expect(isEditableLineObject(line)).toBe(true);
  expect(line.sniptaleLabel).toBeTruthy();
  expect(getLinePoints(line)).toEqual([
    { x: 0, y: 0 },
    { x: 30, y: 0 },
  ]);
  expect(getLineSettings(line)).toMatchObject({ style: 'dash' });

  setLineEditMode(line, true);
  expect(line.sniptaleLineEditMode).toBe(true);
  expect(line.hasBorders).toBe(false);
  expect(Object.keys(line.controls).length).toBeGreaterThan(0);

  updateLinePointOnDoubleClick(line);
  expect(line.sniptaleLineEditMode).toBe(false);
  expect(line.hasBorders).toBe(true);
});

it('updates line state with gradient and color fills while preserving translation', () => {
  const line = createLineObject({
    id: 'line-2',
    labelIndex: 2,
    points: [
      { x: 0, y: 0 },
      { x: 30, y: 0 },
      { x: 30, y: 30 },
    ],
    settings,
  });
  line.set({ left: 20, top: 30 });

  updateLineObject(line, {
    closed: true,
    points: [
      { x: 0, y: 0 },
      { x: 30, y: 0 },
      { x: 30, y: 30 },
    ],
    settings: {
      ...settings,
      fillMode: 'gradient',
      gradientAngle: 45,
      shadow: 80,
      shadowAngle: 180,
      shadowColor: '#123456',
    },
  });

  expect(line.fill).toEqual(expect.objectContaining({ type: 'linear' }));
  expect(line.left).toEqual(expect.any(Number));
  expect(line.top).toEqual(expect.any(Number));
  expect(line.shadow).toBeInstanceOf(Shadow);
  expect(line.sniptaleLineClosed).toBe(true);
  expect(line.sniptaleLineGradientAngle).toBe(45);
  expect(line.sniptaleLineShadow).toBe(80);
  expect(line.sniptaleLineShadowAngle).toBe(180);
  expect(line.sniptaleLineShadowColor).toBe('#123456');

  updateLineObject(line, {
    closed: true,
    settings: { ...settings, fillMode: 'color', fillColor: '#abcdef', fillOpacity: 0.5 },
  });
  expect(String(line.fill)).toContain('rgba');
});

it('moves existing points and inserts midpoint controls in edit mode', () => {
  const line = createLineObject({
    id: 'line-3',
    labelIndex: 3,
    points: [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
    ],
    settings,
  });
  setLineEditMode(line, true);

  const pointControl = line.controls['p0'] as any;
  const midpointControl = line.controls['m0'] as any;

  expect(pointControl.positionHandler(null, null, line, {})).toBeDefined();
  expect(pointControl.positionHandler(null, null, {} as never, {})).toEqual(
    expect.objectContaining({ x: 0, y: 0 })
  );
  expect(pointControl.actionHandler({} as never, { target: {} } as never, 5, 6)).toBe(false);
  expect(pointControl.actionHandler({} as never, { target: line } as never, 5, 6)).toBe(true);
  expect(line.sniptaleLinePoints[0]).toEqual(expect.objectContaining({ x: expect.any(Number) }));

  expect(midpointControl.positionHandler(null, null, line, {})).toBeDefined();
  expect(midpointControl.actionHandler({} as never, { target: {} } as never, 10, 10)).toBe(false);
  expect(midpointControl.actionHandler({} as never, { target: line } as never, 10, 10)).toBe(true);
  expect(line.sniptaleLinePoints).toHaveLength(3);
});

it('places rough bowed midpoint controls on the rendered segment curve', () => {
  const line = createLineObject({
    id: 'line-bowed-midpoint',
    labelIndex: 3,
    points: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ],
    settings: { ...settings, bowing: 4, roughness: 0, width: 20 },
  });
  setLineEditMode(line, true);

  const midpointControl = line.controls['m0'] as any;
  const position = midpointControl.positionHandler(null, null, line, {});

  expect(position.y).not.toBeCloseTo(0);
});

it('reads legacy metadata fields, serialized points, and closed-loop midpoint controls', () => {
  const line = createLineObject({
    id: 'line-4',
    labelIndex: 4,
    points: [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 20 },
    ],
    settings,
    closed: true,
  });
  writeLegacyLineMetadata(line);

  expect(getLinePoints(line)).toEqual([
    { x: 1, y: 2 },
    { x: 8, y: 9 },
  ]);
  expect(readLineSettings(line)).toMatchObject({
    color: '#abcdef',
    corners: 'sharp',
    fillMode: 'rough',
    bowing: 2,
    roughFillBowing: 1.5,
    roughFillColor: '#123abc',
    roughFillOpacity: 0.6,
    roughFillRoughness: 3,
    roughFillStyle: 'zigzag',
    shadow: 60,
    shadowAngle: 270,
    shadowColor: '#112233',
    width: 7,
  });

  updateLineObject(line, {
    closed: true,
    settings: { ...settings, fillMode: 'rough', roughness: 2 },
  });
  line.sniptaleLineDrawing = true;
  updateLineObject(line, { settings });
  expect(line.hasBorders).toBe(false);
  expect(line.hasControls).toBe(false);
  delete line.sniptaleLineDrawing;
  setLineEditMode(line, true);
  expect(Object.keys(line.controls)).toEqual(['p0', 'p1', 'm0', 'm1']);
  const midpointControl = line.controls['m1'] as any;
  expect(midpointControl.positionHandler(null, null, {} as never, {})).toEqual(
    expect.objectContaining({ x: 0, y: 0 })
  );
});

it('preserves line style when rough rendering is enabled', () => {
  const line = createLineObject({
    id: 'line-rough-style',
    labelIndex: 6,
    points: [
      { x: 0, y: 0 },
      { x: 24, y: 0 },
      { x: 24, y: 24 },
    ],
    settings: { ...settings, roughness: 2, style: 'dash' },
    closed: true,
  });

  expect(line.strokeDashArray).toEqual(expect.arrayContaining([expect.any(Number)]));

  updateLineObject(line, {
    closed: true,
    settings: { ...settings, fillMode: 'rough', roughness: 2, style: 'dot' },
  });
  expect(line.strokeDashArray).toEqual(expect.arrayContaining([expect.any(Number)]));
  expect(line.sniptaleLineStyle).toBe('dot');
});

it('falls back to bundled settings metadata and rejects non-line objects', () => {
  const fallbackLine = {
    sniptaleLineSettings: { ...settings, color: '#111111', width: 9 },
  };
  const line = createLineObject({
    id: 'line-5',
    labelIndex: 5,
    points: [{ x: 4, y: 4 } as never],
    settings,
  });

  updateLineObject(line, { points: [{ x: 9, y: 9 } as never] });

  expect(readLineSettings(fallbackLine as never)).toMatchObject({
    color: '#111111',
    shadowColor: settings.shadowColor,
    width: 9,
  });
  expect(readLineSettings({ sniptaleLineColor: '#334455' } as never).shadowColor).toBe('#334455');
  expect(readLineSettings({} as never)).toMatchObject({
    shadow: 0,
    shadowAngle: 90,
    shadowColor: '#111827',
  });
  expect(getLinePoints(line)).toEqual([
    { x: 9, y: 9 },
    { x: 9, y: 9 },
  ]);
  expect(isEditableLineObject({} as never)).toBe(false);
});

it('normalizes resize-box scaling into stored line points', () => {
  const line = createLineObject({
    id: 'line-scale',
    labelIndex: 8,
    points: [
      { x: 0, y: 0 },
      { x: 20, y: 10 },
    ],
    settings,
  });
  line.set({ scaleX: 2, scaleY: 3 });

  expect(normalizeScaledLineObject(line)).toBe(true);
  expect(line.scaleX).toBe(1);
  expect(line.scaleY).toBe(1);
  expect(getLinePoints(line)).toEqual([
    { x: -10, y: -10 },
    { x: 30, y: 20 },
  ]);
  expect(normalizeScaledLineObject(line)).toBe(false);
});
