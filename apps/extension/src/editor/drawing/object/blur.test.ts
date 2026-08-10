// @vitest-environment jsdom

import { Canvas, Rect } from 'fabric';
import { expect, it, vi } from 'vitest';
import type { SourceState } from '../../document/model/source-state';
import { createTypedTestFixture } from '../../testing/fabric-canvas.test-support';

vi.mock('../../objects/annotation/blur/object', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/annotation/blur/object')>()),
  createBlurObject: vi.fn(
    (args: { height: number; left: number; top: number; width: number }) => new Rect(args)
  ),
  updateBlurObject: vi.fn(),
}));

import { createEditorDrawingBlurObject } from './blur';
import { canonicalizeModifiedEditorDrawingSelection } from './canonicalize';
import { readEditorDrawingObject } from './metadata';

it('reconstructs rotated blur geometry around the shared bounds center', () => {
  const object = createEditorDrawingBlurObject({
    drawing: {
      bounds: { height: 40, width: 100, x: 80, y: 60 },
      id: 'blur-1',
      kind: 'blur',
      rotation: 30,
    },
    labelIndex: 1,
    source: createTypedTestFixture<SourceState>({}),
  });

  expect(object.getCenterPoint()).toMatchObject({ x: 130, y: 80 });
  expect(object.angle).toBe(30);
});

it('canonicalizes combined blur move-scale-rotate without legacy bounding-box inflation', () => {
  const source = createTypedTestFixture<SourceState>({});
  const object = createEditorDrawingBlurObject({
    drawing: {
      bounds: { height: 40, width: 100, x: 80, y: 60 },
      id: 'blur-1',
      kind: 'blur',
      rotation: 20,
    },
    labelIndex: 1,
    source,
  });
  const canvas = new Canvas(document.createElement('canvas'));
  canvas.add(object);
  object.set({ angle: 35, left: 150, scaleX: 1.5, scaleY: 2, top: 120 });
  object.setCoords();

  const [replacement] =
    canonicalizeModifiedEditorDrawingSelection({
      canvas,
      object,
      prepareObject: () => undefined,
      source,
    }) ?? [];

  expect(replacement?.getCenterPoint()).toMatchObject({ x: 150, y: 120 });
  expect(readEditorDrawingObject(replacement!)).toMatchObject({
    bounds: { height: 80, width: 150, x: 75, y: 80 },
    rotation: 35,
  });
});
