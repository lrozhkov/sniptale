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

function expectAiPickDomSetup(state: ReturnType<typeof createAiPickDomState>): void {
  expect(enableNavigationLockMock).toHaveBeenCalledWith(true);
  expect(enableTextSelectionBlockMock).toHaveBeenCalledTimes(1);
  expect(buildElementMapsMock).toHaveBeenCalledWith(state.elementIndex, expect.any(Object));
  expect(document.body.classList.contains('sniptale-ai-pick-mode')).toBe(true);
  expect(state.cursorStyleElement?.id).toBe('sniptale-ai-pick-cursor-style');
  expect(addEventListenerToAllWindowsDynamicMock.mock.calls.map(([type]) => type)).toEqual([
    'mousemove',
    'pointerdown',
    'click',
    'keydown',
  ]);
}

function expectAiPickDomTeardown(state: ReturnType<typeof createAiPickDomState>): void {
  expect(resetAiPickElementIndexMock).toHaveBeenCalledWith(state.elementIndex);
  expect(cleanupMouseMoveMock).toHaveBeenCalledTimes(1);
  expect(cleanupPointerDownMock).toHaveBeenCalledTimes(1);
  expect(cleanupClickMock).toHaveBeenCalledTimes(1);
  expect(cleanupKeyDownMock).toHaveBeenCalledTimes(1);
  expect(cleanupCursorStylesMock).toHaveBeenCalledTimes(1);
  expect(document.body.classList.contains('sniptale-ai-pick-mode')).toBe(false);
  expect(disableTextSelectionBlockMock).toHaveBeenCalledTimes(1);
  expect(disableNavigationLockMock).toHaveBeenCalledTimes(1);
  expect(setContentModeEnabledMock).toHaveBeenCalledWith('ai-pick', false);
  expect(state.cleanupEventListeners).toBeNull();
  expect(state.cleanupCursorStyles).toBeNull();
  expect(state.cursorStyleElement).toBeNull();
}

describe('ai-pick dom-state helpers', () => {
  it('sets up DOM state, listeners, and teardown cleanup for ai-pick mode', () => {
    const state = createAiPickDomState();

    setupAiPickDom(createParsedTree(), state);
    attachAiPickListeners(state, vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn());
    expectAiPickDomSetup(state);

    teardownAiPickDom(state);
    expectAiPickDomTeardown(state);
  });

  it('re-enables navigation lock on teardown when ai-pick inherited an active lock session', () => {
    const state = createAiPickDomState();
    isLockEnabledMock.mockReturnValue(true);

    setupAiPickDom(createParsedTree(), state);
    teardownAiPickDom(state);

    expect(enableNavigationLockMock).toHaveBeenLastCalledWith(false);
    expect(disableNavigationLockMock).not.toHaveBeenCalled();
  });

  it('keeps refresh local when the parsed tree is missing', () => {
    const state = createAiPickDomState();

    refreshAiPickDomSnapshot(null, state);

    expect(buildElementMapsMock).not.toHaveBeenCalled();
  });
});
