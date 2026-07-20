// @vitest-environment jsdom

import { afterEach, expect, it, vi } from 'vitest';

import { CONTENT_ROOT_ID } from '@sniptale/ui/branding';
import { createDiagnosticActionHandlers } from './logger.actions';

function createState() {
  return {
    isEnabled: true,
    lastScrollY: 0,
    scrollTimeoutId: null as number | null,
  };
}

function createHandlers() {
  const sendEvent = vi.fn();
  const state = createState();

  return {
    sendEvent,
    state,
    handlers: createDiagnosticActionHandlers({ sendEvent, state }),
  };
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

it('captures user actions outside the extension root with target metadata', () => {
  const { handlers, sendEvent } = createHandlers();
  const input = document.createElement('input');
  input.value = 'secret';
  input.placeholder = 'Email';
  input.className = 'primary field';
  document.body.append(input);

  const inputEvent = new Event('input', { bubbles: true });
  Object.defineProperty(inputEvent, 'target', { value: input });
  handlers.handleUserAction(inputEvent);

  expect(sendEvent).toHaveBeenCalledWith({
    kind: 'action',
    level: 'log',
    message: 'input on input',
    data: {
      actionType: 'input',
      target: {
        tagName: 'input',
        type: 'text',
      },
      valueLength: 6,
    },
  });

  sendEvent.mockReset();
  const extensionRoot = document.createElement('div');
  extensionRoot.id = CONTENT_ROOT_ID;
  const button = document.createElement('button');
  extensionRoot.append(button);
  document.body.append(extensionRoot);
  const clickEvent = new MouseEvent('click', { bubbles: true });
  Object.defineProperty(clickEvent, 'target', { value: button });
  handlers.handleUserAction(clickEvent);

  expect(sendEvent).not.toHaveBeenCalled();
});

it('captures only special key presses for enabled targets', () => {
  const { handlers, sendEvent } = createHandlers();
  const button = document.createElement('button');
  document.body.append(button);

  const specialEvent = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
  Object.defineProperty(specialEvent, 'target', { value: button });
  handlers.handleKeyAction(specialEvent);

  expect(sendEvent).toHaveBeenCalledWith({
    kind: 'action',
    level: 'log',
    message: 'keydown: Enter',
    data: expect.objectContaining({
      actionType: 'keydown',
      key: 'Enter',
    }),
  });

  sendEvent.mockReset();
  const plainEvent = new KeyboardEvent('keydown', { key: 'a', bubbles: true });
  Object.defineProperty(plainEvent, 'target', { value: button });
  handlers.handleKeyAction(plainEvent);
  expect(sendEvent).not.toHaveBeenCalled();
});

it('throttles scroll actions and records direction after the timeout', () => {
  vi.useFakeTimers();
  const { handlers, sendEvent, state } = createHandlers();
  vi.spyOn(window, 'scrollY', 'get').mockReturnValue(24);

  handlers.handleScrollAction(new Event('scroll'));
  handlers.handleScrollAction(new Event('scroll'));
  vi.runAllTimers();

  expect(sendEvent).toHaveBeenCalledTimes(1);
  expect(sendEvent).toHaveBeenCalledWith({
    kind: 'action',
    level: 'log',
    message: 'scroll down',
    data: {
      actionType: 'scroll',
      direction: 'down',
      scrollY: 24,
      delta: 24,
    },
  });
  expect(state.lastScrollY).toBe(24);
  vi.useRealTimers();
});
