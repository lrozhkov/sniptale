// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const helpersMocks = vi.hoisted(() => ({
  getContentEventTargetElementMock: vi.fn(),
  logSelectionModeRuntimeMock: vi.fn(),
  resolveIframeEventTargetMock: vi.fn(),
}));

vi.mock('../../../../platform/dom-host', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/dom-host')>()),
  getContentEventTargetElement: helpersMocks.getContentEventTargetElementMock,
}));

vi.mock('../../../../platform/frame', () => ({
  resolveIframeEventTarget: helpersMocks.resolveIframeEventTargetMock,
}));

vi.mock('../../diag', () => ({
  logSelectionModeRuntime: helpersMocks.logSelectionModeRuntimeMock,
}));

import { getSelectionModeResolvedTagName, logSelectionModeEvent } from './helpers';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('selection-mode event handlers helpers', () => {
  it('delegates runtime logging to the selection-mode runtime logger', () => {
    logSelectionModeEvent('Test event', { currentState: 'hover' });

    expect(helpersMocks.logSelectionModeRuntimeMock).toHaveBeenCalledWith('Test event', {
      currentState: 'hover',
    });
  });

  it('resolves iframe targets before content targets when logging pointer tags', () => {
    const iframeTarget = document.createElement('article');
    const fallbackTarget = document.createElement('section');
    helpersMocks.resolveIframeEventTargetMock.mockReturnValue(iframeTarget);
    helpersMocks.getContentEventTargetElementMock.mockReturnValue(fallbackTarget);

    const resolvedTagName = getSelectionModeResolvedTagName(new MouseEvent('mousedown'));

    expect(resolvedTagName).toBe('ARTICLE');
    expect(helpersMocks.resolveIframeEventTargetMock).toHaveBeenCalledTimes(1);
    expect(helpersMocks.getContentEventTargetElementMock).not.toHaveBeenCalled();
  });

  it('falls back to the content target when no iframe target is resolved', () => {
    const fallbackTarget = document.createElement('section');
    helpersMocks.resolveIframeEventTargetMock.mockReturnValue(null);
    helpersMocks.getContentEventTargetElementMock.mockReturnValue(fallbackTarget);

    const resolvedTagName = getSelectionModeResolvedTagName(new MouseEvent('mousemove'));

    expect(resolvedTagName).toBe('SECTION');
    expect(helpersMocks.resolveIframeEventTargetMock).toHaveBeenCalledTimes(1);
    expect(helpersMocks.getContentEventTargetElementMock).toHaveBeenCalledTimes(1);
  });
});
