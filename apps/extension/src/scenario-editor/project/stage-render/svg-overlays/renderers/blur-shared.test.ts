import { expect, it } from 'vitest';
import {
  getScenarioBlurDisplacementScale,
  getScenarioBlurFill,
  resolveScenarioBlurSettings,
} from './blur-shared';

it('resolves blur settings with canonical defaults', () => {
  expect(resolveScenarioBlurSettings({ amount: 8, blurType: 'gaussian' })).toEqual({
    amount: 8,
    blurType: 'gaussian',
    borderPresetId: null,
    radius: 0,
    shadow: 0,
    showBorder: false,
    strokeColor: '#475569',
    strokeOpacity: 1,
    strokeStyle: 'solid',
    strokeWidth: 0,
  });
});

it('maps solid and distortion blur settings to shared renderer values', () => {
  expect(
    getScenarioBlurFill({
      amount: 10,
      blurType: 'solid',
      showBorder: false,
    })
  ).toBe('rgb(0 0 0 / 0.333)');
  expect(getScenarioBlurFill({ amount: 24, blurType: 'solid', showBorder: false })).toBe(
    'rgb(0 0 0 / 0.800)'
  );
  expect(
    getScenarioBlurDisplacementScale({
      amount: 12,
      blurType: 'distortion',
      showBorder: true,
    })
  ).toBe('18.000');
});
