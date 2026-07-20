// @vitest-environment jsdom

import { expect, it } from 'vitest';
import type { EditorStepSettings } from '../../../features/editor/document/step-types';
import { createStepGroup } from './step/create';
import { updateStepGroup } from './step/update';

const baseStepSettings: EditorStepSettings = {
  alphabet: 'latin',
  color: '#ff671d',
  opacity: 1,
  sizeLevel: 3,
  strokeColor: '#f8fafc',
  strokeOpacity: 1,
  strokeWidth: 2,
  textColor: '#ffffff',
  type: 'number',
  value: '1',
};

function createStepSettings(overrides: Partial<EditorStepSettings>): EditorStepSettings {
  return { ...baseStepSettings, ...overrides };
}

it('keeps empty step values in object metadata', () => {
  const step = createStepGroup({
    id: 'step-empty',
    labelIndex: 1,
    left: 10,
    settings: createStepSettings({ value: '' }),
    top: 12,
  });

  expect(step.sniptaleStepValue).toBe('');
});

it('uses visual fallbacks for legacy or incomplete step settings', () => {
  const step = createStepGroup({
    id: 'step-legacy-style',
    labelIndex: 1,
    left: 10,
    settings: {
      ...baseStepSettings,
      opacity: Number.NaN,
      strokeColor: undefined,
      strokeOpacity: undefined,
      textColor: undefined,
      value: '',
    } as never,
    top: 12,
  });

  const [circle, text] = step.getObjects();

  expect(circle?.get('fill')).toBe('rgba(255, 103, 29, 1)');
  expect(circle?.get('stroke')).toBe('rgba(248, 250, 252, 1)');
  expect(text?.get('fill')).toBe('#ffffff');
  expect(text?.get('text')).toBe('1');
});

it('renders and persists text, shape, and stroke style settings', () => {
  const step = createStepGroup({
    id: 'step-style',
    labelIndex: 1,
    left: 10,
    settings: createStepSettings({
      color: '#ff671d',
      opacity: 0.5,
      strokeColor: '#111111',
      strokeOpacity: 0.75,
      strokeWidth: 3,
      textColor: '#fafafa',
      value: '7',
    }),
    top: 12,
  });

  const [circle, text] = step.getObjects();

  expect(step.sniptaleStepColor).toBe('#ff671d');
  expect(step.sniptaleStepOpacity).toBe(0.5);
  expect(step.sniptaleStepStrokeColor).toBe('#111111');
  expect(step.sniptaleStepStrokeOpacity).toBe(0.75);
  expect(step.sniptaleStepStrokeWidth).toBe(3);
  expect(step.sniptaleStepTextColor).toBe('#fafafa');
  expect(circle?.get('fill')).toBe('rgba(255, 103, 29, 0.5)');
  expect(circle?.get('stroke')).toBe('rgba(17, 17, 17, 0.75)');
  expect(circle?.get('strokeWidth')).toBe(3);
  expect(text?.get('fill')).toBe('#fafafa');
});

it('updates existing step groups with manual values and zero-width strokes', () => {
  const step = createStepGroup({
    id: 'step-update-style',
    labelIndex: 2,
    left: 10,
    settings: baseStepSettings,
    top: 12,
  });

  updateStepGroup(
    step,
    createStepSettings({
      color: '#222222',
      opacity: 0.25,
      strokeColor: '#333333',
      strokeOpacity: 0,
      strokeWidth: 0,
      textColor: '#444444',
      type: 'manual',
      value: 'QA',
    })
  );

  const [circle, text] = step.getObjects();

  expect(step.sniptaleStepType).toBe('manual');
  expect(step.sniptaleStepValue).toBe('QA');
  expect(circle?.get('fill')).toBe('rgba(34, 34, 34, 0.25)');
  expect(circle?.get('stroke')).toBe('rgba(51, 51, 51, 0)');
  expect(circle?.get('strokeWidth')).toBe(0);
  expect(text?.get('fill')).toBe('#444444');
  expect(text?.get('text')).toBe('QA');
});

it('uses update fallbacks for incomplete step text and stroke styles', () => {
  const step = createStepGroup({
    id: 'step-update-fallback-style',
    labelIndex: 2,
    left: 10,
    settings: baseStepSettings,
    top: 12,
  });

  const incompleteSettings = createStepSettings({ type: 'manual', value: '' });
  Reflect.deleteProperty(incompleteSettings, 'strokeColor');
  Reflect.deleteProperty(incompleteSettings, 'textColor');

  updateStepGroup(step, incompleteSettings);

  const [circle, text] = step.getObjects();

  expect(circle?.get('stroke')).toBe('rgba(248, 250, 252, 1)');
  expect(text?.get('fill')).toBe('#ffffff');
  expect(text?.get('text')).toBe('');
});
