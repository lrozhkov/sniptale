// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const modeToggleMocks = vi.hoisted(() => ({
  attachContentActionIntent: vi.fn(),
  createTrustedContentActionIntentSource: vi.fn(),
  sendRuntimeMessage: vi.fn(),
}));

vi.mock('../../../application/privileged-action-intent', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../application/privileged-action-intent')>()),
  attachContentActionIntent: modeToggleMocks.attachContentActionIntent,
  createTrustedContentActionIntentSource: modeToggleMocks.createTrustedContentActionIntentSource,
}));

vi.mock('../../../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/runtime-messaging')>()),
  sendRuntimeMessage: modeToggleMocks.sendRuntimeMessage,
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: () => ({
    debug: vi.fn(),
    error: vi.fn(),
  }),
}));

import { useToolbarModeToggles } from './mode-toggles';
import { installContentRuntimeMessagingMock } from '../../../application/runtime-services/services.test-support';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createDeferredResponse() {
  let resolvePromise: ((value: { success: boolean }) => void) | null = null;
  const promise = new Promise<{ success: boolean }>((resolve) => {
    resolvePromise = resolve;
  });

  return {
    promise,
    resolve: (value: { success: boolean }) => resolvePromise?.(value),
  };
}

function ModeToggleHarness(props: {
  aiPickMode: boolean;
  onDisableAiPickMode?: () => void;
  screenshotMode?: boolean;
}) {
  const { pendingInteractionMode, toggleMode } = useToolbarModeToggles({
    aiPickMode: props.aiPickMode,
    screenshotMode: props.screenshotMode ?? true,
    highlighterMode: false,
    quickEditMode: false,
    onToggleScreenshotMode: vi.fn(),
    onToggleHighlighterMode: vi.fn(),
    onToggleQuickEditMode: vi.fn(),
    onClearHighlights: vi.fn(),
    setIsLoading: vi.fn(),
    ...(props.onDisableAiPickMode === undefined
      ? {}
      : { onDisableAiPickMode: props.onDisableAiPickMode }),
  });

  return (
    <>
      <button
        type="button"
        data-ui="test.screenshot-toggle"
        onClick={(event) => {
          void toggleMode('screenshot', event.nativeEvent);
        }}
      />
      <button
        type="button"
        data-ui="test.quickedit-toggle"
        onClick={() => {
          void toggleMode('quickedit');
        }}
      />
      <div data-ui="test.pending-mode">{pendingInteractionMode ?? 'none'}</div>
    </>
  );
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  installContentRuntimeMessagingMock(modeToggleMocks.sendRuntimeMessage);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  modeToggleMocks.createTrustedContentActionIntentSource.mockReturnValue({
    kind: 'trusted-content-event',
  });
  modeToggleMocks.attachContentActionIntent.mockImplementation(async (message) => ({
    ...message,
    contentIntent: { requestId: 'request-1', token: 'token-1' },
  }));
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('useToolbarModeToggles', () => {
  it('attaches trusted one-shot intent before content-originated screenshot enable', async () => {
    modeToggleMocks.sendRuntimeMessage.mockResolvedValue({ success: true });
    await act(async () => {
      root?.render(<ModeToggleHarness aiPickMode={false} screenshotMode={false} />);
    });

    const toggleButton = document.querySelector('[data-ui="test.screenshot-toggle"]');
    await act(async () => {
      toggleButton?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(modeToggleMocks.createTrustedContentActionIntentSource).toHaveBeenCalledOnce();
    expect(modeToggleMocks.attachContentActionIntent).toHaveBeenCalledWith(
      { type: 'ENABLE_SCREENSHOT_MODE' },
      { kind: 'trusted-content-event' }
    );
    expect(modeToggleMocks.sendRuntimeMessage).toHaveBeenCalledWith({
      contentIntent: { requestId: 'request-1', token: 'token-1' },
      type: 'ENABLE_SCREENSHOT_MODE',
    });
  });

  it('keeps the target editing mode pending before AI mode is cleared', async () => {
    const deferred = createDeferredResponse();
    const disableAiPickMode = vi.fn();
    modeToggleMocks.sendRuntimeMessage.mockReturnValue(deferred.promise);

    await act(async () => {
      root?.render(<ModeToggleHarness aiPickMode={true} onDisableAiPickMode={disableAiPickMode} />);
    });

    const toggleButton = document.querySelector('[data-ui="test.quickedit-toggle"]');

    act(() => {
      toggleButton?.dispatchEvent(
        new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
        })
      );
    });

    expect(document.querySelector('[data-ui="test.pending-mode"]')?.textContent).toBe('quick-edit');
    expect(disableAiPickMode).not.toHaveBeenCalled();

    await act(async () => {
      deferred.resolve({ success: true });
      await deferred.promise;
    });

    expect(disableAiPickMode).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-ui="test.pending-mode"]')?.textContent).toBe('none');
  });
});
