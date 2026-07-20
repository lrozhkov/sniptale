import { expect, it } from 'vitest';

import {
  isScenarioCaptureMetadata,
  isScenarioCaptureMode,
  isScenarioCaptureSourceKind,
  isScenarioCaptureSurface,
  isScenarioRecorderCaptureAction,
  isScenarioStringDataRecord,
} from './capture';

it('accepts only supported capture enums and recorder actions', () => {
  expect(isScenarioCaptureMode('manual')).toBe(true);
  expect(isScenarioCaptureMode('invalid')).toBe(false);
  expect(isScenarioCaptureSurface('full')).toBe(true);
  expect(isScenarioCaptureSurface('viewport')).toBe(false);
  expect(isScenarioCaptureSourceKind('auto-click')).toBe(true);
  expect(isScenarioCaptureSourceKind('keyboard')).toBe(false);
  expect(isScenarioRecorderCaptureAction('copy')).toBe(true);
  expect(isScenarioRecorderCaptureAction('download')).toBe(false);
});

it('validates scenario capture metadata and permissive primitive records', () => {
  expect(
    isScenarioCaptureMetadata({
      pointerRange: {
        distance: 8,
        durationMs: 120,
        end: { x: 3, y: 4 },
        maxX: 3,
        maxY: 4,
        minX: 1,
        minY: 2,
        start: { x: 1, y: 2 },
      },
      scroll: {
        deltaX: 0,
        deltaY: 120,
        endX: 10,
        endY: 140,
        startX: 10,
        startY: 20,
      },
      trigger: 'pointer-up',
    })
  ).toBe(true);
  expect(
    isScenarioCaptureMetadata({
      trigger: 'keyboard-enter',
    })
  ).toBe(true);
  expect(
    isScenarioCaptureMetadata({
      pointerRange: { start: { x: 1, y: 2 } },
      trigger: 'invalid',
    })
  ).toBe(false);

  expect(isScenarioStringDataRecord({ active: true, count: 2, label: 'value', note: null })).toBe(
    true
  );
  expect(isScenarioStringDataRecord({ bad: { nested: true } })).toBe(false);
});
