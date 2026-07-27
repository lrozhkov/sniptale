// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { renderCalloutInteractionHandles, type CalloutInteractionHandleProps } from './handles';

function createProps(
  overrides: Partial<CalloutInteractionHandleProps> = {}
): CalloutInteractionHandleProps {
  return {
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
    isDragging: false,
    isEditing: false,
    isHandleVisible: true,
    isResizingLeft: false,
    isResizingRight: false,
    isTailDragging: false,
    isTailBaseEndDragging: false,
    isTailFrameDragging: false,
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
    ...overrides,
  };
}

describe('callout interaction handles', () => {
  it('renders the comment grip and boundary-constrained tail point', () => {
    const markup = renderToStaticMarkup(renderCalloutInteractionHandles(createProps()));

    expect(markup).toContain('sniptale-callout-drag-handle');
    expect(markup).toContain('sniptale-callout-settings-handle');
    expect(markup).toContain('sniptale-callout-tail-handle');
    expect(markup).toContain('sniptale-callout-tail-base-start-handle');
    expect(markup).toContain('sniptale-callout-tail-base-end-handle');
    expect(markup).toContain('sniptale-callout-tail-frame-handle');
    expect(markup).toContain('cursor:ew-resize');
    expect(markup).toContain('background:#ffffff');
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

  it('removes invisible handles from pointer hit testing until hover or focus reveals them', () => {
    const markup = renderToStaticMarkup(
      renderCalloutInteractionHandles(createProps({ isHandleVisible: false }))
    );

    expect(markup).toContain('opacity:0');
    expect(markup).toContain('pointer-events:none');
  });
});
