// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  clearHistoryMock,
  disableNavigationLockMock,
  registerFrameCallbacksMock,
  useFrameManagerMock,
  useFrameUIControllerMock,
  useModeDisabledListenerMock,
  useQuickActionHotkeysMock,
  useShowToolbarButtonMock,
} = vi.hoisted(() => ({
  clearHistoryMock: vi.fn(),
  disableNavigationLockMock: vi.fn(),
  registerFrameCallbacksMock: vi.fn(),
  useFrameManagerMock: vi.fn(() => ({
    addFrame: vi.fn(),
    clearFrames: vi.fn(),
    frames: [],
    hasFrameForElement: vi.fn(),
    removeFrame: vi.fn(),
  })),
  useFrameUIControllerMock: vi.fn(),
  useModeDisabledListenerMock: vi.fn(),
  useQuickActionHotkeysMock: vi.fn(),
  useShowToolbarButtonMock: vi.fn(),
}));

vi.mock('../../../selection/highlighter', async (importOriginal) => ({
  ...(await importOriginal()),
  registerFrameCallbacks: registerFrameCallbacksMock,
}));

vi.mock('../../../selection/locker', async (importOriginal) => ({
  ...(await importOriginal()),
  disableNavigationLock: disableNavigationLockMock,
}));

vi.mock('../../../parser/page-preparation/history', async (importOriginal) => ({
  ...(await importOriginal()),
  pagePreparationHistory: {
    clear: clearHistoryMock,
  },
}));

vi.mock('../../../selection/frame-runtime/react/useFrameManager', () => ({
  useFrameManager: useFrameManagerMock,
}));

vi.mock('../../../selection/frame-runtime/ui-controller', () => ({
  useFrameUIController: useFrameUIControllerMock,
}));

vi.mock('../../../application/mode-session/disabled-listener', () => ({
  useModeDisabledListener: useModeDisabledListenerMock,
}));

vi.mock('../../toolbar/quick-action-hotkeys', () => ({
  useQuickActionHotkeys: useQuickActionHotkeysMock,
}));

vi.mock('../../toolbar/show-button', () => ({
  useShowToolbarButton: useShowToolbarButtonMock,
}));

import { useContentAppBindings } from '.';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
const InteractiveFrameComponent = vi.fn(() => null);

function TestBindings(props: Parameters<typeof useContentAppBindings>[0]) {
  useContentAppBindings(props);
  return null;
}

async function renderBindings(props: Parameters<typeof useContentAppBindings>[0]) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<TestBindings {...props} />);
  });
}

function createBindingsProps() {
  return {
    countdownActive: false,
    InteractiveFrameComponent,
    modeControls: {
      setAiPickMode: vi.fn(),
      setHighlighterMode: vi.fn(),
      setIsToolbarVisible: vi.fn(),
      setQuickEditDocumentMode: vi.fn(),
      setQuickEditMode: vi.fn(),
    },
    modeFlags: {
      aiPickMode: false,
      highlighterMode: false,
      quickEditDocumentMode: false,
      quickEditMode: false,
      screenshotMode: true,
    },
    visibilityState: {
      isCompletelyHidden: false,
      isToolbarVisible: false,
    },
  };
}

function resetBindingsSuite() {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
}

function cleanupBindingsSuite() {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
}

async function expectStableShowToolbarCallback() {
  const props = createBindingsProps();

  await renderBindings(props);
  await renderBindings(props);

  expect(useFrameManagerMock).toHaveBeenCalledWith({ InteractiveFrameComponent });
  expect(useShowToolbarButtonMock).toHaveBeenCalledTimes(2);

  const firstCall = useShowToolbarButtonMock.mock.calls[0]?.[0];
  const secondCall = useShowToolbarButtonMock.mock.calls[1]?.[0];

  expect(firstCall?.onShowToolbar).toBeTypeOf('function');
  expect(secondCall?.onShowToolbar).toBe(firstCall?.onShowToolbar);

  secondCall?.onShowToolbar();

  expect(props.modeControls.setIsToolbarVisible).toHaveBeenCalledWith(true);
}

