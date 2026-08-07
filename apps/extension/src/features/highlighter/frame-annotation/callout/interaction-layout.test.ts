import { expect, it } from 'vitest';
import { createDefaultCalloutSettings } from './model';
import { getCalloutLayoutState } from './layout';
import { getStationaryConnectorWaypoint, getTranslatedConnectorGeometry } from './drag-anchor';
import { getCalloutSectionAnchorGuides } from './interaction-layout';

it('derives title center, divider, and body center guides from rendered sections', () => {
  expect(
    getCalloutSectionAnchorGuides(
      { x: 100, y: 50, width: 200, height: 120 },
      { x: 100, y: 50, width: 200, height: 40 }
    )
  ).toEqual([70, 90, 130]);
  expect(
    getCalloutSectionAnchorGuides(
      { x: 0, y: 50, width: 100, height: 20 },
      { x: 0, y: 0, width: 100, height: 10 }
    )
  ).toEqual([]);
});

it('materializes an automatic polyline corner so ordinary movement cannot reroute it', () => {
  const frameRect = { x: 100, y: 100, width: 120, height: 80 };
  const settings = createDefaultCalloutSettings();
  settings.style.connector.kind = 'line';
  settings.style.connector.routing = 'polyline';
  settings.placement.manualPlacement = { centerOffsetX: 0, centerOffsetY: -100 };
  settings.placement.connectorBasePosition = 144 / 336;
  settings.placement.connectorFramePosition = 80 / 400;
  settings.placement.connectorAttachments = {
    block: { mode: 'free', perimeterPosition: 144 / 336 },
    frame: { mode: 'free', perimeterPosition: 80 / 400 },
  };
  const layout = getCalloutLayoutState({
    dimensions: { width: 160, height: 60 },
    frameRect,
    isEditing: false,
    settings,
    zIndex: 20,
  });
  if (layout.dynamicTail?.kind !== 'line' || !layout.dynamicTail.routeControlPoint) {
    throw new Error('Expected a polyline control point');
  }

  expect(getStationaryConnectorWaypoint(layout, frameRect, undefined)).toEqual({
    centerOffsetX: layout.dynamicTail.routeControlPoint.x - 160,
    centerOffsetY: layout.dynamicTail.routeControlPoint.y - 140,
  });
});

it('moves the callout endpoint with the comment during Ctrl movement', () => {
  const frameRect = { x: 100, y: 100, width: 120, height: 80 };
  const dimensions = { width: 160, height: 60 };
  const settings = createDefaultCalloutSettings();
  settings.style.connector.kind = 'line';
  settings.placement.manualPlacement = { centerOffsetX: 0, centerOffsetY: -100 };
  const currentLayout = getCalloutLayoutState({
    dimensions,
    frameRect,
    isEditing: false,
    settings,
    zIndex: 20,
  });
  const nextSettings = {
    ...settings,
    placement: {
      ...settings.placement,
      manualPlacement: { centerOffsetX: 30, centerOffsetY: -100 },
    },
  };
  const provisionalLayout = getCalloutLayoutState({
    dimensions,
    frameRect,
    isEditing: false,
    ...(currentLayout.dynamicTail ? { previousConnectorSide: currentLayout.dynamicTail.side } : {}),
    settings: nextSettings,
    zIndex: 20,
  });
  const connectorAnchors = getTranslatedConnectorGeometry(
    currentLayout,
    provisionalLayout,
    frameRect,
    undefined
  );
  const preservedLayout = getCalloutLayoutState({
    dimensions,
    frameRect,
    isEditing: false,
    ...(currentLayout.dynamicTail ? { previousConnectorSide: currentLayout.dynamicTail.side } : {}),
    settings: {
      ...nextSettings,
      placement: { ...nextSettings.placement, ...connectorAnchors },
    },
    zIndex: 20,
  });

  if (currentLayout.dynamicTail?.kind !== 'line' || preservedLayout.dynamicTail?.kind !== 'line') {
    throw new Error('Expected line connector layouts');
  }
  expect(preservedLayout.dynamicTail.attachment.bubbleEdgePoint.x).toBeCloseTo(
    currentLayout.dynamicTail.attachment.bubbleEdgePoint.x + 30
  );
  expect(preservedLayout.dynamicTail.attachment.bubbleEdgePoint.y).toBeCloseTo(
    currentLayout.dynamicTail.attachment.bubbleEdgePoint.y
  );
});

