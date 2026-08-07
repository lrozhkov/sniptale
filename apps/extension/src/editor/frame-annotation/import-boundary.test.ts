import { expect, it } from 'vitest';
import { assertValidFrameAnnotationsInCanvasJson } from './import-boundary';
import { createFrameAnnotationProxy } from './proxy';
import { CUSTOM_JSON_PROPS } from '../document/model/custom-json-props';

function canvasJson(object: Record<string, unknown>) {
  return JSON.stringify({ objects: [object] });
}

const validSnapshot = JSON.stringify({
  version: 1,
  id: 'frame-1',
  ordering: 0,
  x: 1,
  y: 2,
  width: 100,
  height: 80,
  effectMode: 'border',
});

function validProxy(overrides: Record<string, unknown> = {}) {
  const proxy = createFrameAnnotationProxy({
    frame: { id: 'frame-1', x: 1, y: 2, width: 100, height: 80, effectMode: 'border' },
    label: 'Frame 1',
    ordering: 0,
  });
  return {
    ...proxy.toObject([...CUSTOM_JSON_PROPS]),
    ...overrides,
  };
}

it('accepts valid versioned frame metadata', () => {
  expect(() =>
    assertValidFrameAnnotationsInCanvasJson(
      canvasJson(validProxy({ visible: false, sniptaleLocked: true }))
    )
  ).not.toThrow();
});

it('accepts the canonical serialized Fabric Rect proxy', () => {
  const proxy = createFrameAnnotationProxy({
    frame: { id: 'frame-serialized', x: 1, y: 2, width: 100, height: 80 },
    label: 'Frame serialized',
    ordering: 0,
  });
  expect(() =>
    assertValidFrameAnnotationsInCanvasJson(
      JSON.stringify({ objects: [proxy.toObject([...CUSTOM_JSON_PROPS])] })
    )
  ).not.toThrow();
});

it('keeps fractional snapshot metadata aligned with Fabric serialization precision', () => {
  const proxy = createFrameAnnotationProxy({
    frame: {
      id: 'frame-fractional',
      x: 1.234567,
      y: 2.345678,
      width: 100.456789,
      height: 80.567891,
    },
    label: 'Frame fractional',
    ordering: 0,
  });
  const serialized = JSON.stringify({ objects: [proxy.toObject([...CUSTOM_JSON_PROPS])] });

  expect(() => assertValidFrameAnnotationsInCanvasJson(serialized)).not.toThrow();
});

it.each([
  { type: 'Textbox' },
  { fill: '#ff0000' },
  { stroke: '#000000' },
  { opacity: 0.5 },
  { backgroundColor: '#ff0000' },
  { globalCompositeOperation: 'copy' },
  { angle: 5 },
  { skewX: 2 },
  { flipY: true },
  { clipPath: { type: 'Rect' } },
  { unexpectedRenderOwner: true },
  { sniptaleId: 'other-frame' },
  { sniptaleRole: 'background' },
  { visible: 'yes' },
])('rejects a noncanonical proxy invariant: %o', (override) => {
  expect(() => assertValidFrameAnnotationsInCanvasJson(canvasJson(validProxy(override)))).toThrow(
    'Invalid frame annotation metadata'
  );
});

it('rejects frame metadata nested inside Fabric groups or clip paths', () => {
  expect(() =>
    assertValidFrameAnnotationsInCanvasJson(canvasJson({ type: 'Group', objects: [validProxy()] }))
  ).toThrow('Invalid frame annotation metadata');
  expect(() =>
    assertValidFrameAnnotationsInCanvasJson(canvasJson({ type: 'Rect', clipPath: validProxy() }))
  ).toThrow('Invalid frame annotation metadata');
});

it('rejects unknown versions and metadata attached to an existing object type', () => {
  expect(() =>
    assertValidFrameAnnotationsInCanvasJson(
      canvasJson({
        sniptaleType: 'frame-annotation',
        sniptaleFrameAnnotationRevision: 1,
        sniptaleFrameAnnotationJson: validSnapshot.replace('"version":1', '"version":2'),
      })
    )
  ).toThrow('Invalid frame annotation metadata');
  expect(() =>
    assertValidFrameAnnotationsInCanvasJson(
      canvasJson({
        sniptaleType: 'text',
        sniptaleFrameAnnotationRevision: 1,
        sniptaleFrameAnnotationJson: validSnapshot,
      })
    )
  ).toThrow('Invalid frame annotation metadata');
});