async function expectPagePreparationHistoryReset() {
  const props = createBindingsProps();

  await renderBindings(props);
  expect(clearHistoryMock).not.toHaveBeenCalled();

  await renderBindings({
    ...props,
    modeFlags: {
      ...props.modeFlags,
      screenshotMode: false,
    },
  });

  expect(clearHistoryMock).toHaveBeenCalledTimes(1);
}

async function expectLatestFrameManagerCallbackRouting() {
  const frameMocks = createFrameManagerCallbackMocks();
  const element = document.createElement('div');

  configureFrameManagerLatestPair(frameMocks);

  const props = createBindingsProps();

  await renderBindings(props);
  await renderBindings(props);

  expect(registerFrameCallbacksMock).toHaveBeenCalledTimes(1);

  const [addFrame, removeFrame, clearFrames, hasFrameForElement] =
    registerFrameCallbacksMock.mock.calls[0] ?? [];

  addFrame?.(element);
  removeFrame?.('frame-1');
  clearFrames?.();
  expect(hasFrameForElement?.(element)).toBe(true);

  expectLatestFrameManagerActions({
    element,
    ...frameMocks,
  });
}

function createFrameManagerCallbackMocks() {
  return {
    initialAddFrame: vi.fn(),
    initialClearFrames: vi.fn(),
    initialHasFrameForElement: vi.fn(() => false),
    initialRemoveFrame: vi.fn(),
    nextAddFrame: vi.fn(),
    nextClearFrames: vi.fn(),
    nextHasFrameForElement: vi.fn(() => true),
    nextRemoveFrame: vi.fn(),
  };
}

function configureFrameManagerLatestPair(
  mocks: ReturnType<typeof createFrameManagerCallbackMocks>
) {
  useFrameManagerMock
    .mockReturnValueOnce({
      addFrame: mocks.initialAddFrame,
      clearFrames: mocks.initialClearFrames,
      frames: [],
      hasFrameForElement: mocks.initialHasFrameForElement,
      removeFrame: mocks.initialRemoveFrame,
    })
    .mockReturnValueOnce({
      addFrame: mocks.nextAddFrame,
      clearFrames: mocks.nextClearFrames,
      frames: [],
      hasFrameForElement: mocks.nextHasFrameForElement,
      removeFrame: mocks.nextRemoveFrame,
    });
}

function expectLatestFrameManagerActions({
  element,
  initialAddFrame,
  initialClearFrames,
  initialHasFrameForElement,
  initialRemoveFrame,
  nextAddFrame,
  nextClearFrames,
  nextHasFrameForElement,
  nextRemoveFrame,
}: {
  element: Element;
  initialAddFrame: ReturnType<typeof vi.fn>;
  initialClearFrames: ReturnType<typeof vi.fn>;
  initialHasFrameForElement: ReturnType<typeof vi.fn>;
  initialRemoveFrame: ReturnType<typeof vi.fn>;
  nextAddFrame: ReturnType<typeof vi.fn>;
  nextClearFrames: ReturnType<typeof vi.fn>;
  nextHasFrameForElement: ReturnType<typeof vi.fn>;
  nextRemoveFrame: ReturnType<typeof vi.fn>;
}) {
  expect(initialAddFrame).not.toHaveBeenCalled();
  expect(nextAddFrame).toHaveBeenCalledWith(element);
  expect(initialRemoveFrame).not.toHaveBeenCalled();
  expect(nextRemoveFrame).toHaveBeenCalledWith('frame-1');
  expect(initialClearFrames).not.toHaveBeenCalled();
  expect(nextClearFrames).toHaveBeenCalledTimes(1);
  expect(initialHasFrameForElement).not.toHaveBeenCalled();
  expect(nextHasFrameForElement).toHaveBeenCalledWith(element);
}

function runUseContentAppBindingsSuite() {
  beforeEach(resetBindingsSuite);
  afterEach(cleanupBindingsSuite);

  it(
    'passes a stable show-toolbar callback across parent rerenders',
    expectStableShowToolbarCallback
  );
  it(
    'clears page-preparation history when screenshot mode exits',
    expectPagePreparationHistoryReset
  );
  it(
    'registers frame callbacks once and routes them through the latest frame-manager actions',
    expectLatestFrameManagerCallbackRouting
  );
}

describe('useContentAppBindings', runUseContentAppBindingsSuite);
