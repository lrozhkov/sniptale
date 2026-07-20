import { expect, it } from 'vitest';

import { parseCaptureMetadataField } from './capture-metadata';

function createPointerRange() {
  return {
    start: { x: 1, y: 2 },
    end: { x: 5, y: 7 },
    minX: 1,
    minY: 2,
    maxX: 5,
    maxY: 7,
    distance: 9,
    durationMs: 240,
  };
}

function createScrollMetadata() {
  return {
    startX: 0,
    startY: 20,
    endX: 0,
    endY: 120,
    deltaX: 0,
    deltaY: 100,
  };
}

it('keeps already valid capture metadata intact', () => {
  const metadata = {
    pointerRange: {
      ...createPointerRange(),
      start: { x: 10, y: 12 },
      end: { x: 30, y: 32 },
      maxX: 30,
      maxY: 32,
      distance: 28,
      durationMs: 480,
    },
    scroll: {
      ...createScrollMetadata(),
      startY: 100,
      endY: 240,
      deltaY: 140,
    },
    trigger: 'keyboard-enter' as const,
  };

  expect(parseCaptureMetadataField(metadata)).toEqual(metadata);
});

it('falls back to empty pointer-up metadata when the field is not a record', () => {
  expect(parseCaptureMetadataField(null)).toEqual({
    pointerRange: null,
    scroll: null,
    trigger: 'pointer-up',
  });
});

it('parses legacy capture metadata records and drops malformed subfields', () => {
  expect(
    parseCaptureMetadataField({
      pointerRange: createPointerRange(),
      scroll: createScrollMetadata(),
      trigger: 'pointer-up',
    })
  ).toEqual({
    pointerRange: createPointerRange(),
    scroll: createScrollMetadata(),
    trigger: 'pointer-up',
  });

  expect(
    parseCaptureMetadataField({
      pointerRange: {
        start: { x: 1 },
        end: { x: 5, y: 7 },
        minX: 1,
        minY: 2,
        maxX: 5,
        maxY: 7,
        distance: 9,
        durationMs: 240,
      },
      scroll: {
        startX: 0,
        endX: 0,
      },
      trigger: 'unexpected',
    })
  ).toEqual({
    pointerRange: null,
    scroll: null,
    trigger: 'pointer-up',
  });
});

it('keeps a valid pointer range when only scroll metadata is malformed', () => {
  expect(
    parseCaptureMetadataField({
      pointerRange: createPointerRange(),
      scroll: {
        startX: 0,
        startY: 20,
        endX: 0,
      },
      trigger: 'keyboard-enter',
    })
  ).toEqual({
    pointerRange: createPointerRange(),
    scroll: null,
    trigger: 'keyboard-enter',
  });
});

it('drops pointer ranges with incomplete numeric fields even when points are valid', () => {
  expect(
    parseCaptureMetadataField({
      pointerRange: {
        start: { x: 1, y: 2 },
        end: { x: 5, y: 7 },
        minX: 1,
        minY: 2,
        maxX: 5,
        distance: 9,
        durationMs: 240,
      },
      scroll: createScrollMetadata(),
      trigger: 'pointer-up',
    })
  ).toEqual({
    pointerRange: null,
    scroll: createScrollMetadata(),
    trigger: 'pointer-up',
  });
});
