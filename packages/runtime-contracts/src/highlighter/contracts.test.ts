import { expect, expectTypeOf, it } from 'vitest';

import type {
  CalloutAnchor,
  CalloutManualPlacement,
  CalloutPreset,
  CalloutSettings,
} from './callout';
import {
  CYRILLIC_ALPHABET,
  isSystemStepBadgePresetKey,
  LATIN_ALPHABET,
  SYSTEM_STEP_BADGE_PRESET_KEYS,
} from './step-badge';
import type { StepBadgeAnchor, StepBadgeManualPlacement, StepBadgeSettings } from './step-badge';
import {
  applyManualBorderStylePatch,
  cloneAppliedBorderSettings,
  cloneBorderVisualStyle,
  isSystemBorderPresetKey,
  normalizeAppliedBorderSettings,
  projectBorderPresetToAppliedSettings,
  SYSTEM_BORDER_PRESET_KEYS,
  type BorderPreset,
} from './border-preset';

const BORDER_PRESET: BorderPreset = {
  id: 'border-1',
  name: 'Border one',
  order: 0,
  width: 2,
  color: '#ff0000',
  style: 'solid',
  radius: 4,
  padding: { top: 1, right: 2, bottom: 3, left: 4 },
  shadow: 10,
  fillPaint: {
    kind: 'gradient',
    gradient: {
      type: 'linear',
      angle: 90,
      interpolation: 'srgb',
      repeat: { enabled: false, span: 1 },
      stops: [
        { id: 'left', color: '#000000ff', position: 0, midpoint: 0.5 },
        { id: 'right', color: '#ffffffff', position: 1, midpoint: 0.5 },
      ],
    },
  },
  inheritCustomCss: false,
  customCss: '',
};

it('keeps highlighter alphabets and shared anchors canonical', () => {
  expect(CYRILLIC_ALPHABET).toHaveLength(28);
  expect(LATIN_ALPHABET).toHaveLength(26);
  expect(new Set(CYRILLIC_ALPHABET).size).toBe(CYRILLIC_ALPHABET.length);
  expect(new Set(LATIN_ALPHABET).size).toBe(LATIN_ALPHABET.length);
  expectTypeOf<CalloutAnchor>().toEqualTypeOf<StepBadgeAnchor>();
  expectTypeOf<CalloutSettings['content']>().toEqualTypeOf<{
    bodyHtml: string;
    titleText: string;
  }>();
  expectTypeOf<CalloutSettings['style']['connector']['kind']>().toEqualTypeOf<
    'none' | 'wedge' | 'line'
  >();
  expectTypeOf<CalloutPreset>().toMatchTypeOf<{
    id: string;
    name: string;
    style: CalloutSettings['style'];
  }>();
  expectTypeOf<CalloutManualPlacement>().toEqualTypeOf<{
    centerOffsetX: number;
    centerOffsetY: number;
  }>();
  expectTypeOf<StepBadgeSettings>().toMatchTypeOf<{ enabled: boolean; value: string }>();
  expectTypeOf<StepBadgeManualPlacement>().toEqualTypeOf<{
    position: number;
    side: 'top' | 'right' | 'bottom' | 'left';
  }>();
});

it('recognizes only canonical system step badge preset keys', () => {
  for (const key of SYSTEM_STEP_BADGE_PRESET_KEYS) {
    expect(isSystemStepBadgePresetKey(key)).toBe(true);
  }
  expect(isSystemStepBadgePresetKey('system-unknown')).toBe(false);
  expect(isSystemStepBadgePresetKey(null)).toBe(false);
});

it('recognizes only canonical system border preset keys', () => {
  for (const key of SYSTEM_BORDER_PRESET_KEYS) expect(isSystemBorderPresetKey(key)).toBe(true);
  expect(isSystemBorderPresetKey('system-unknown')).toBe(false);
  expect(isSystemBorderPresetKey(null)).toBe(false);
});

it('projects catalog presets into independent applied border snapshots', () => {
  const applied = projectBorderPresetToAppliedSettings(BORDER_PRESET);

  expect(applied).toEqual({
    ...cloneBorderVisualStyle(BORDER_PRESET),
    sourcePresetId: BORDER_PRESET.id,
    sourcePresetName: BORDER_PRESET.name,
  });
  expect(applied).not.toHaveProperty('id');
  expect(applied).not.toHaveProperty('name');
  expect(applied.padding).not.toBe(BORDER_PRESET.padding);
  expect(applied.fillPaint).not.toBe(BORDER_PRESET.fillPaint);
});

it('clears preset attribution on manual patches and clones nested padding', () => {
  const applied = projectBorderPresetToAppliedSettings(BORDER_PRESET);
  const manual = applyManualBorderStylePatch(applied, {
    width: 7,
    padding: { left: 12 },
  });
  const clone = cloneAppliedBorderSettings(manual);

  expect(manual).toMatchObject({ width: 7, padding: { top: 1, left: 12 } });
  expect(manual).not.toHaveProperty('sourcePresetId');
  expect(manual).not.toHaveProperty('sourcePresetName');
  expect(clone).toEqual(manual);
  expect(clone.padding).not.toBe(manual.padding);
  expect(manual.fillPaint).not.toBe(applied.fillPaint);
  expect(clone.fillPaint).not.toBe(manual.fillPaint);
  if (manual.fillPaint.kind === 'gradient' && applied.fillPaint.kind === 'gradient') {
    manual.fillPaint.gradient.stops[0]!.color = '#ff0000ff';
    expect(applied.fillPaint.gradient.stops[0]!.color).toBe('#000000ff');
  }
});

it('normalizes legacy catalog snapshots while preserving applied snapshots', () => {
  const legacy = normalizeAppliedBorderSettings(BORDER_PRESET);
  const applied = normalizeAppliedBorderSettings(legacy);

  expect(legacy.sourcePresetId).toBe(BORDER_PRESET.id);
  expect(legacy.sourcePresetName).toBe(BORDER_PRESET.name);
  expect(applied).toEqual(legacy);
  expect(applied.padding).not.toBe(legacy.padding);
});
