import { describe, expect, it } from 'vitest';

import {
  clamp,
  isRectOverlay,
  moveArrowEndpointByStageDelta,
  moveOverlayByStageDelta,
  projectSourcePoint,
  projectSourceRect,
  resizeRectOverlayByStageDelta,
  unprojectStagePoint,
  updateOverlayPoint,
  zoomImageTransform,
} from './stage.helpers';

const layout = {
  imageRect: { x: 20, y: 30, width: 200, height: 100 },
  sourceViewport: { width: 1000, height: 500 },
} as never;

function createOverlayFixtures() {
  return {
    textOverlay: {
      id: 'overlay-1',
      kind: 'text',
      point: { x: 100, y: 100 },
      text: 'Text',
      color: '#000',
      fontSize: 12,
      fontFamily: 'system-ui',
      fontWeight: 400,
    } as never,
    arrowOverlay: {
      id: 'overlay-2',
      kind: 'arrow',
      start: { x: 10, y: 20 },
      end: { x: 30, y: 40 },
      color: '#f97316',
      strokeWidth: 4,
    } as never,
    rectOverlay: {
      id: 'overlay-3',
      kind: 'rectangle',
      rect: { x: 100, y: 50, width: 80, height: 60 },
      strokeColor: '#000',
      fillColor: 'transparent',
      strokeWidth: 2,
    } as never,
  };
}

function verifiesProjectionHelpers() {
  expect(clamp(15, 0, 10)).toBe(10);
  expect(projectSourcePoint(layout, { x: 100, y: 50 })).toEqual({ x: 40, y: 40 });
  expect(unprojectStagePoint(layout, { x: 40, y: 40 })).toEqual({ x: 100, y: 50 });
  expect(projectSourceRect(layout, { x: 50, y: 25, width: 200, height: 100 })).toEqual({
    x: 30,
    y: 35,
    width: 40,
    height: 20,
  });
}

function verifiesOverlayMovementHelpers() {
  const { textOverlay, arrowOverlay, rectOverlay } = createOverlayFixtures();

  expect(isRectOverlay(rectOverlay)).toBe(true);
  expect(updateOverlayPoint(textOverlay, { x: 5, y: 6 })).toEqual(
    expect.objectContaining({
      point: { x: 5, y: 6 },
    })
  );
  expect(moveOverlayByStageDelta(layout, textOverlay, 20, 10)).toEqual(
    expect.objectContaining({
      point: { x: 200, y: 150 },
    })
  );
  expect(moveOverlayByStageDelta(layout, arrowOverlay, 20, 10)).toEqual(
    expect.objectContaining({
      start: { x: 110, y: 70 },
      end: { x: 130, y: 90 },
    })
  );
  expect(moveOverlayByStageDelta(layout, rectOverlay, 20, 10)).toEqual(
    expect.objectContaining({
      rect: expect.objectContaining({ x: 200, y: 100 }),
    })
  );
  expect(resizeRectOverlayByStageDelta(layout, rectOverlay, 'nw', 40, 20)).toEqual(
    expect.objectContaining({
      rect: expect.objectContaining({ width: 24, height: 24 }),
    })
  );
  expect(moveArrowEndpointByStageDelta(layout, arrowOverlay, 'end', 20, 10)).toEqual(
    expect.objectContaining({
      end: { x: 130, y: 90 },
    })
  );
}

function verifiesZoomLimits() {
  expect(
    zoomImageTransform(
      {
        imageTransform: { x: 0, y: 0, scale: 0.45 },
      } as never,
      -0.2
    )
  ).toEqual({ x: 0, y: 0, scale: 0.4 });
  expect(
    zoomImageTransform(
      {
        imageTransform: { x: 0, y: 0, scale: 2.95 },
      } as never,
      0.2
    )
  ).toEqual({ x: 0, y: 0, scale: 3 });
}

function verifiesArrowEndpointOverlap() {
  const { arrowOverlay } = createOverlayFixtures();

  expect(moveArrowEndpointByStageDelta(layout, arrowOverlay, 'end', -4, -4)).toEqual(
    expect.objectContaining({
      end: { x: 10, y: 20 },
    })
  );
}

function runScenarioQuickEditStageHelpersSuite() {
  it('projects and unprojects stage coordinates', verifiesProjectionHelpers);
  it('moves and resizes overlays on the stage', verifiesOverlayMovementHelpers);
  it(
    'lets arrow endpoints converge without clamping or cached direction state',
    verifiesArrowEndpointOverlap
  );
  it('zooms image transforms within hard limits', verifiesZoomLimits);
}

describe('scenario quick-edit stage helpers', runScenarioQuickEditStageHelpersSuite);
