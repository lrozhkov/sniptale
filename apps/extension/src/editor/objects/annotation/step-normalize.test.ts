// @vitest-environment jsdom

import { expect, it } from 'vitest';
import type { EditorStepSettings } from '../../../features/editor/document/step-types';
import { createStepGroup } from './step/create';
import { normalizeScaledStepGroup } from './step-normalize';

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

it('normalizes scaled step groups without leaving stretched text transforms behind', () => {
  const step = createStepGroup({
    id: 'step-scaled',
    labelIndex: 4,
    left: 20,
    settings: { ...baseStepSettings, value: '4' },
    top: 24,
  });

  step.set({ scaleX: 2, scaleY: 1.5 });

  expect(normalizeScaledStepGroup(step)).toBe(true);
  expect(step.scaleX).toBe(1);
  expect(step.scaleY).toBe(1);

  const [circle, text] = step.getObjects();
  expect(circle?.get('strokeUniform')).toBe(true);
  expect(text?.get('scaleX')).toBe(1);
  expect(text?.get('scaleY')).toBe(1);
  expect((text?.get('fontSize') as number) ?? 0).toBeGreaterThan(17);
});

it('rejects incomplete step group shapes before mutating geometry', () => {
  expect(normalizeScaledStepGroup({} as never)).toBe(false);
  expect(normalizeScaledStepGroup({ getObjects: () => [] } as never)).toBe(false);
});

it('normalizes lightweight step-like objects without Fabric setters', () => {
  const circle = { radius: 10, strokeUniform: false };
  const text = { fontSize: 12, scaleX: 2, scaleY: 3, top: 2, width: 20 };
  const group = {
    dirty: false,
    getObjects: () => [circle, text],
    scaleX: 2,
    scaleY: 3,
    setCoords: () => undefined,
  };

  expect(normalizeScaledStepGroup(group as never)).toBe(true);
  expect(circle.strokeUniform).toBe(true);
  expect(group.scaleX).toBe(1);
  expect(group.scaleY).toBe(1);
  expect(text.scaleX).toBe(1);
  expect(text.scaleY).toBe(1);
  expect(group.dirty).toBe(true);
});
