// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  addEventListenerToAllWindowsDynamicMock,
  resolveIframeEventTargetMock,
  recordScenarioSuggestedEventMock,
  trustedEventMocks,
} = vi.hoisted(() => ({
  addEventListenerToAllWindowsDynamicMock: vi.fn<
    (
      eventName: string,
      listener: (event: Event, iframe?: HTMLIFrameElement) => void,
      options?: AddEventListenerOptions
    ) => () => void
  >(() => vi.fn()),
  resolveIframeEventTargetMock: vi.fn<
    (event: Event, iframe?: HTMLIFrameElement) => HTMLElement | null
  >(() => null),
  recordScenarioSuggestedEventMock: vi.fn(async () => ({ success: true })),
  trustedEventMocks: {
    isTrustedDomEvent: vi.fn(() => true),
    isTrustedKeyboardEvent: vi.fn(() => true),
  },
}));

vi.mock('../../../platform/frame', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/frame')>()),
  addEventListenerToAllWindowsDynamic: addEventListenerToAllWindowsDynamicMock,
  resolveIframeEventTarget: resolveIframeEventTargetMock,
}));

vi.mock('../runtime/transport/capture', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../runtime/transport/capture')>()),
  recordScenarioSuggestedEvent: recordScenarioSuggestedEventMock,
}));

vi.mock('../../../platform/trusted-events', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/trusted-events')>()),
  isTrustedDomEvent: trustedEventMocks.isTrustedDomEvent,
  isTrustedKeyboardEvent: trustedEventMocks.isTrustedKeyboardEvent,
}));

import { registerScenarioSuggestedEventListeners } from './helpers';

function resetSuggestedEventMocks() {
  vi.clearAllMocks();
  trustedEventMocks.isTrustedDomEvent.mockReturnValue(true);
  trustedEventMocks.isTrustedKeyboardEvent.mockReturnValue(true);
}

function createSuggestedEventListenerSpies() {
  return {
    changeListener: vi.fn(),
    cleanups: [vi.fn(), vi.fn(), vi.fn()] as const,
    inputListener: vi.fn(),
    keydownListener: vi.fn(),
  };
}

function wireSuggestedEventListenerMocks(
  args: ReturnType<typeof createSuggestedEventListenerSpies>
) {
  addEventListenerToAllWindowsDynamicMock
    .mockImplementationOnce((_event: string, listener: (event: Event) => void) => {
      args.inputListener.mockImplementation(listener);
      return args.cleanups[0];
    })
    .mockImplementationOnce((_event: string, listener: (event: Event) => void) => {
      args.changeListener.mockImplementation(listener);
      return args.cleanups[1];
    })
    .mockImplementationOnce((_event: string, listener: (event: Event) => void) => {
      args.keydownListener.mockImplementation(listener);
      return args.cleanups[2];
    });
}

function expectRecordedSuggestedEvents() {
  expect(recordScenarioSuggestedEventMock).toHaveBeenCalledWith(
    expect.objectContaining({
      kind: 'input',
      message: 'Input: Submit',
    })
  );
  expect(recordScenarioSuggestedEventMock).toHaveBeenCalledWith(
    expect.objectContaining({
      kind: 'change',
      message: 'Change: Submit',
    })
  );
  expect(recordScenarioSuggestedEventMock).toHaveBeenCalledWith({
    kind: 'keydown',
    message: 'Shortcut: Ctrl + S',
  });
}

function expectCleanupCalls(cleanups: ReadonlyArray<ReturnType<typeof vi.fn>>) {
  cleanups.forEach((cleanupFn) => {
    expect(cleanupFn).toHaveBeenCalledTimes(1);
  });
}

function expectSuggestedEventLoggingFlow() {
  const listeners = createSuggestedEventListenerSpies();
  wireSuggestedEventListenerMocks(listeners);

  const target = document.createElement('button');
  target.textContent = 'Submit';
  resolveIframeEventTargetMock.mockReturnValue(target as HTMLElement | null);

  const cleanup = registerScenarioSuggestedEventListeners('project-1');

  listeners.inputListener(new InputEvent('input'));
  listeners.changeListener(new Event('change'));
  listeners.keydownListener(new KeyboardEvent('keydown', { ctrlKey: true, key: 's' }));

  expectRecordedSuggestedEvents();

  cleanup();
  expectCleanupCalls(listeners.cleanups);
}

function expectSyntheticSuggestedEventsAreIgnored() {
  const listeners = createSuggestedEventListenerSpies();
  wireSuggestedEventListenerMocks(listeners);

  const target = document.createElement('button');
  target.textContent = 'Submit';
  resolveIframeEventTargetMock.mockReturnValue(target as HTMLElement | null);
  trustedEventMocks.isTrustedDomEvent.mockReturnValue(false);
  trustedEventMocks.isTrustedKeyboardEvent.mockReturnValue(false);

  const cleanup = registerScenarioSuggestedEventListeners('project-1');

  listeners.inputListener(new InputEvent('input'));
  listeners.changeListener(new Event('change'));
  listeners.keydownListener(new KeyboardEvent('keydown', { ctrlKey: true, key: 's' }));

  expect(recordScenarioSuggestedEventMock).not.toHaveBeenCalled();

  cleanup();
}

describe('useScenarioSuggestedEventLogging.helpers', () => {
  beforeEach(resetSuggestedEventMocks);

  it('records input, change, and shortcut suggestions through the scenario transport owner', () => {
    expectSuggestedEventLoggingFlow();
  });

  it('ignores synthetic suggested-event DOM inputs', () => {
    expectSyntheticSuggestedEventsAreIgnored();
  });
});
