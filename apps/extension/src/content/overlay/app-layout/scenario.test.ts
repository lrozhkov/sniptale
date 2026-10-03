import { expect, it, vi } from 'vitest';

import {
  exitScreenshotModeFromUserAction,
  finishScenarioRecorder,
  isScenarioByClickBlocked,
  resolveScenarioByClickTransition,
} from './scenario';

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
