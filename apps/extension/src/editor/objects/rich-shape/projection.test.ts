// @vitest-environment jsdom

import { expect, it } from 'vitest';
import { createDefaultRichShapeObject } from '../../../features/editor/document/rich-shape';
import { createRichShapeObject } from './';

function createRectangleShape() {
  return createDefaultRichShapeObject({
    frame: { height: 120, left: 0, top: 0, width: 160 },
    shapeKind: 'rectangle',
    source: {
      formatVersion: '1',
      importedAt: null,
      itemId: 'rectangle',
      libraryId: null,
      name: 'Rectangle',
      type: 'built-in',
    },
  });
}

it('projects gradient fill, shape text, and reflection into the same Fabric group', () => {
  const object = createRichShapeObject(
    createDefaultRichShapeObject({
      ...createRectangleShape(),
      effects: {
        ...createDefaultRichShapeObject().effects,
        reflection: { enabled: true, opacity: 0.35, distance: 6, size: 0.5 },
      },
      frame: { height: 100, left: 0, top: 0, width: 160 },
      style: {
        ...createDefaultRichShapeObject().style,
        fill: {
          type: 'gradient',
          gradientType: 'linear',
          angle: 90,
          stops: [
            { color: '#ffffff', offset: 0, transparency: 0 },
            { color: '#000000', offset: 1, transparency: 0 },
          ],
        },
      },
      text: { ...createDefaultRichShapeObject().text, content: 'Shape label' },
    })
  );
  const children = object?.getObjects() ?? [];

  expect(children.length).toBeGreaterThan(2);
  expect(children.some((child) => 'text' in child && child.text === 'Shape label')).toBe(true);
  expect(children.some((child) => child.flipY === true && child.opacity === 0.35)).toBe(true);
});

it('keeps rough geometry and gradient backfill aligned in one local group', () => {
  const object = createRichShapeObject(
    createDefaultRichShapeObject({
      ...createRectangleShape(),
      rough: { ...createDefaultRichShapeObject().rough, enabled: true },
      style: {
        ...createDefaultRichShapeObject().style,
        fill: {
          type: 'gradient',
          gradientType: 'linear',
          angle: 45,
          stops: [
            { color: '#ffffff', offset: 0, transparency: 0 },
            { color: '#111111', offset: 1, transparency: 0 },
          ],
        },
      },
    })
  );
  const children = object?.getObjects() ?? [];

  expect(children.length).toBeGreaterThan(2);
  expect(children.some((child) => child.fill && typeof child.fill !== 'string')).toBe(true);
});

it('projects rough solid paths without adding a gradient backfill layer', () => {
  const object = createRichShapeObject(
    createDefaultRichShapeObject({
      ...createRectangleShape(),
      rough: { ...createDefaultRichShapeObject().rough, enabled: true },
      style: {
        ...createDefaultRichShapeObject().style,
        fill: { type: 'solid', color: '#f8fafc' },
      },
    })
  );
  const children = object?.getObjects() ?? [];

  expect(children.some((child) => child.fill && typeof child.fill !== 'string')).toBe(false);
  expect(children.length).toBeGreaterThan(2);
});

it('skips reflection children when the reflection effect is disabled', () => {
  const object = createRichShapeObject(
    createDefaultRichShapeObject({
      ...createRectangleShape(),
      effects: {
        ...createDefaultRichShapeObject().effects,
        reflection: { enabled: false, opacity: 0.35, distance: 0, size: 0.25 },
      },
    })
  );

  expect(object?.getObjects().some((child) => child.flipY === true)).toBe(false);
});

it('normalizes legacy reflection percentages while projecting reflected objects', () => {
  const object = createRichShapeObject(
    createDefaultRichShapeObject({
      ...createRectangleShape(),
      effects: {
        ...createDefaultRichShapeObject().effects,
        reflection: { enabled: true, opacity: 2, distance: -4, size: 25 },
      },
    })
  );
  const reflection = object?.getObjects().find((child) => child.flipY === true);

  expect(reflection?.opacity).toBe(1);
  expect(reflection?.top).toBe(30);
});

it('keeps reflection fade on the far edge instead of the edge nearest to the shape', () => {
  const object = createRichShapeObject(
    createDefaultRichShapeObject({
      ...createRectangleShape(),
      effects: {
        ...createDefaultRichShapeObject().effects,
        reflection: { enabled: true, opacity: 0.5, distance: 0, size: 0.25 },
      },
      style: {
        ...createDefaultRichShapeObject().style,
        fill: { type: 'solid', color: '#ff6600' },
        fillTransparency: 0,
      },
    })
  );
  const reflectionFill = object
    ?.getObjects()
    .find((child) => child.flipY === true && typeof child.fill !== 'string')?.fill as
    | { colorStops?: { offset: number; color: string }[] }
    | undefined;

  expect(reflectionFill?.colorStops?.map((stop) => stop.offset)).toEqual([0, 0.75, 1]);
  expect(reflectionFill?.colorStops?.map((stop) => stop.color)).toEqual([
    'rgba(255, 102, 0, 1)',
    'rgba(255, 102, 0, 1)',
    'rgba(255, 102, 0, 0)',
  ]);
});

it('aligns rich-shape text vertically inside the shape frame', () => {
  const shape = createDefaultRichShapeObject({
    ...createRectangleShape(),
    text: {
      ...createDefaultRichShapeObject().text,
      content: 'Aligned',
      insets: { bottom: 10, left: 8, right: 8, top: 10 },
    },
  });

  const middle = createRichShapeObject({
    ...shape,
    text: { ...shape.text, verticalAlign: 'middle' },
  });
  const bottom = createRichShapeObject({
    ...shape,
    text: { ...shape.text, verticalAlign: 'bottom' },
  });
  const middleText = middle?.getObjects().find((child) => 'text' in child);
  const bottomText = bottom?.getObjects().find((child) => 'text' in child);
  const top = createRichShapeObject({ ...shape, text: { ...shape.text, verticalAlign: 'top' } });
  const empty = createRichShapeObject({ ...shape, text: { ...shape.text, content: '   ' } });
  const topText = top?.getObjects().find((child) => 'text' in child);

  expect(middleText?.top).toBeGreaterThan(topText?.top ?? Number.NEGATIVE_INFINITY);
  expect(bottomText?.top).toBeGreaterThan(middleText?.top ?? 0);
  expect(topText).toEqual(expect.objectContaining({ text: 'Aligned' }));
  expect(empty?.getObjects().some((child) => 'text' in child)).toBe(false);
});
