import { expect, it } from 'vitest';
import { clampInspectorWidth, INSPECTOR_MAX_WIDTH, INSPECTOR_MIN_WIDTH } from './inspector-resize';

it('keeps pointer and keyboard inspector widths inside production bounds', () => {
  expect(clampInspectorWidth(100)).toBe(INSPECTOR_MIN_WIDTH);
  expect(clampInspectorWidth(360)).toBe(360);
  expect(clampInspectorWidth(900)).toBe(INSPECTOR_MAX_WIDTH);
});
