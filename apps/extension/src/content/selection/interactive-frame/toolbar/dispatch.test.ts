// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { createFrameDataFixture } from '../../frame-runtime/test-support';
import { createInteractiveFrameToolbarActions } from './actions';
import { canDecreaseFrameSize, resizeFrameByStep, type ToolbarClickEvent } from './dispatch';
import type { InteractiveFrameToolbarProps } from './types';

function createEvent(): ToolbarClickEvent {
  return {
    nativeEvent: { stopImmediatePropagation: vi.fn() },
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  };
}

function createToolbarProps(
  frame: InteractiveFrameToolbarProps['frame'],
  onUpdate: InteractiveFrameToolbarProps['onUpdate']
): InteractiveFrameToolbarProps {
  return {
    calloutPopoverAnchorRef: { current: null },
    clearSelection: vi.fn(),
    effectMode: 'border',
    frame,
    handleDelete: vi.fn(),
    handleEffectButtonClick: vi.fn(),
    handleStartEditing: vi.fn(),
    isCalloutEditing: false,
    isSelected: true,
    toolbarAnchorOffset: null,
    onUpdate,
    popoverAnchorRef: { current: null },
    closePopover: vi.fn(),
    togglePopover: vi.fn(),
    setIsCalloutEditing: vi.fn(),
    setState: vi.fn(),
    state: 'hover',
    stepBadgePopoverAnchorRef: { current: null },
    toolbarCoords: { x: 20, y: 20 },
  };
}

describe('interactive frame toolbar size actions', () => {
  it('lets an active effect button toggle its own popover closed', () => {
    const props = createToolbarProps(createFrameDataFixture('frame-1'), vi.fn());
    const actions = createInteractiveFrameToolbarActions(props);

    actions.handleEffectClick('border')(createEvent());

    expect(props.closePopover).not.toHaveBeenCalled();
    expect(props.handleEffectButtonClick).toHaveBeenCalledWith('border');
  });

  it('changes geometry by exactly 5 px on every side', () => {
    const frame = createFrameDataFixture('frame-1', {
      x: 20,
      y: 30,
      width: 100,
      height: 80,
    });

    expect(resizeFrameByStep(frame, 'increase')).toMatchObject({
      x: 15,
      y: 25,
      width: 110,
      height: 90,
    });
    expect(resizeFrameByStep(frame, 'decrease')).toMatchObject({
      x: 25,
      y: 35,
      width: 90,
      height: 70,
    });
  });

  it('publishes one update per click and blocks incomplete shrink steps', () => {
    const frame = createFrameDataFixture('frame-1', { width: 10, height: 10 });
    const onUpdate = vi.fn();
    const actions = createInteractiveFrameToolbarActions(createToolbarProps(frame, onUpdate));

    expect(canDecreaseFrameSize(frame)).toBe(false);
    actions.handleDecreaseClick(createEvent());
    expect(onUpdate).not.toHaveBeenCalled();
    actions.handleIncreaseClick(createEvent());
    expect(onUpdate).toHaveBeenCalledOnce();
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ width: 20, height: 20 }));
  });
});
