import { expect, it, vi } from 'vitest';
import { CaptureMessageType } from '@sniptale/runtime-contracts/messaging/capture-messages';
import { createViewportCaptureMessage } from './viewport-message';
import type { ScreenshotControllerRuntime } from '../types';
import type { ScenarioCaptureSurface } from '@sniptale/runtime-contracts/scenario/types/base';

function createScenarioPayload(captureSurface: ScenarioCaptureSurface) {
  return {
    captureSurface,
    sourceKind: 'manual' as const,
    page: {
      title: null,
      url: null,
      viewport: { height: 768, width: 1024, x: 0, y: 0 },
      scrollX: 0,
      scrollY: 0,
      devicePixelRatio: 1,
    },
  };
}

function createRuntime(): ScreenshotControllerRuntime {
  return {
    captureActionRef: { current: 'download_default' },
    capturePersistence: {
      sessionActivePresetId: null,
      setSaveDialogState: vi.fn(),
    },
    navigationLockStateBeforeScreenshot: { current: false },
    screenshotRunActiveRef: { current: false },
    screenshotRunGenerationRef: { current: 1 },
    scenario: {
      buildCapturePayload: vi.fn(createScenarioPayload),
    },
    setIsCompletelyHidden: vi.fn(),
    setIsToolbarVisible: vi.fn(),
    setNavigationLockEnabled: vi.fn(),
  };
}

it('creates visible and full capture messages with optional scenario payloads', () => {
  const runtime = createRuntime();

  expect(createViewportCaptureMessage('visible', 'scenario', runtime, true)).toEqual({
    type: CaptureMessageType.CAPTURE_VISIBLE,
    actionType: 'scenario',
    scenarioCapture: createScenarioPayload('visible'),
  });
  expect(createViewportCaptureMessage('full', 'copy', runtime, false)).toEqual({
    type: CaptureMessageType.CAPTURE_FULL,
    actionType: 'copy',
  });
});
