// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';

const {
  addEventListenerToAllWindowsDynamicMock,
  buildElementMapsMock,
  cleanupClickMock,
  cleanupCursorStylesMock,
  cleanupKeyDownMock,
  cleanupMouseMoveMock,
  cleanupPointerDownMock,
  createAiPickElementIndexMock,
  disableNavigationLockMock,
  disableTextSelectionBlockMock,
  enableNavigationLockMock,
  enableTextSelectionBlockMock,
  isLockEnabledMock,
  mountStyleInAccessibleDocumentsMock,
  resetAiPickElementIndexMock,
  setContentModeEnabledMock,
  walkAllDocumentsMock,
} = vi.hoisted(() => ({
  addEventListenerToAllWindowsDynamicMock: vi.fn(),
  buildElementMapsMock: vi.fn(),
  cleanupClickMock: vi.fn(),
  cleanupCursorStylesMock: vi.fn(),
  cleanupKeyDownMock: vi.fn(),
  cleanupMouseMoveMock: vi.fn(),
  cleanupPointerDownMock: vi.fn(),
  createAiPickElementIndexMock: vi.fn(),
  disableNavigationLockMock: vi.fn(),
  disableTextSelectionBlockMock: vi.fn(),
  enableNavigationLockMock: vi.fn(),
  enableTextSelectionBlockMock: vi.fn(),
  isLockEnabledMock: vi.fn(),
  mountStyleInAccessibleDocumentsMock: vi.fn(),
  resetAiPickElementIndexMock: vi.fn(),
  setContentModeEnabledMock: vi.fn(),
  walkAllDocumentsMock: vi.fn(),
}));

vi.mock('../../../../../selection/locker', async (importOriginal) => ({
  ...(await importOriginal()),
  disableNavigationLock: disableNavigationLockMock,
  disableTextSelectionBlock: disableTextSelectionBlockMock,
  enableNavigationLock: enableNavigationLockMock,
  enableTextSelectionBlock: enableTextSelectionBlockMock,
  isLockEnabled: isLockEnabledMock,
}));

vi.mock('../../../../../application/mode-session', () => ({
  setContentModeEnabled: setContentModeEnabledMock,
}));

vi.mock('../../../../../platform/frame', async (importOriginal) => ({
  ...(await importOriginal()),
  addEventListenerToAllWindowsDynamic: addEventListenerToAllWindowsDynamicMock,
  mountStyleInAccessibleDocuments: mountStyleInAccessibleDocumentsMock,
  walkAllDocuments: walkAllDocumentsMock,
}));

vi.mock('../dom-index', async (importOriginal) => ({
  ...(await importOriginal()),
  createAiPickElementIndex: createAiPickElementIndexMock,
  resetAiPickElementIndex: resetAiPickElementIndexMock,
}));

vi.mock('../dom-helpers', async (importOriginal) => ({
  ...(await importOriginal()),
  buildElementMaps: buildElementMapsMock,
}));

import {
  attachAiPickListeners,
  createAiPickDomState,
  refreshAiPickDomSnapshot,
  setupAiPickDom,
  teardownAiPickDom,
} from '.';

function createParsedTree(): ParsedDOMTree {
  return {
    metadata: {},
    structure: [{ children: [], id: 'node-1' }],
  } as unknown as ParsedDOMTree;
}

beforeEach(() => {
  vi.clearAllMocks();
  document.head.replaceChildren();
  document.body.className = '';
  document.body.style.userSelect = '';
  document.body.style.webkitUserSelect = '';
  createAiPickElementIndexMock.mockReturnValue({ token: 'element-index' });
  isLockEnabledMock.mockReturnValue(false);
  walkAllDocumentsMock.mockImplementation((visit: (doc: Document) => void) => {
    visit(document);
  });
  mountStyleInAccessibleDocumentsMock.mockImplementation(({ styleId, textContent }) => {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = textContent;
    document.head.appendChild(style);
    return cleanupCursorStylesMock;
  });
  addEventListenerToAllWindowsDynamicMock
    .mockImplementationOnce(() => cleanupMouseMoveMock)
    .mockImplementationOnce(() => cleanupPointerDownMock)
    .mockImplementationOnce(() => cleanupClickMock)
    .mockImplementationOnce(() => cleanupKeyDownMock);
  buildElementMapsMock.mockReturnValue({ dataCount: 3, elementCount: 2 });
});

describe('ai-pick dom-state lifecycle', () => {
  it('sets up and tears down ai-pick DOM state through the canonical owner', () => {
    const state = createAiPickDomState();

    setupAiPickDom(createParsedTree(), state);
    attachAiPickListeners(state, vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn());
    teardownAiPickDom(state);

    expect(enableNavigationLockMock).toHaveBeenCalledWith(true);
    expect(enableTextSelectionBlockMock).toHaveBeenCalledTimes(1);
    expect(buildElementMapsMock).toHaveBeenCalledWith(state.elementIndex, expect.any(Object));
    expect(cleanupMouseMoveMock).toHaveBeenCalledTimes(1);
    expect(cleanupPointerDownMock).toHaveBeenCalledTimes(1);
    expect(cleanupClickMock).toHaveBeenCalledTimes(1);
    expect(cleanupKeyDownMock).toHaveBeenCalledTimes(1);
    expect(cleanupCursorStylesMock).toHaveBeenCalledTimes(1);
    expect(disableTextSelectionBlockMock).toHaveBeenCalledTimes(1);
    expect(disableNavigationLockMock).toHaveBeenCalledTimes(1);
    expect(setContentModeEnabledMock).toHaveBeenCalledWith('ai-pick', false);
  });
});

describe('ai-pick dom-state listener scope', () => {
  it('attaches listeners to a scoped source document when one is provided', () => {
    const state = createAiPickDomState();
    const iframe = document.createElement('iframe');
    document.body.append(iframe);
    const source = {
      snapshotSource: { document: iframe.contentDocument!, root: iframe.contentDocument!.body },
      targetIframe: iframe,
    };

    attachAiPickListeners(state, vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn(), source);

    expect(addEventListenerToAllWindowsDynamicMock).toHaveBeenCalledWith(
      'mousemove',
      expect.any(Function),
      { capture: true },
      { rootDocument: source.snapshotSource.document, rootIframe: iframe }
    );
  });
});

describe('ai-pick dom-state teardown', () => {
  it('restores a pre-existing navigation lock instead of always disabling it on teardown', () => {
    const state = createAiPickDomState();
    isLockEnabledMock.mockReturnValue(true);

    setupAiPickDom(createParsedTree(), state);
    teardownAiPickDom(state);

    expect(enableNavigationLockMock).toHaveBeenLastCalledWith(false);
    expect(disableNavigationLockMock).not.toHaveBeenCalled();
  });

  it('skips rebuilding the snapshot when no parsed tree is available', () => {
    const state = createAiPickDomState();

    refreshAiPickDomSnapshot(null, state);

    expect(buildElementMapsMock).not.toHaveBeenCalled();
  });
});
