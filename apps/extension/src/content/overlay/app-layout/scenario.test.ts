import { beforeEach, expect, it, vi } from 'vitest';

const { teardown, showToast } = vi.hoisted(() => ({
  teardown: vi.fn((transition: () => void) => {
    transition();
    return Promise.resolve();
  }),
  showToast: vi.fn(),
}));
vi.mock('../design-review/runtime/session-teardown', () => ({
  teardownDesignReviewSessionAfterUiTransition: teardown,
}));
vi.mock('@sniptale/ui/product-feedback/toast-service', () => ({ showToast }));
beforeEach(() => vi.clearAllMocks());

import {
  exitScreenshotModeFromUserAction,
  finishScenarioRecorder,
  isScenarioByClickBlocked,
  resolveScenarioByClickTransition,
} from './scenario';

it('restores changes before local exit even when background teardown was bypassed', () => {
  let transition!: () => void;
  teardown.mockImplementationOnce((callback) => {
    transition = callback;
    return Promise.resolve();
  });
  const handleToggleScreenshotMode = vi.fn();
  const setPinToTab = vi.fn();
  exitScreenshotModeFromUserAction({ modeController: { handleToggleScreenshotMode }, setPinToTab });
  expect(teardown).toHaveBeenCalledOnce();
  expect(handleToggleScreenshotMode).not.toHaveBeenCalled();
  expect(setPinToTab).not.toHaveBeenCalled();
  transition();
  expect(handleToggleScreenshotMode).toHaveBeenCalledWith(false);
  expect(setPinToTab).toHaveBeenCalledWith(false);
});

it('retains toolbar and pin state when restoration is refused', async () => {
  const failure = Promise.reject(new Error('Restoration refused'));
  teardown.mockReturnValueOnce(failure);
  const handleToggleScreenshotMode = vi.fn();
  const setPinToTab = vi.fn();
  exitScreenshotModeFromUserAction({ modeController: { handleToggleScreenshotMode }, setPinToTab });
  await failure.catch(() => undefined);
  expect(handleToggleScreenshotMode).not.toHaveBeenCalled();
  expect(setPinToTab).not.toHaveBeenCalled();
  expect(showToast).toHaveBeenCalledOnce();
});

it('always clears authoritative pin state on explicit exit despite a stale false projection', () => {
  const handleToggleScreenshotMode = vi.fn();
  const setPinToTab = vi.fn();

  exitScreenshotModeFromUserAction({
    modeController: { handleToggleScreenshotMode },
    setPinToTab,
  });

  expect(handleToggleScreenshotMode).toHaveBeenCalledWith(false);
  expect(setPinToTab).toHaveBeenCalledWith(false);
});

it('keeps the panel pinned when exiting a screenshot while automatic blur is active', () => {
  const handleToggleScreenshotMode = vi.fn();
  const setPinToTab = vi.fn();

  exitScreenshotModeFromUserAction({
    modeController: { handleToggleScreenshotMode },
    setPinToTab,
    keepPinnedForAutoBlur: true,
  });

  expect(handleToggleScreenshotMode).toHaveBeenCalledWith(false);
  expect(setPinToTab).not.toHaveBeenCalled();
});

it('treats highlighter, quick edit, and ai-pick as by-click blockers', () => {
  expect(
    isScenarioByClickBlocked({
      aiPickMode: false,
      designReviewMode: false,
      highlighterMode: false,
      quickEditMode: false,
    })
  ).toBe(false);

  expect(
    isScenarioByClickBlocked({
      aiPickMode: true,
      designReviewMode: false,
      highlighterMode: false,
      quickEditMode: false,
    })
  ).toBe(true);

  expect(
    isScenarioByClickBlocked({
      aiPickMode: false,
      designReviewMode: false,
      highlighterMode: true,
      quickEditMode: false,
    })
  ).toBe(true);

  expect(
    isScenarioByClickBlocked({
      aiPickMode: false,
      designReviewMode: false,
      highlighterMode: false,
      quickEditMode: true,
    })
  ).toBe(true);
});

it('closes screenshot mode only after finishing and opening the editor', async () => {
  const events: string[] = [];
  const finishRecording = vi.fn(async () => {
    events.push('finished');
  });
  await finishScenarioRecorder({
    onDisableScreenshotMode: () => {
      events.push('closed');
    },
    scenarioController: { finishRecording },
  });
  expect(events).toEqual(['finished', 'closed']);
});

it('restores by-click after blocker modes are cleared only when it was auto-forced to manual', () => {
  expect(
    resolveScenarioByClickTransition({
      blocked: true,
      captureMode: 'by-click',
      restoreState: { restoreByClickAfterUnblock: false },
    })
  ).toBe('force-manual');

  expect(
    resolveScenarioByClickTransition({
      blocked: false,
      captureMode: 'manual',
      restoreState: { restoreByClickAfterUnblock: true },
    })
  ).toBe('restore-by-click');

  expect(
    resolveScenarioByClickTransition({
      blocked: false,
      captureMode: 'manual',
      restoreState: { restoreByClickAfterUnblock: false },
    })
  ).toBeNull();
});

it('keeps screenshot mode available when finishing fails', async () => {
  const onDisableScreenshotMode = vi.fn();
  const failure = new Error('Cannot finish');
  await expect(
    finishScenarioRecorder({
      onDisableScreenshotMode,
      scenarioController: {
        finishRecording: vi.fn(async () => {
          throw failure;
        }),
      },
    })
  ).rejects.toThrow(failure);
  expect(onDisableScreenshotMode).not.toHaveBeenCalled();
});

it('waits for accepted unpin before handback and keeps runtime after refusal', async () => {
  let accept!: (value: boolean) => void;
  const onClosed = vi.fn();
  exitScreenshotModeFromUserAction({
    modeController: { handleToggleScreenshotMode: vi.fn() },
    setPinToTab: () =>
      new Promise((resolve) => {
        accept = resolve;
      }),
    onClosed,
  });
  await Promise.resolve();
  expect(onClosed).not.toHaveBeenCalled();
  accept(false);
  await vi.waitFor(() => expect(showToast).toHaveBeenCalledOnce());
  expect(onClosed).not.toHaveBeenCalled();
  exitScreenshotModeFromUserAction({
    modeController: { handleToggleScreenshotMode: vi.fn() },
    setPinToTab: async () => true,
    onClosed,
  });
  await vi.waitFor(() => expect(onClosed).toHaveBeenCalledOnce());
});
