// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FrameData } from '../../../../features/highlighter/contracts';

const highlighterMocks = vi.hoisted(() => ({
  isHighlighterEnabled: vi.fn(() => true),
  isHighlighterPausedState: vi.fn(() => false),
}));

vi.mock('../../highlighter', async () => {
  const actual = await vi.importActual<typeof import('../../highlighter')>('../../highlighter');

  return {
    ...actual,
    isHighlighterEnabled: highlighterMocks.isHighlighterEnabled,
    isHighlighterPausedState: highlighterMocks.isHighlighterPausedState,
  };
});

import { processFrameHover } from './helpers';

function createFrame(): FrameData {
  return {
    effectMode: 'border',
    height: 120,
    id: 'frame-1',
    width: 200,
    x: 100,
    y: 100,
  };
}

function appendFloatingFixture(className: string, rect: DOMRect): HTMLElement {
  const element = document.createElement('div');
  element.className = className;
  element.getBoundingClientRect = () => rect;
  document.body.append(element);
  return element;
}

function createRect(args: { bottom: number; left: number; right: number; top: number }): DOMRect {
  return {
    bottom: args.bottom,
    height: args.bottom - args.top,
    left: args.left,
    right: args.right,
    toJSON: () => undefined,
    top: args.top,
    width: args.right - args.left,
    x: args.left,
    y: args.top,
  } as DOMRect;
}

function processActiveFrameHover(args: { x: number; y: number }) {
  const hideTooltip = vi.fn();
  const showTooltip = vi.fn();

  processFrameHover({
    activeFrameId: 'frame-1',
    frames: [createFrame()],
    hideTooltip,
    popoverFrameId: null,
    showTooltip,
    x: args.x,
    y: args.y,
  });

  return { hideTooltip, showTooltip };
}

beforeEach(() => {
  highlighterMocks.isHighlighterEnabled.mockReturnValue(true);
  highlighterMocks.isHighlighterPausedState.mockReturnValue(false);
});

afterEach(() => {
  document.body.replaceChildren();
  vi.clearAllMocks();
});

describe('processFrameHover', () => {
  it('keeps the active frame while floating UI bounds are mounting', () => {
    const { hideTooltip } = processActiveFrameHover({ x: 520, y: 520 });

    expect(hideTooltip).not.toHaveBeenCalled();
  });

  it('keeps hover state when the pointer is inside the callout settings popover', () => {
    appendFloatingFixture(
      'sniptale-callout-settings-popover',
      createRect({ bottom: 470, left: 300, right: 460, top: 300 })
    );

    const { hideTooltip } = processActiveFrameHover({ x: 340, y: 340 });

    expect(hideTooltip).not.toHaveBeenCalled();
  });

  it('hides the active frame when the pointer leaves mounted floating UI bounds', () => {
    appendFloatingFixture(
      'sniptale-action-toolbar',
      createRect({ bottom: 40, left: 0, right: 80, top: 0 })
    );

    const { hideTooltip } = processActiveFrameHover({ x: 520, y: 520 });

    expect(hideTooltip).toHaveBeenCalledWith('frame-1');
  });
});
