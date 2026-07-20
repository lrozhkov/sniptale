// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { pagePreparationHistory } from '../../../parser/page-preparation/history';
import { addFrameCalloutChangedListener } from '../../../platform/page-context/frame-events';
import { createInteractiveFrameToolbarActions } from './actions';

function createToolbarProps() {
  return {
    frame: { id: 'frame-1' },
    hideTooltip: vi.fn(),
    setIsCalloutEditing: vi.fn(),
    setIsCalloutPopoverOpen: vi.fn(),
    setIsStepBadgePopoverOpen: vi.fn(),
    setState: vi.fn(),
  } as never;
}

function createToolbarEvent() {
  return {
    nativeEvent: { stopImmediatePropagation: vi.fn() },
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as never;
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
});
