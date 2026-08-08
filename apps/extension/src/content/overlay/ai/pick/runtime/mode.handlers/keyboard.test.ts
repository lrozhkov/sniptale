// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import { createAiPickDomState } from '../dom-state';
import type { AiPickModeState } from '../mode.types';

const {
  dispatchContentModeDisabledMock,
  getContentEventTargetElementMock,
  isExtensionUIElementMock,
} = vi.hoisted(() => ({
  dispatchContentModeDisabledMock: vi.fn(),
  getContentEventTargetElementMock: vi.fn(),
  isExtensionUIElementMock: vi.fn(),
}));

vi.mock('../../../../../platform/page-context/mode-events', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/page-context/mode-events')>()),
  dispatchContentModeDisabled: dispatchContentModeDisabledMock,
}));

vi.mock('../../../../../platform/dom-host', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/dom-host')>()),
  getContentEventTargetElement: getContentEventTargetElementMock,
}));

vi.mock('../guards', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../guards')>()),
  isExtensionUIElement: isExtensionUIElementMock,
}));

import { createKeyDownHandler } from './keyboard';

function createParsedTree(): ParsedDOMTree {
  return {
    metadata: {},
    structure: [{ children: [], id: 'node-1' }],
  } as unknown as ParsedDOMTree;
}

function createState(): AiPickModeState {
  return {
    domState: createAiPickDomState(),
    enableSequence: 0,
    isEnabled: true,
    onContentSelect: vi.fn(),
    parsedTree: createParsedTree(),
    pendingEnable: null,
    source: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getContentEventTargetElementMock.mockReturnValue(null);
  isExtensionUIElementMock.mockReturnValue(false);
});

describe('ai-pick keyboard handler', () => {
  it('keeps ai-pick active when toolbar UI already claimed Escape', () => {
    const state = createState();
    const disable = vi.fn();
    const event = new KeyboardEvent('keydown', { cancelable: true, key: 'Escape' });
    event.preventDefault();

    createKeyDownHandler(state, disable)(event);

    expect(disable).not.toHaveBeenCalled();
    expect(dispatchContentModeDisabledMock).not.toHaveBeenCalled();
  });

  it('disables ai-pick mode and dispatches the shared event on Escape', () => {
    const state = createState();
    const disable = vi.fn();
    const event = {
      key: 'Escape',
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as KeyboardEvent;

    createKeyDownHandler(state, disable)(event);

    expect(disable).toHaveBeenCalledTimes(1);
    expect(dispatchContentModeDisabledMock).toHaveBeenCalledWith({ mode: 'ai-pick' });
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
  });

  it('ignores Escape while focus is inside extension-owned UI', () => {
    const state = createState();
    const disable = vi.fn();
    const modalTarget = document.createElement('textarea');
    const event = {
      key: 'Escape',
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as KeyboardEvent;

    getContentEventTargetElementMock.mockReturnValue(modalTarget);
    isExtensionUIElementMock.mockReturnValue(true);

    createKeyDownHandler(state, disable)(event);

    expect(disable).not.toHaveBeenCalled();
    expect(dispatchContentModeDisabledMock).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});
