// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { renderCalloutInteractionHandles, type CalloutInteractionHandleProps } from './handles';

function createProps(
  overrides: Partial<CalloutInteractionHandleProps> = {}
): CalloutInteractionHandleProps {
  return {
    frameId: 'frame-1',
    dragHandleStyle: { left: 100, top: 100 },
    handleDragPointerDown: vi.fn(),
    handleDragKeyDown: vi.fn(),
    handleHandleBlur: vi.fn(),
    handleHandleFocus: vi.fn(),
    handleMouseEnter: vi.fn(),
    handleMouseLeave: vi.fn(),
    handleResizeLeftKeyDown: vi.fn(),
    handleResizeLeftPointerDown: vi.fn(),
    handleResizeRightKeyDown: vi.fn(),
    handleResizeRightPointerDown: vi.fn(),
    handleSettingsClick: vi.fn(),
    handleTailPointerDown: vi.fn(),
    handleTailKeyDown: vi.fn(),
    handleTailBaseEndPointerDown: vi.fn(),
    handleTailBaseEndKeyDown: vi.fn(),
    handleTailFramePointerDown: vi.fn(),
    handleTailFrameKeyDown: vi.fn(),
    handleWaypointPointerDown: vi.fn(),
    handleWaypointKeyDown: vi.fn(),
    handleWaypointDoubleClick: vi.fn(),
    hasWaypoint: false,
    isDragging: false,
    isEditing: false,
    isGeometryHandleHidden: false,
    isWidthResizeHandleHidden: false,
    isHandleVisible: true,
    isResizingLeft: false,
    isResizingRight: false,
    isTailDragging: false,
    isTailBaseEndDragging: false,
    isTailFrameDragging: false,
    isWaypointDragging: false,
    isPolylineWaypoint: false,
    portalTheme: null,
    settingsAnchorRef: { current: null },
    settingsHandleStyle: { left: 124, top: 100 },
    showSettingsHandle: true,
    resizeLeftHandleStyle: { left: 94, top: 120 },
    resizeRightHandleStyle: { left: 194, top: 120 },
    tailHandleCursor: 'ew-resize',
    tailHandleStyle: { left: 120, top: 140 },
    tailBaseEndHandleStyle: { left: 140, top: 140 },
    tailFrameHandleStyle: { left: 160, top: 180 },
    waypointHandleStyle: { left: 150, top: 150 },
    waypointAngle: null,
    waypointAngleStyle: null,
    ...overrides,
  };
}

describe('callout interaction handles', () => {
  it('renders the comment grip and boundary-constrained tail point', () => {
    const markup = renderToStaticMarkup(renderCalloutInteractionHandles(createProps()));

    expect(markup).toContain('sniptale-callout-adjacent-controls');
    expect(markup).toContain('sniptale-callout-drag-handle');
    expect(markup).toContain('sniptale-callout-settings-handle');
    expect(markup).toContain('sniptale-callout-tail-handle');
    expect(markup).toContain('sniptale-callout-tail-base-start-handle');
    expect(markup).toContain('sniptale-callout-tail-base-end-handle');
    expect(markup).toContain('sniptale-callout-tail-frame-handle');
    expect(markup).toContain('sniptale-callout-waypoint-handle');
    expect(markup).toContain('lucide-plus');
    expect(markup).toContain('cursor:ew-resize');
    expect(markup).toContain('background:#ffffff');
    expect(markup).toContain('width:26px;height:26px');
    expect(markup).toContain('Shift');
    expect(markup).toContain('Ctrl');
  });

  it('turns the add-route-point affordance into a plain drag handle after activation', () => {
    const markup = renderToStaticMarkup(
      renderCalloutInteractionHandles(createProps({ hasWaypoint: true }))
    );

    expect(markup).toContain('sniptale-callout-waypoint-handle');
    expect(markup).not.toContain('lucide-plus');
  });

  it('renders a diamond control and a compact angle readout while an angled route is dragged', () => {
    const markup = renderToStaticMarkup(
      renderCalloutInteractionHandles(
        createProps({
          isPolylineWaypoint: true,
          isWaypointDragging: true,
          waypointAngle: 45,
          waypointAngleStyle: { left: 170, top: 120 },
        })
      )
    );

    expect(markup).toContain('transform:rotate(45deg)');
    expect(markup).toContain('45°');
    expect(markup).not.toContain('lucide-plus');
  });

  it('renders left and right transient width handles on the exact cloud edges', () => {
    const markup = renderToStaticMarkup(renderCalloutInteractionHandles(createProps()));

    expect(markup).toContain(
      'sniptale-callout-tail-handle sniptale-callout-resize-handle sniptale-callout-resize-handle--left'
    );
    expect(markup).toContain(
      'sniptale-callout-tail-handle sniptale-callout-resize-handle sniptale-callout-resize-handle--right'
    );
    expect(markup).toContain('left:94px;top:120px');
    expect(markup).toContain('left:194px;top:120px');
    expect(markup).toContain('cursor:ew-resize');
  });

  it('hides both transient handles while text is being edited', () => {
    const markup = renderToStaticMarkup(
      renderCalloutInteractionHandles(createProps({ isEditing: true }))
    );

    expect(markup).toBe('');
  });

  it('keeps movement controls but hides quick settings while a main toolbar is open', () => {
    const markup = renderToStaticMarkup(
      renderCalloutInteractionHandles(createProps({ showSettingsHandle: false }))
    );

    expect(markup).toContain('sniptale-callout-drag-handle');
    expect(markup).not.toContain('sniptale-callout-settings-handle');
  });

  it('hides resize and connector geometry handles while comment settings are open', () => {
    const markup = renderToStaticMarkup(
      renderCalloutInteractionHandles(createProps({ isGeometryHandleHidden: true }))
    );

    expect(markup).toContain('sniptale-callout-drag-handle');
    expect(markup).toContain('sniptale-callout-settings-handle');
    expect(markup).not.toContain('sniptale-callout-resize-handle');
    expect(markup).not.toContain('sniptale-callout-tail-handle');
  });

  it('hides comment and connector geometry while the connected frame is being edited', () => {
    const markup = renderToStaticMarkup(
      renderCalloutInteractionHandles(
        createProps({ isGeometryHandleHidden: true, isWidthResizeHandleHidden: true })
      )
    );

    expect(markup).not.toContain('sniptale-callout-resize-handle');
    expect(markup).not.toContain('sniptale-callout-tail-base-start-handle');
    expect(markup).not.toContain('sniptale-callout-tail-frame-handle');
    expect(markup).not.toContain('sniptale-callout-waypoint-handle');
    expect(markup).toContain('sniptale-callout-drag-handle');
  });

  it('removes invisible handles from pointer hit testing until hover or focus reveals them', () => {
    const markup = renderToStaticMarkup(
      renderCalloutInteractionHandles(createProps({ isHandleVisible: false }))
    );

    expect(markup).toContain('opacity:0');
    expect(markup).toContain('pointer-events:none');
  });
});
