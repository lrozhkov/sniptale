// @vitest-environment jsdom

import { expect, it, vi } from 'vitest';
import {
  getEditorViewportDevicePixelRatioBaseline,
  resolveEditorViewportScaleCompensation,
} from './';

it('prefers visual viewport scale and falls back to the device pixel ratio baseline', () => {
  vi.stubGlobal('devicePixelRatio', 0.5);
  vi.stubGlobal('visualViewport', { scale: 2 } as VisualViewport);

  expect(getEditorViewportDevicePixelRatioBaseline()).toBe(0.5);
  expect(resolveEditorViewportScaleCompensation(1)).toBe(0.5);

  vi.stubGlobal('visualViewport', undefined);

  expect(resolveEditorViewportScaleCompensation(1)).toBe(2);
});
