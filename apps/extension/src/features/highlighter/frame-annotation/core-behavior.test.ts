import { expect, it, vi } from 'vitest';
import type { CalloutAnchor } from '@sniptale/runtime-contracts/highlighter/callout';

import { createDefaultFrameCallout } from './defaults';
import {
  createScaledFrameAnnotationCoordinateSpace,
  domRectToFrameAnnotationRect,
  identityFrameAnnotationCoordinateSpace,
} from './coordinate-space';
import { createFrameCalloutActions } from './callout/actions';
import { getCalloutKeyboardDelta } from './callout/keyboard';
import { getPreferredSideFromAnchor } from './callout/geometry';

it('projects coordinates in both directions and safely normalizes an invalid scale', () => {
  const scaled = createScaledFrameAnnotationCoordinateSpace({
    origin: { x: 100, y: 50 },
    scale: 2,
    viewport: { width: 800, height: 600 },
  });
  expect(scaled.clientPointToLogical({ x: 140, y: 90 })).toEqual({ x: 20, y: 20 });
  expect(scaled.logicalPointToClient({ x: 20, y: 20 })).toEqual({ x: 140, y: 90 });
  expect(scaled.clientRectToLogical({ x: 120, y: 70, width: 80, height: 40 })).toEqual({
    x: 10,
    y: 10,
    width: 40,
    height: 20,
  });
  expect(scaled.logicalRectToClient({ x: 10, y: 10, width: 40, height: 20 })).toEqual({
    x: 120,
    y: 70,
    width: 80,
    height: 40,
  });
  const identity = createScaledFrameAnnotationCoordinateSpace({
    origin: { x: 0, y: 0 },
    scale: Number.NaN,
    viewport: { width: 1, height: 1 },
  });
  expect(identity.clientPointToLogical({ x: 3, y: 4 })).toEqual({ x: 3, y: 4 });
  expect(
    identityFrameAnnotationCoordinateSpace.logicalRectToClient({ x: 1, y: 2, width: 3, height: 4 })
  ).toEqual({
    x: 1,
    y: 2,
    width: 3,
    height: 4,
  });
  expect(domRectToFrameAnnotationRect({ left: 2, top: 3, width: 4, height: 5 } as DOMRect)).toEqual(
    {
      x: 2,
      y: 3,
      width: 4,
      height: 5,
    }
  );
});

it('updates every callout geometry and content field through one canonical settings authority', () => {
  const apply = vi.fn();
  const previewContent = vi.fn();
  const callout = createDefaultFrameCallout();
  const actions = createFrameCalloutActions({
    apply,
    previewContent,
    callout,
    onDelete: vi.fn(),
    onSettingsClick: vi.fn(),
    onStartEditing: vi.fn(),
    onStopEditing: vi.fn(),
  });
  actions.onContentChange('<b>Body</b>');
  actions.onTitleChange('Title');
  actions.onPositionChange(
    { centerOffsetX: 2, centerOffsetY: 3 },
    {
      connectorBasePosition: 0.2,
      connectorBaseWidth: 0.1,
      connectorFramePosition: 0.8,
      connectorWaypoint: { centerOffsetX: 0.5, centerOffsetY: 0.4 },
      translateConnectorGeometry: true,
    }
  );
  actions.onPositionChange(
    { centerOffsetX: 0, centerOffsetY: 0 },
    {
      connectorBasePosition: undefined,
      connectorBaseWidth: undefined,
      connectorFramePosition: undefined,
      connectorWaypoint: undefined,
      translateConnectorGeometry: false,
    }
  );
  actions.onTailBaseRangeChange(0.3, 0.2, { mode: 'auto' });
  actions.onTailBaseRangeChange(0.4, 0.1);
  actions.onTailFramePositionChange(0.7, { mode: 'auto' });
  actions.onTailFramePositionChange(0.8);
  actions.onWaypointChange({ centerOffsetX: 0.2, centerOffsetY: 0.3 });
  actions.onCurveChange({
    curvature: 0.4,
    endHandle: { x: 2, y: 3 },
    mode: 'manual',
    startHandle: { x: 1, y: 1 },
  });
  actions.onWidthChange(280, { centerOffsetX: 4, centerOffsetY: 5 });
  expect(previewContent).toHaveBeenCalledTimes(2);
  expect(apply).toHaveBeenCalledTimes(9);
  expect(apply).toHaveBeenCalledWith(
    expect.objectContaining({
      placement: expect.objectContaining({
        connectorAttachments: {
          block: { mode: 'free', perimeterPosition: 0.2 },
          frame: { mode: 'free', perimeterPosition: 0.8 },
        },
      }),
    })
  );

  const detachedCallout = createDefaultFrameCallout();
  delete detachedCallout.placement.connectorAttachments;
  const detachedApply = vi.fn();
  const detachedActions = createFrameCalloutActions({
    apply: detachedApply,
    callout: detachedCallout,
    onDelete: vi.fn(),
    onSettingsClick: vi.fn(),
    onStartEditing: vi.fn(),
    onStopEditing: vi.fn(),
  });
  detachedActions.onContentChange('Detached');
  detachedActions.onPositionChange(
    { centerOffsetX: 0, centerOffsetY: 0 },
    {
      connectorBasePosition: undefined,
      connectorBaseWidth: undefined,
      connectorFramePosition: undefined,
      connectorWaypoint: undefined,
      translateConnectorGeometry: true,
    }
  );
  detachedActions.onTailBaseRangeChange(0.1, 0.2);
  detachedActions.onTailFramePositionChange(0.3);
  expect(detachedApply).toHaveBeenCalledTimes(4);
});

it('falls back safely when a malformed imported callout anchor reaches the boundary', () => {
  expect(getPreferredSideFromAnchor('center' as CalloutAnchor)).toBeNull();
});

it('maps every supported keyboard direction with normal and accelerated steps', () => {
  const event = (key: string, shiftKey = false) => ({
    key,
    shiftKey,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  });
  expect(getCalloutKeyboardDelta(event('ArrowLeft'))).toEqual({ x: -5, y: 0 });
  expect(getCalloutKeyboardDelta(event('ArrowRight', true))).toEqual({ x: 10, y: 0 });
  expect(getCalloutKeyboardDelta(event('ArrowUp'))).toEqual({ x: 0, y: -5 });
  expect(getCalloutKeyboardDelta(event('ArrowDown', true))).toEqual({ x: 0, y: 10 });
  expect(getCalloutKeyboardDelta(event('Escape'))).toBeNull();
});
