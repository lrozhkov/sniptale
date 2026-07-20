import { describe, expect, it } from 'vitest';

import {
  BORDER_SHADOW_HARD_INTENSITY,
  BORDER_SHADOW_SOFT_INTENSITY,
  formatBorderShadowIntensityValue,
  resolveBorderShadowVisual,
} from './shadow';

function registerZeroStateTest() {
  it('disables every render target when shadow intensity is zero', () => {
    expect(resolveBorderShadowVisual(0, '#112233')).toEqual({
      enabled: false,
      intensity: 0,
      fabric: null,
      frameBoxShadow: undefined,
      hoverBoxShadow: undefined,
      settingsPreviewBoxShadow: undefined,
      settingsRowBoxShadow: undefined,
      stepBadgeBoxShadow: undefined,
    });
  });
}

function registerSoftAnchorTest() {
  it('keeps the soft anchor stable while formatting intensity as N/100', () => {
    expect(formatBorderShadowIntensityValue(BORDER_SHADOW_SOFT_INTENSITY)).toBe('30/100');
    expect(resolveBorderShadowVisual(BORDER_SHADOW_SOFT_INTENSITY, '#112233')).toEqual({
      enabled: true,
      intensity: 30,
      fabric: {
        blur: 10,
        color: 'rgba(17, 34, 51, 0.25)',
        offsetX: 0,
        offsetY: 0,
      },
      frameBoxShadow: '0 0 15px color-mix(in srgb, #112233 32%, transparent)',
      hoverBoxShadow:
        '0 0 8px color-mix(in srgb, #112233 38%, transparent), ' +
        '0 0 16px color-mix(in srgb, #112233 18%, transparent)',
      settingsPreviewBoxShadow: '0 0 15px color-mix(in srgb, #112233 50%, transparent)',
      settingsRowBoxShadow: '0 0 6px color-mix(in srgb, #112233 40%, transparent)',
      stepBadgeBoxShadow: '0 0 10px color-mix(in srgb, #112233 40%, transparent)',
    });
  });
}

function registerHardAnchorTest() {
  it('makes the hard anchor clearly stronger than the soft anchor across all targets', () => {
    const soft = resolveBorderShadowVisual(BORDER_SHADOW_SOFT_INTENSITY, '#112233');
    const hard = resolveBorderShadowVisual(BORDER_SHADOW_HARD_INTENSITY, '#112233');

    expect(formatBorderShadowIntensityValue(BORDER_SHADOW_HARD_INTENSITY)).toBe('100/100');
    expect(hard).toEqual({
      enabled: true,
      intensity: 100,
      fabric: {
        blur: 16,
        color: 'rgba(17, 34, 51, 0.42)',
        offsetX: 0,
        offsetY: 2,
      },
      frameBoxShadow: '0 0 24px 4px color-mix(in srgb, #112233 52%, transparent)',
      hoverBoxShadow:
        '0 0 14px 2px color-mix(in srgb, #112233 60%, transparent), ' +
        '0 0 24px color-mix(in srgb, #112233 8%, transparent)',
      settingsPreviewBoxShadow: '0 0 22px 4px color-mix(in srgb, #112233 78%, transparent)',
      settingsRowBoxShadow: '0 0 9px 2px color-mix(in srgb, #112233 62%, transparent)',
      stepBadgeBoxShadow: '0 2px 16px color-mix(in srgb, #112233 64%, transparent)',
    });
    expect((hard.fabric?.blur ?? 0) > (soft.fabric?.blur ?? 0)).toBe(true);
    expect((hard.fabric?.offsetY ?? 0) > (soft.fabric?.offsetY ?? 0)).toBe(true);
  });
}

function registerDirectionTest() {
  it('preserves downward fabric offset by default and rotates it by angle', () => {
    const defaultShadow = resolveBorderShadowVisual(BORDER_SHADOW_HARD_INTENSITY, '#112233');
    const leftShadow = resolveBorderShadowVisual(BORDER_SHADOW_HARD_INTENSITY, '#112233', 180);

    expect(defaultShadow.fabric).toMatchObject({ offsetX: 0, offsetY: 2 });
    expect(leftShadow.fabric).toMatchObject({ offsetX: -2, offsetY: 0 });
  });
}

function registerShadowVisualSuite() {
  registerZeroStateTest();
  registerSoftAnchorTest();
  registerHardAnchorTest();
  registerDirectionTest();
}

describe('shared border shadow visual resolver', registerShadowVisualSuite);
