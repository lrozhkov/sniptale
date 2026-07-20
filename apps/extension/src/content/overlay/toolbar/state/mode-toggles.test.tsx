// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const modeToggleMocks = vi.hoisted(() => ({
  sendRuntimeMessage: vi.fn(),
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

function ModeToggleHarness(props: { aiPickMode: boolean; onDisableAiPickMode?: () => void }) {
  const { pendingInteractionMode, toggleMode } = useToolbarModeToggles({
    aiPickMode: props.aiPickMode,
    screenshotMode: true,
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