it('moves the frame endpoint along its perimeter during Ctrl movement', () => {
  const frameRect = { x: 100, y: 100, width: 120, height: 80 };
  const dimensions = { width: 160, height: 60 };
  const settings = createDefaultCalloutSettings();
  settings.style.connector.kind = 'line';
  settings.placement.manualPlacement = { centerOffsetX: 0, centerOffsetY: -100 };
  const currentLayout = getCalloutLayoutState({
    dimensions,
    frameRect,
    isEditing: false,
    settings,
    zIndex: 20,
  });
  const nextSettings = {
    ...settings,
    placement: {
      ...settings.placement,
      manualPlacement: { centerOffsetX: 50, centerOffsetY: -100 },
    },
  };
  const provisionalLayout = getCalloutLayoutState({
    dimensions,
    frameRect,
    isEditing: false,
    ...(currentLayout.dynamicTail ? { previousConnectorSide: currentLayout.dynamicTail.side } : {}),
    settings: nextSettings,
    zIndex: 20,
  });
  const connectorAnchors = getTranslatedConnectorGeometry(
    currentLayout,
    provisionalLayout,
    frameRect,
    undefined
  );
  const preservedLayout = getCalloutLayoutState({
    dimensions,
    frameRect,
    isEditing: false,
    ...(currentLayout.dynamicTail ? { previousConnectorSide: currentLayout.dynamicTail.side } : {}),
    settings: {
      ...nextSettings,
      placement: { ...nextSettings.placement, ...connectorAnchors },
    },
    zIndex: 20,
  });

  if (currentLayout.dynamicTail?.kind !== 'line' || preservedLayout.dynamicTail?.kind !== 'line') {
    throw new Error('Expected line connector layouts');
  }
  expect(preservedLayout.dynamicTail.attachment.framePoint.x).toBeCloseTo(
    currentLayout.dynamicTail.attachment.framePoint.x + 50
  );
  expect(preservedLayout.dynamicTail.attachment.framePoint.y).toBeCloseTo(
    currentLayout.dynamicTail.attachment.framePoint.y
  );
});

it('moves wedge endpoints and preserves its base width during Ctrl movement', () => {
  const frameRect = { x: 100, y: 100, width: 120, height: 80 };
  const dimensions = { width: 160, height: 60 };
  const settings = createDefaultCalloutSettings();
  settings.placement.manualPlacement = { centerOffsetX: 0, centerOffsetY: -100 };
  const currentLayout = getCalloutLayoutState({
    dimensions,
    frameRect,
    isEditing: false,
    settings,
    zIndex: 20,
  });
  const nextSettings = {
    ...settings,
    placement: {
      ...settings.placement,
      manualPlacement: { centerOffsetX: 30, centerOffsetY: -100 },
    },
  };
  const provisionalLayout = getCalloutLayoutState({
    dimensions,
    frameRect,
    isEditing: false,
    ...(currentLayout.dynamicTail ? { previousConnectorSide: currentLayout.dynamicTail.side } : {}),
    settings: nextSettings,
    zIndex: 20,
  });
  const connectorAnchors = getTranslatedConnectorGeometry(
    currentLayout,
    provisionalLayout,
    frameRect,
    undefined
  );
  const preservedLayout = getCalloutLayoutState({
    dimensions,
    frameRect,
    isEditing: false,
    ...(currentLayout.dynamicTail ? { previousConnectorSide: currentLayout.dynamicTail.side } : {}),
    settings: {
      ...nextSettings,
      placement: { ...nextSettings.placement, ...connectorAnchors },
    },
    zIndex: 20,
  });

  if (
    currentLayout.dynamicTail?.kind !== 'wedge' ||
    preservedLayout.dynamicTail?.kind !== 'wedge'
  ) {
    throw new Error('Expected wedge connector layouts');
  }
  const getBaseSpan = (layout: typeof currentLayout) => {
    const tail = layout.dynamicTail;
    if (tail?.kind !== 'wedge') throw new Error('Expected wedge connector layout');
    return Math.hypot(
      tail.attachment.baseEdgeB.x - tail.attachment.baseEdgeA.x,
      tail.attachment.baseEdgeB.y - tail.attachment.baseEdgeA.y
    );
  };
  expect(preservedLayout.dynamicTail.attachment.framePoint.x).toBeCloseTo(
    currentLayout.dynamicTail.attachment.framePoint.x + 30
  );
  expect(getBaseSpan(preservedLayout)).toBeCloseTo(getBaseSpan(currentLayout));
});

it('moves a polyline route point by the same delta as the comment during Ctrl movement', () => {
  const frameRect = { x: 100, y: 100, width: 120, height: 80 };
  const dimensions = { width: 160, height: 60 };
  const settings = createDefaultCalloutSettings();
  settings.style.connector.kind = 'line';
  settings.style.connector.routing = 'polyline';
  settings.placement.manualPlacement = { centerOffsetX: 0, centerOffsetY: -100 };
  settings.placement.connectorWaypoint = { centerOffsetX: 20, centerOffsetY: -140 };
  const currentLayout = getCalloutLayoutState({
    dimensions,
    frameRect,
    isEditing: false,
    settings,
    zIndex: 20,
  });
  const nextSettings = {
    ...settings,
    placement: {
      ...settings.placement,
      manualPlacement: { centerOffsetX: 35, centerOffsetY: -80 },
    },
  };
  const nextLayout = getCalloutLayoutState({
    dimensions,
    frameRect,
    isEditing: false,
    ...(currentLayout.dynamicTail ? { previousConnectorSide: currentLayout.dynamicTail.side } : {}),
    settings: nextSettings,
    zIndex: 20,
  });

  const geometry = getTranslatedConnectorGeometry(
    currentLayout,
    nextLayout,
    frameRect,
    settings.placement.connectorWaypoint
  );

  expect(geometry.connectorWaypoint).toEqual({ centerOffsetX: 55, centerOffsetY: -120 });
});
