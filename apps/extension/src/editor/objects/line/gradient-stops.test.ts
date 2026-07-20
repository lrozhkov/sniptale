// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { DEFAULT_EDITOR_TOOL_SETTINGS } from '../../../features/editor/document/constants';
import { DEFAULT_BORDER_PRESET } from '../../../features/highlighter/style/defaults';
import { createLineObject, readLineSettings, updateLineObject } from './';

const settings = DEFAULT_EDITOR_TOOL_SETTINGS(DEFAULT_BORDER_PRESET).line;

function clearTopLevelLineGradientMetadata(line: ReturnType<typeof createLineObject>) {
  Reflect.deleteProperty(line, 'sniptaleLineGradientFrom');
  Reflect.deleteProperty(line, 'sniptaleLineGradientTo');
  Reflect.deleteProperty(line, 'sniptaleLineGradientStops');
  Reflect.deleteProperty(line, 'sniptaleLineFillMode');
  Reflect.deleteProperty(line, 'sniptaleLineFillColor');
  Reflect.deleteProperty(line, 'sniptaleLineRoughFillStyle');
  Reflect.deleteProperty(line, 'sniptaleLineRoughFillColor');
}

function createBasicLine(id: string, labelIndex: number) {
  return createLineObject({
    id,
    labelIndex,
    points: [
      { x: 0, y: 0 },
      { x: 18, y: 0 },
    ],
    settings,
  });
}

function expectLegacySettingsStops(line: ReturnType<typeof createLineObject>) {
  expect(readLineSettings(line)).toMatchObject({
    fillColor: '#303030',
    fillMode: 'color',
    gradientFrom: '#101010',
    gradientTo: '#202020',
    roughFillColor: '#404040',
    roughFillStyle: 'zigzag',
  });
  expect(readLineSettings(line).gradientStops).toEqual([
    { color: '#101010', offset: 0 },
    { color: '#151515', offset: 0.75 },
    { color: '#202020', offset: 1 },
  ]);
}

function expectFallbackSettingsStops(line: ReturnType<typeof createLineObject>) {
  expect(readLineSettings(line)).toMatchObject({
    fillColor: settings.fillColor,
    fillMode: settings.fillMode,
    roughFillColor: settings.roughFillColor,
    roughFillStyle: settings.roughFillStyle,
  });
  expect(readLineSettings(line).gradientStops).toEqual([
    { color: settings.gradientFrom, offset: 0 },
    { color: settings.gradientTo, offset: 1 },
  ]);
}

it('writes positional gradient stops into Fabric metadata and reads them back', () => {
  const line = createLineObject({
    id: 'line-gradient',
    labelIndex: 1,
    points: [
      { x: 0, y: 0 },
      { x: 32, y: 0 },
      { x: 32, y: 32 },
    ],
    settings,
  });

  updateLineObject(line, {
    closed: true,
    settings: {
      ...settings,
      fillMode: 'gradient',
      gradientStops: [
        { color: '#111111', offset: 0 },
        { color: '#333333', offset: 0.25 },
        { color: '#222222', offset: 1 },
      ],
    },
  });

  expect(line.sniptaleLineGradientStops).toEqual([
    { color: '#111111', offset: 0 },
    { color: '#333333', offset: 0.25 },
    { color: '#222222', offset: 1 },
  ]);
  expect(readLineSettings(line).gradientStops).toEqual(line.sniptaleLineGradientStops);
});

it('falls back to legacy from/to colors and clears stale stop metadata', () => {
  const line = createLineObject({
    id: 'line-gradient-legacy',
    labelIndex: 2,
    points: [
      { x: 0, y: 0 },
      { x: 24, y: 0 },
    ],
    settings: {
      ...settings,
      gradientFrom: '#111111',
      gradientTo: '#222222',
      gradientStops: undefined,
    },
  });
  line.sniptaleLineGradientStops = [{ color: '#333333', offset: 0.5 }];

  updateLineObject(line, {
    settings: { ...settings, gradientStops: undefined },
  });

  expect(line.sniptaleLineGradientStops).toBeUndefined();
  expect(readLineSettings(line).gradientStops).toEqual([
    { color: settings.gradientFrom, offset: 0 },
    { color: settings.gradientTo, offset: 1 },
  ]);
});

it('reads positional stops from legacy settings and fallback colors when top-level metadata is absent', () => {
  const line = createBasicLine('line-gradient-settings', 3);

  clearTopLevelLineGradientMetadata(line);
  line.sniptaleLineSettings = {
    ...settings,
    fillColor: '#303030',
    fillMode: 'color',
    gradientFrom: '#101010',
    gradientTo: '#202020',
    gradientStops: [
      { color: '#101010', offset: 0 },
      { color: '#151515', offset: 0.75 },
      { color: '#202020', offset: 1 },
    ],
    roughFillColor: '#404040',
    roughFillStyle: 'zigzag',
  };

  expectLegacySettingsStops(line);
  Reflect.deleteProperty(line, 'sniptaleLineSettings');
  expectFallbackSettingsStops(line);
});

it('renders gradient stops with opacity and transparent fill fallback for open paths', () => {
  const line = createLineObject({
    id: 'line-gradient-rendering',
    labelIndex: 4,
    points: [
      { x: 0, y: 0 },
      { x: 24, y: 0 },
      { x: 24, y: 24 },
    ],
    settings,
  });

  updateLineObject(line, {
    closed: true,
    settings: {
      ...settings,
      fillMode: 'gradient',
      fillOpacity: 0.25,
      gradientStops: [
        { color: '#000000', offset: 0 },
        { color: '#ffffff', offset: 1, opacity: 0.5 },
      ],
    },
  });
  expect(line.fill).toEqual(
    expect.objectContaining({
      colorStops: [
        { color: 'rgba(0, 0, 0, 0.25)', offset: 0 },
        { color: 'rgba(255, 255, 255, 0.125)', offset: 1 },
      ],
      type: 'linear',
    })
  );

  updateLineObject(line, {
    closed: false,
    settings: { ...settings, fillMode: 'gradient' },
  });
  expect(line.fill).toBe('transparent');
});

it('covers line fill routing and metadata fallbacks used by migrated gradient documents', () => {
  const line = createLineObject({
    id: 'line-gradient-routing',
    labelIndex: 5,
    points: [
      { x: 0, y: 0 },
      { x: 12, y: 0 },
      { x: 12, y: 12 },
    ],
    settings,
    closed: true,
  });
  const fallbackSettings = { ...settings };
  delete fallbackSettings.shadowAngle;
  delete fallbackSettings.shadowBlur;
  delete fallbackSettings.shadowColor;
  delete fallbackSettings.shadowDistance;
  delete fallbackSettings.bowing;

  updateLineObject(line, {
    closed: true,
    settings: { ...fallbackSettings, fillMode: 'color', fillColor: '#abcdef', fillOpacity: 0.5 },
  });
  expect(line.fill).toBe('rgba(171, 205, 239, 0.5)');
  expect(line.sniptaleLineShadowAngle).toBe(90);
  expect(line.sniptaleLineShadowBlur).toBe(12);
  expect(line.sniptaleLineShadowColor).toBe(settings.color);
  expect(line.sniptaleLineShadowDistance).toBe(4);

  updateLineObject(line, {
    closed: true,
    settings: { ...settings, fillMode: 'rough', roughness: 2 },
  });
  expect(line.fill).toEqual(expect.objectContaining({ repeat: 'repeat' }));

  line.sniptaleLineDrawing = true;
  updateLineObject(line, {});
  expect(line.hasBorders).toBe(false);
  expect(line.hasControls).toBe(false);
});
