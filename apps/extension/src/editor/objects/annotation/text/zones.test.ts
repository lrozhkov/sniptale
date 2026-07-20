import { Point } from 'fabric';
import { describe, expect, it, vi } from 'vitest';

import { getTextCalloutInteractionLayout, resolveTextCalloutPointerZone } from './zones';

interface TestTextbox {
  angle?: number;
  findControl: ReturnType<typeof vi.fn>;
  getRelativeCenterPoint: () => Point;
  height: number;
  sniptaleTextCalloutFormat?: unknown;
  sniptaleTextCalloutHeight?: number;
  sniptaleTextCalloutWidth?: number;
  padding: number;
  translateToGivenOrigin: (
    point: Point,
    fromOriginX?: unknown,
    fromOriginY?: unknown,
    toOriginX?: unknown,
    toOriginY?: unknown
  ) => Point;
  width: number;
}

function createTextbox(overrides: Partial<TestTextbox> = {}): TestTextbox {
  return {
    angle: 0,
    findControl: vi.fn(() => undefined),
    getRelativeCenterPoint: () => new Point(100, 100),
    height: 44,
    sniptaleTextCalloutFormat: 'bubble',
    sniptaleTextCalloutHeight: 80,
    sniptaleTextCalloutWidth: 160,
    padding: 10,
    translateToGivenOrigin: vi.fn((point: Point) => new Point(point.x - 80, point.y - 40)),
    width: 124,
    ...overrides,
  };
}

function toScenePoint(textbox: TestTextbox, localPoint: { x: number; y: number }): Point {
  const topLeft = textbox.translateToGivenOrigin(
    textbox.getRelativeCenterPoint(),
    'center',
    'center',
    'left',
    'top'
  );

  return new Point(topLeft.x + localPoint.x, topLeft.y + localPoint.y);
}

function rotateAround(point: Point, center: Point, angle: number): Point {
  const radians = (angle * Math.PI) / 180;
  const deltaX = point.x - center.x;
  const deltaY = point.y - center.y;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);

  return new Point(
    center.x + deltaX * cosine - deltaY * sine,
    center.y + deltaX * sine + deltaY * cosine
  );
}

function registerLayoutTest() {
  it('keeps body and content zones aligned to the fixed callout body instead of centering the full surface', () => {
    const textbox = createTextbox();

    expect(getTextCalloutInteractionLayout(textbox as never)).toEqual({
      body: {
        height: 54,
        left: 8,
        top: 8,
        width: 144,
      },
      content: {
        height: 34,
        left: 18,
        top: 18,
        width: 124,
      },
      surface: {
        height: 80,
        left: 0,
        top: 0,
        width: 160,
      },
    });
  });
}

function registerPointerZoneResolutionTest() {
  it('resolves content, surface, and outside pointer zones from the surface-local geometry', () => {
    const textbox = createTextbox();
    const layout = getTextCalloutInteractionLayout(textbox as never);

    expect(
      resolveTextCalloutPointerZone({
        scenePoint: toScenePoint(textbox, {
          x: layout.content.left + 6,
          y: layout.content.top + 6,
        }),
        textbox: textbox as never,
      })
    ).toBe('content');

    expect(
      resolveTextCalloutPointerZone({
        scenePoint: toScenePoint(textbox, { x: 6, y: 6 }),
        textbox: textbox as never,
      })
    ).toBe('surface');

    expect(
      resolveTextCalloutPointerZone({
        scenePoint: toScenePoint(textbox, { x: -4, y: -4 }),
        textbox: textbox as never,
      })
    ).toBe('outside');
  });
}

function registerHandlePriorityTest() {
  it('gives resize handles priority when Fabric resolves a control hit', () => {
    const textbox = createTextbox({
      findControl: vi.fn(() => ({ key: 'br' })),
    });

    expect(
      resolveTextCalloutPointerZone({
        scenePoint: new Point(120, 120),
        textbox: textbox as never,
        viewportPoint: new Point(300, 240),
      })
    ).toBe('handle');
  });
}

function registerRotationMappingTest() {
  it('maps rotated scene points back into the local text surface before resolving zones', () => {
    const textbox = createTextbox({ angle: 90 });
    const layout = getTextCalloutInteractionLayout(textbox as never);
    const localTextPoint = toScenePoint(textbox, {
      x: layout.content.left + 8,
      y: layout.content.top + 8,
    });

    expect(
      resolveTextCalloutPointerZone({
        scenePoint: rotateAround(localTextPoint, textbox.getRelativeCenterPoint(), 90),
        textbox: textbox as never,
      })
    ).toBe('content');
  });
}

describe('text callout pointer zones', () => {
  registerLayoutTest();
  registerPointerZoneResolutionTest();
  registerHandlePriorityTest();
  registerRotationMappingTest();
});
