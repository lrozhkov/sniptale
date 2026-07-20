// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const loggerMock = vi.hoisted(() => ({
  debug: vi.fn(),
}));

const contentModeEventsMocks = vi.hoisted(() => ({
  dispatchContentModeDisabledMock: vi.fn(),
  dispatchExitFrameEditingMock: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: vi.fn(() => loggerMock),
}));

vi.mock('../../platform/page-context/mode-events', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/page-context/mode-events')>()),
  dispatchContentModeDisabled: contentModeEventsMocks.dispatchContentModeDisabledMock,
  dispatchExitFrameEditing: contentModeEventsMocks.dispatchExitFrameEditingMock,
}));

import { createHighlighterRuntimeEscapeKeyHandler } from './runtime-escape-key';

beforeEach(() => {
  loggerMock.debug.mockClear();
  contentModeEventsMocks.dispatchContentModeDisabledMock.mockClear();
  contentModeEventsMocks.dispatchExitFrameEditingMock.mockClear();
  Object.defineProperty(document, 'activeElement', {
    configurable: true,
    value: document.body,
  });
});

function dispatchEscape(handler: ReturnType<typeof createHighlighterRuntimeEscapeKeyHandler>) {
  const preventDefault = vi.fn();
  const stopPropagation = vi.fn();

  handler({
    key: 'Escape',
    preventDefault,
    stopPropagation,
  } as unknown as KeyboardEvent);

  return { preventDefault, stopPropagation };
}

function dispatchEscapeFromCalloutPath(
  handler: ReturnType<typeof createHighlighterRuntimeEscapeKeyHandler>
) {
  const callout = document.createElement('div');
  const active = document.createElement('button');
  const event = new KeyboardEvent('keydown', { cancelable: true, key: 'Escape' });
  const preventDefault = vi.spyOn(event, 'preventDefault');
  const stopPropagation = vi.spyOn(event, 'stopPropagation');

  callout.className = 'sniptale-callout';
  callout.append(active);
  document.body.append(callout);
  Object.defineProperty(event, 'composedPath', {
    configurable: true,
    value: () => [active, callout, document.body, document, window],
  });

  handler(event);

  return { preventDefault, stopPropagation };
}

function focusCalloutActiveElement() {
  const callout = document.createElement('div');
  const active = document.createElement('button');

  callout.className = 'sniptale-callout';
  callout.append(active);
  document.body.append(callout);
  Object.defineProperty(document, 'activeElement', {
    configurable: true,
    value: active,
  });
}

describe('createHighlighterRuntimeEscapeKeyHandler ignored events', () => {
  it('ignores non-Escape events and callout-focused Escape events', () => {
    const disableHighlighterMode = vi.fn();
    const handler = createHighlighterRuntimeEscapeKeyHandler({
      disableHighlighterMode,
      isAnyFrameEditing: () => false,
    });
    focusCalloutActiveElement();

    handler({
      key: 'Enter',
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as KeyboardEvent);
    dispatchEscape(handler);

    expect(disableHighlighterMode).not.toHaveBeenCalled();
    expect(contentModeEventsMocks.dispatchExitFrameEditingMock).not.toHaveBeenCalled();
    expect(contentModeEventsMocks.dispatchContentModeDisabledMock).not.toHaveBeenCalled();
  });

  it('ignores callout Escape events when shadow focus exposes only the host document active element', () => {
    const disableHighlighterMode = vi.fn();
    const handler = createHighlighterRuntimeEscapeKeyHandler({
      disableHighlighterMode,
      isAnyFrameEditing: () => true,
    });

    const { preventDefault, stopPropagation } = dispatchEscapeFromCalloutPath(handler);

    expect(preventDefault).not.toHaveBeenCalled();
    expect(stopPropagation).not.toHaveBeenCalled();
    expect(disableHighlighterMode).not.toHaveBeenCalled();
    expect(contentModeEventsMocks.dispatchExitFrameEditingMock).not.toHaveBeenCalled();
    expect(contentModeEventsMocks.dispatchContentModeDisabledMock).not.toHaveBeenCalled();
  });
});

describe('createHighlighterRuntimeEscapeKeyHandler active Escape events', () => {
  it('emits exit-frame-editing instead of disabling the mode when frame editing is active', () => {
    const disableHighlighterMode = vi.fn();
    const handler = createHighlighterRuntimeEscapeKeyHandler({
      disableHighlighterMode,
      isAnyFrameEditing: () => true,
    });

    const { preventDefault, stopPropagation } = dispatchEscape(handler);

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(contentModeEventsMocks.dispatchExitFrameEditingMock).toHaveBeenCalledTimes(1);
    expect(loggerMock.debug).toHaveBeenCalledWith('Escaped from frame editing mode');
    expect(disableHighlighterMode).not.toHaveBeenCalled();
  });

  it('disables the mode and emits mode-disabled when no frame is being edited', () => {
    const disableHighlighterMode = vi.fn();
    const handler = createHighlighterRuntimeEscapeKeyHandler({
      disableHighlighterMode,
      isAnyFrameEditing: () => false,
    });

    const { preventDefault, stopPropagation } = dispatchEscape(handler);

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(disableHighlighterMode).toHaveBeenCalledTimes(1);
    expect(contentModeEventsMocks.dispatchContentModeDisabledMock).toHaveBeenCalledWith({
      mode: 'highlighter',
    });
  });
});
