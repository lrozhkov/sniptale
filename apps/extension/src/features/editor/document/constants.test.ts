import { describe, expect, it } from 'vitest';

import type { BorderPreset } from '../../highlighter/contracts';
import {
  DEFAULT_EDITOR_IMAGE_SETTINGS,
  DEFAULT_EDITOR_TOOL_SETTINGS,
  EDITOR_TOOL_SHAPE_FILL_PALETTE,
  EDITOR_TOOL_SHAPE_STROKE_PALETTE,
  EDITOR_TOOL_TEXT_BACKGROUND_PALETTE,
  EDITOR_TOOL_TEXT_COLOR_PALETTE,
  normalizeEditorImageSettings,
} from './constants';

function createBorderPreset(overrides: Partial<BorderPreset> = {}): BorderPreset {
  return {
    color: '#2563eb',
    customCss: '',
    fillColor: '#16a34a',
    fillOpacity: 35,
    id: 'preset-1',
    inheritCustomCss: true,
    name: 'Default',
    opacity: 42,
    order: 0,
    padding: {
      bottom: 4,
      left: 3,
      right: 3,
      top: 2,
    },
    radius: 12,
    shadow: 30,
    strokeOpacity: 70,
    style: 'dashed',
    width: 6,
    ...overrides,
  };
}

function assertBorderPresetDefaults(): void {
  const borderPreset = createBorderPreset();
  const settings = DEFAULT_EDITOR_TOOL_SETTINGS(borderPreset);

  assertShapeAndStepDefaults(settings);
  assertTextAndFreehandDefaults(settings);
  assertBlurImageAndLineDefaults(settings);
}

type ToolSettings = ReturnType<typeof DEFAULT_EDITOR_TOOL_SETTINGS>;

function assertShapeAndStepDefaults(settings: ToolSettings): void {
  expect(settings.rectangle).toEqual({
    borderPresetId: 'preset-1',
    customCss: '',
    fillColor: '#16a34a',
    fillOpacity: 0.35,
    inheritCustomCss: false,
    opacity: 0.7,
    radius: 12,
    shadow: 30,
    shadowAngle: 90,
    shadowBlur: 12,
    shadowColor: '#2563eb',
    shadowDistance: 4,
    strokeColor: '#2563eb',
    strokeOpacity: 0.7,
    strokeStyle: 'dashed',
    strokeWidth: 6,
  });
  expect(settings.ellipse).toEqual(settings.rectangle);
  expect(settings.step).toEqual({
    alphabet: 'cyrillic',
    color: '#2563eb',
    opacity: 1,
    sizeLevel: 3,
    strokeColor: '#f8fafc',
    strokeOpacity: 1,
    strokeWidth: 2,
    textColor: '#ffffff',
    type: 'number',
    value: '1',
  });
}

function assertTextAndFreehandDefaults(settings: ToolSettings): void {
  expect(settings.text).toEqual(
    expect.objectContaining({
      backgroundOpacity: 1,
      backgroundColor: '#f97316',
      calloutFormat: 'plain',
      shadow: 0,
      shadowAngle: 90,
      shadowColor: '#111827',
      textColor: '#111827',
      textOpacity: 1,
      verticalAlign: 'top',
    })
  );
  expect(settings.pencil.shadow).toBe(0);
  expect(settings.pencil.shadowAngle).toBe(90);
  expect(settings.pencil.shadowColor).toBe(settings.pencil.color);
  expect(settings.pencil.dynamicWidth).toBe(true);
  expect(settings.pencil.smoothingLevel).toBe(10);
  expect(settings.pencil.shapeCorrection).toBe('subtle');
  expect(settings.highlighter.shadow).toBe(0);
  expect(settings.highlighter.shadowAngle).toBe(90);
  expect(settings.highlighter.shadowColor).toBe(settings.highlighter.color);
  expect(settings.highlighter.dynamicWidth).toBe(false);
  expect(settings.highlighter.smoothingLevel).toBe(10);
  expect(settings.highlighter.shapeCorrection).toBe('off');
  expect(settings.text).not.toHaveProperty('maxWidth');
}

function assertBlurImageAndLineDefaults(settings: ToolSettings): void {
  expect(settings.blur.strokeWidth).toBe(0);
  expect(settings.blur.showBorder).toBe(false);
  expect(settings.image).toEqual(
    expect.objectContaining({
      opacity: 1,
      radius: 12,
      shadow: 30,
      strokeColor: '#2563eb',
      strokeOpacity: 0.7,
      strokeStyle: 'dashed',
      strokeWidth: 0,
    })
  );
  expect(settings.arrow.shadow).toBe(0);
  expect(settings.arrow.shadowAngle).toBe(90);
  expect(settings.arrow.shadowColor).toBe(settings.arrow.color);
  expect(settings.arrow.variant).toBe('standard');
  expect(settings.arrow.arrowType).toBe('sharp');
  expect(settings.arrow.dynamicWidth).toBe(false);
  expect(settings.arrow.width).toBe(18);
  expect(settings.line).toEqual(
    expect.objectContaining({
      corners: 'round',
      fillMode: 'none',
      opacity: 1,
      shadow: 0,
      shadowAngle: 90,
      shadowColor: '#111827',
      style: 'solid',
      width: 3,
    })
  );
}

describe('editor-document constants', () => {
  registerEditorToolDefaultTests();
  registerEditorPaletteTests();
  registerEditorImageSettingTests();
});

function registerEditorToolDefaultTests() {
  it('maps border presets into default shape and step settings', assertBorderPresetDefaults);
}

function registerEditorPaletteTests() {
  it('keeps compact editor color palettes on the canonical ten-color row', () => {
    [
      EDITOR_TOOL_TEXT_COLOR_PALETTE,
      EDITOR_TOOL_TEXT_BACKGROUND_PALETTE,
      EDITOR_TOOL_SHAPE_STROKE_PALETTE,
      EDITOR_TOOL_SHAPE_FILL_PALETTE,
    ].forEach((palette) => expect(palette).toHaveLength(10));
  });
}

function registerEditorImageSettingTests() {
  it('normalizes image style settings with safe defaults and legacy line styles', () => {
    expect(normalizeEditorImageSettings(null)).toEqual(DEFAULT_EDITOR_IMAGE_SETTINGS);
    expect(
      normalizeEditorImageSettings({
        opacity: 0.4,
        radius: 9,
        shadow: 150,
        strokeOpacity: -1,
        strokeStyle: 'dashed',
        strokeWidth: 5,
      })
    ).toEqual(
      expect.objectContaining({
        opacity: 0.4,
        radius: 9,
        shadow: 150,
        strokeOpacity: 0,
        strokeStyle: 'dashed',
        strokeWidth: 5,
      })
    );
  });

  it('keeps image defaults stable when border presets omit optional visual values', () => {
    const settings = DEFAULT_EDITOR_TOOL_SETTINGS(createBorderPreset({ shadow: 0 }));

    expect(settings.image).toEqual(
      expect.objectContaining({
        shadow: 0,
        shadowAngle: 90,
        shadowBlur: 12,
        shadowDistance: 4,
      })
    );
  });
}
