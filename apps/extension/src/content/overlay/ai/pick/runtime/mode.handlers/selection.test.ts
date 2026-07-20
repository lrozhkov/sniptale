// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';

const {
  getDataIdsForElementMock,
  getNearestDataElementMock,
  isExtensionUIElementMock,
  isNonDataInteractiveElementMock,
  resolveAiPickInteractionTargetMock,
} = vi.hoisted(() => ({
  getDataIdsForElementMock: vi.fn(),
  getNearestDataElementMock: vi.fn(),
  isExtensionUIElementMock: vi.fn(),
  isNonDataInteractiveElementMock: vi.fn(),
  resolveAiPickInteractionTargetMock: vi.fn(),
}));

vi.mock('../dom-helpers', () => ({
  getDataIdsForElement: getDataIdsForElementMock,
  getNearestDataElement: getNearestDataElementMock,
}));

vi.mock('../guards', () => ({
  isExtensionUIElement: isExtensionUIElementMock,
  isNonDataInteractiveElement: isNonDataInteractiveElementMock,
}));

vi.mock('../interaction-target', () => ({
  resolveAiPickInteractionTarget: resolveAiPickInteractionTargetMock,
}));

import { createClickHandler, createPointerDownHandler } from './selection';

function createParsedTree(): ParsedDOMTree {
  return {
    metadata: {},
    structure: [{ children: [], id: 'node-1' }],
  } as unknown as ParsedDOMTree;
}

function createState() {
  return {
    domState: { elementIndex: { token: 'index' } },
    enableSequence: 0,
    isEnabled: true,
    onContentSelect: vi.fn(),
    parsedTree: createParsedTree(),
    pendingEnable: null,
    source: null,
  };
}

function createMouseEvent() {
  return {
    preventDefault: vi.fn(),
    stopImmediatePropagation: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as MouseEvent;
}

beforeEach(() => {
  vi.clearAllMocks();
  isExtensionUIElementMock.mockReturnValue(false);
  isNonDataInteractiveElementMock.mockReturnValue(false);
});

describe('ai-pick click handler', () => {
  it('blocks clicks on non-data areas', () => {
    const state = createState();
    const event = createMouseEvent();
    resolveAiPickInteractionTargetMock.mockReturnValue(document.createElement('div'));
    getNearestDataElementMock.mockReturnValue(null);

    createClickHandler(state as never)(event);

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
    expect(event.stopImmediatePropagation).toHaveBeenCalledTimes(1);
    expect(state.onContentSelect).not.toHaveBeenCalled();
  });

  it('blocks clicks on interactive page controls during ai-pick hover preview', () => {
    const state = createState();
    const event = createMouseEvent();
    resolveAiPickInteractionTargetMock.mockReturnValue(document.createElement('button'));
    isNonDataInteractiveElementMock.mockReturnValue(true);

    createClickHandler(state as never)(event);

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
    expect(event.stopImmediatePropagation).toHaveBeenCalledTimes(1);
    expect(state.onContentSelect).not.toHaveBeenCalled();
  });

  it('notifies the selected ids when a data element is resolved', () => {
    const state = createState();
    const event = createMouseEvent();
    const target = document.createElement('div');
    const dataElement = document.createElement('section');
    const selectedIds = new Set(['field-1', 'field-2']);
    resolveAiPickInteractionTargetMock.mockReturnValue(target);
    getNearestDataElementMock.mockReturnValue(dataElement);
    getDataIdsForElementMock.mockReturnValue(selectedIds);

    createClickHandler(state as never)(event);

    expect(state.onContentSelect).toHaveBeenCalledWith(state.parsedTree, selectedIds);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
  });
});

describe('ai-pick source-scoped selection handler', () => {
  it('ignores resolved targets rejected by the active source scope', () => {
    const target = document.createElement('div');
    const state = {
      ...createState(),
      source: {
        acceptsTarget: vi.fn(() => false),
        snapshotSource: { document },
      },
    };
    const event = createMouseEvent();
    resolveAiPickInteractionTargetMock.mockReturnValue(target);

    createClickHandler(state as never)(event);

    expect(state.source.acceptsTarget).toHaveBeenCalledWith(target);
    expect(getNearestDataElementMock).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});

describe('ai-pick pointer down handler', () => {
  it('blocks pointer down on page-owned targets so page controls do not react before selection', () => {
    const state = createState();
    const event = createMouseEvent();
    resolveAiPickInteractionTargetMock.mockReturnValue(document.createElement('div'));

    createPointerDownHandler(state as never)(event);

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
    expect(event.stopImmediatePropagation).toHaveBeenCalledTimes(1);
  });

  it('does not block pointer down inside extension-owned ui', () => {
    const state = createState();
    const event = createMouseEvent();
    resolveAiPickInteractionTargetMock.mockReturnValue(document.createElement('button'));
    isExtensionUIElementMock.mockReturnValue(true);

    createPointerDownHandler(state as never)(event);

    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});
