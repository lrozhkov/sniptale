import { expect, it, vi } from 'vitest';

import {
  finishScenarioRecorder,
  isScenarioByClickBlocked,
  resolveScenarioByClickTransition,
} from './scenario';

it('treats highlighter, quick edit, and ai-pick as by-click blockers', () => {
  expect(
    isScenarioByClickBlocked({
      aiPickMode: false,
      highlighterMode: false,
      quickEditMode: false,
    })
  ).toBe(false);

  expect(
    isScenarioByClickBlocked({
      aiPickMode: true,
      highlighterMode: false,
      quickEditMode: false,
    })
  ).toBe(true);

  expect(
    isScenarioByClickBlocked({
      aiPickMode: false,
      highlighterMode: true,
      quickEditMode: false,
    })
  ).toBe(true);

  expect(
    isScenarioByClickBlocked({
      aiPickMode: false,
      highlighterMode: false,
      quickEditMode: true,
    })
  ).toBe(true);
});

it('finishes the recorder by disabling screenshot mode before opening the scenario editor', async () => {
  const events: string[] = [];
  const handleScreenshotModeDisabled = vi.fn(async () => {
    events.push('scenario-disabled');
  });
  const openEditor = vi.fn(async () => {
    events.push('editor-opened');
  });
  const handleToggleScreenshotMode = vi.fn((enabled: boolean) => {
    events.push(`toggle:${String(enabled)}`);
  });

  await finishScenarioRecorder({
    modeController: {
      handleToggleScreenshotMode,
    },
    scenarioController: {
      handleScreenshotModeDisabled,
      openEditor,
    },
  });

  expect(handleToggleScreenshotMode).toHaveBeenCalledWith(false);
  expect(handleScreenshotModeDisabled).toHaveBeenCalledTimes(1);
  expect(openEditor).toHaveBeenCalledWith();
  expect(events).toEqual(['toggle:false', 'scenario-disabled', 'editor-opened']);
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
