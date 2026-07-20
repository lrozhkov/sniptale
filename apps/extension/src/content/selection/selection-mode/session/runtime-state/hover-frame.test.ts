// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoverMocks = vi.hoisted(() => ({
  getAbsolutePositionMock: vi.fn(),
  logSelectionModeRuntimeMock: vi.fn(),
  showHoverFrameDomMock: vi.fn(),
}));

vi.mock('../../../../platform/frame', () => ({
  getAbsolutePosition: hoverMocks.getAbsolutePositionMock,
}));

vi.mock('../../diag', () => ({
  logSelectionModeRuntime: hoverMocks.logSelectionModeRuntimeMock,
}));

vi.mock('../../ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../ui')>();
  return {
    ...actual,
    showHoverFrame: hoverMocks.showHoverFrameDomMock,
  };
});

import { createMutableRefs } from './test-support';
import { createSelectionModeHoverFrameHandlers } from './hover-frame';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('selection-mode runtime-state hover handlers', () => {
  it('logs missing dom and delegates hover rendering when dom exists', () => {
    const element = document.createElement('div');
    const absolutePosition = { x: 10, y: 20, width: 300, height: 200 };
    hoverMocks.getAbsolutePositionMock.mockReturnValue(absolutePosition);

    const missingDomRefs = createMutableRefs();
    missingDomRefs.dom = null as never;
    const missingDomHandlers = createSelectionModeHoverFrameHandlers(missingDomRefs);

    missingDomHandlers.hideHoverFrame();
    missingDomHandlers.showHoverFrameDom(element);

    const hoverFrame = document.createElement('div');
    const hoverSizeLabel = document.createElement('div');
    const domRefs = createMutableRefs();
    domRefs.dom = { ...domRefs.dom, hoverFrame, hoverSizeLabel } as never;
    const domHandlers = createSelectionModeHoverFrameHandlers(domRefs);

    domHandlers.hideHoverFrame();
    domHandlers.showHoverFrameDom(element);

    expect(hoverMocks.logSelectionModeRuntimeMock).toHaveBeenCalledWith(
      'Missing DOM during hideHoverFrame',
      expect.objectContaining({ currentState: 'idle', isActive: false })
    );
    expect(hoverMocks.logSelectionModeRuntimeMock).toHaveBeenCalledWith(
      'Missing DOM during showHoverFrame',
      expect.objectContaining({ currentState: 'idle', isActive: false, tagName: 'DIV' })
    );
    expect(hoverFrame.style.display).toBe('none');
    expect(hoverSizeLabel.style.display).toBe('none');
    expect(hoverMocks.showHoverFrameDomMock).toHaveBeenCalledWith(domRefs.dom, absolutePosition);
  });
});
