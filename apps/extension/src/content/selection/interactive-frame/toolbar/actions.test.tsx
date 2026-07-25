// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { pagePreparationHistory } from '../../../parser/page-preparation/history';
import { addFrameCalloutChangedListener } from '../../../platform/page-context/frame-events';
import {
  createCalloutSettingsFixture,
  createFrameDataFixture,
  createStepBadgeSettingsFixture,
} from '../../frame-runtime/test-support';
import { createInteractiveFrameToolbarActions } from './actions';
import type { ToolbarClickEvent } from './dispatch';
import type { InteractiveFrameToolbarProps } from './types';

function createToolbarProps(
  frame: InteractiveFrameToolbarProps['frame'] = createFrameDataFixture('frame-1')
): InteractiveFrameToolbarProps {
  return {
    calloutPopoverAnchorRef: { current: null },
    closePopover: vi.fn(),
    effectMode: 'border',
    frame,
    handleDelete: vi.fn(),
    handleEffectButtonClick: vi.fn(),
    handleStartEditing: vi.fn(),
    isCalloutEditing: false,
    isSelected: true,
    onUpdate: vi.fn(),
    popoverAnchorRef: { current: null },
    setIsCalloutEditing: vi.fn(),
    setState: vi.fn(),
    state: 'hover',
    stepBadgePopoverAnchorRef: { current: null },
    toolbarAnchorOffset: null,
    toolbarCoords: { x: 20, y: 20 },
    togglePopover: vi.fn(),
  };
}

function createToolbarEvent(): ToolbarClickEvent {
  return {
    nativeEvent: { stopImmediatePropagation: vi.fn() },
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  };
}

describe('interactive frame toolbar callout actions', () => {
  it('starts a grouped callout editing transaction before enabling a new callout', () => {
    const props = createToolbarProps();
    const listener = vi.fn();
    const cleanup = addFrameCalloutChangedListener(listener);
    const beginTransactionSpy = vi
      .spyOn(pagePreparationHistory, 'beginTransaction')
      .mockImplementation(() => undefined);

    createInteractiveFrameToolbarActions(props).handleCalloutClick(createToolbarEvent());

    expect(beginTransactionSpy).toHaveBeenCalledWith('callout-editing:frame-1');
    expect(listener).toHaveBeenCalledWith({
      frameId: 'frame-1',
      settings: { enabled: true },
    });

    cleanup();
  });

  it('routes enabled popover families through the single store transition', () => {
    const props = createToolbarProps(
      createFrameDataFixture('frame-1', {
        stepBadge: createStepBadgeSettingsFixture(),
        callout: createCalloutSettingsFixture(),
      })
    );
    const actions = createInteractiveFrameToolbarActions(props);

    actions.handleStepBadgeClick(createToolbarEvent());
    actions.handleCalloutClick(createToolbarEvent());

    expect(props.togglePopover).toHaveBeenNthCalledWith(1, 'frame-1', 'step-badge');
    expect(props.togglePopover).toHaveBeenNthCalledWith(2, 'frame-1', 'callout-settings');
  });
});
