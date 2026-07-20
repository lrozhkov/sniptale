// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getNearestDataElementMock,
  isExtensionUIElementMock,
  isNonDataInteractiveElementMock,
  resolveAiPickInteractionTargetMock,
} = vi.hoisted(() => ({
  getNearestDataElementMock: vi.fn(),
  isExtensionUIElementMock: vi.fn(),
  isNonDataInteractiveElementMock: vi.fn(),
  resolveAiPickInteractionTargetMock: vi.fn(),
}));

vi.mock('../dom-helpers', async (importOriginal) => ({
  ...(await importOriginal()),
  getNearestDataElement: getNearestDataElementMock,
}));

vi.mock('../guards', () => ({
  isExtensionUIElement: isExtensionUIElementMock,
  isNonDataInteractiveElement: isNonDataInteractiveElementMock,
}));

vi.mock('../interaction-target', () => ({
  resolveAiPickInteractionTarget: resolveAiPickInteractionTargetMock,
}));

import { createMouseLeaveHandler, createMouseMoveHandler } from './hover';

function createState() {
  return {
    domState: { elementIndex: { token: 'index' } },
    isEnabled: true,
    source: null,
  };
}

function createMouseEvent() {
  return {} as MouseEvent;
}

beforeEach(() => {
  vi.clearAllMocks();
  isExtensionUIElementMock.mockReturnValue(false);
  isNonDataInteractiveElementMock.mockReturnValue(false);
});

describe('ai-pick hover move handlers', () => {
  it('hides the hover overlay when the resolved target is absent', () => {
    const state = createState();
    const overlayController = { hideHoverOverlay: vi.fn(), showHoverOverlay: vi.fn() };
    resolveAiPickInteractionTargetMock.mockReturnValue(null);

    createMouseMoveHandler(state as never, overlayController)(createMouseEvent());

    expect(overlayController.hideHoverOverlay).toHaveBeenCalledTimes(1);
    expect(overlayController.showHoverOverlay).not.toHaveBeenCalled();
  });

  it('shows the hover overlay for the nearest data element', () => {
    const state = createState();
    const overlayController = { hideHoverOverlay: vi.fn(), showHoverOverlay: vi.fn() };
    const target = document.createElement('div');
    const dataElement = document.createElement('article');
    resolveAiPickInteractionTargetMock.mockReturnValue(target);
    getNearestDataElementMock.mockReturnValue(dataElement);

    createMouseMoveHandler(state as never, overlayController)(createMouseEvent());

    expect(overlayController.showHoverOverlay).toHaveBeenCalledWith(dataElement);
    expect(overlayController.hideHoverOverlay).not.toHaveBeenCalled();
  });

  it('hides the hover overlay when the source scope rejects the resolved target', () => {
    const target = document.createElement('div');
    const state = {
      ...createState(),
      source: {
        acceptsTarget: vi.fn(() => false),
        snapshotSource: { document },
      },
    };
    const overlayController = { hideHoverOverlay: vi.fn(), showHoverOverlay: vi.fn() };
    resolveAiPickInteractionTargetMock.mockReturnValue(target);

    createMouseMoveHandler(state as never, overlayController)(createMouseEvent());

    expect(state.source.acceptsTarget).toHaveBeenCalledWith(target);
    expect(overlayController.hideHoverOverlay).toHaveBeenCalledTimes(1);
    expect(overlayController.showHoverOverlay).not.toHaveBeenCalled();
  });
});

describe('ai-pick hover leave handlers', () => {
  it('hides the hover preview on mouse leave only while enabled', () => {
    const state = createState();
    const overlayController = { hideHoverOverlay: vi.fn() };
    const handleMouseLeave = createMouseLeaveHandler(state as never, overlayController);

    handleMouseLeave();
    state.isEnabled = false;
    handleMouseLeave();

    expect(overlayController.hideHoverOverlay).toHaveBeenCalledTimes(1);
  });
});
