import { afterEach, expect, it, vi } from 'vitest';
import { clampInspectorWidth, INSPECTOR_MAX_WIDTH, INSPECTOR_MIN_WIDTH } from './inspector-resize';

afterEach(() => vi.unstubAllGlobals());

it('leaves room for effects and preview when the viewport narrows', () => {
  vi.stubGlobal('window', { innerWidth: 1100 });
  expect(clampInspectorWidth(520)).toBe(440);
  expect(clampInspectorWidth(320)).toBe(320);
  vi.stubGlobal('window', { innerWidth: 1600 });
  expect(clampInspectorWidth(520)).toBe(520);
});

it('keeps pointer and keyboard inspector widths inside production bounds', () => {
  expect(clampInspectorWidth(100)).toBe(INSPECTOR_MIN_WIDTH);
  expect(clampInspectorWidth(360)).toBe(360);
  expect(clampInspectorWidth(900)).toBe(INSPECTOR_MAX_WIDTH);
});
