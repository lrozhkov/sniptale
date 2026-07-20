import { CaptureMessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { CaptureActionType } from '../../../../contracts/settings';
import type { ScreenshotControllerRuntime } from '../types';

type ViewportScreenshotType = 'visible' | 'full';

export function createViewportCaptureMessage(
  type: ViewportScreenshotType,
  actionType: CaptureActionType,
  runtime: ScreenshotControllerRuntime,
  shouldSaveScenarioStep: boolean
) {
  const scenarioCapture = shouldSaveScenarioStep
    ? runtime.scenario?.buildCapturePayload?.(type)
    : undefined;

  return type === 'full'
    ? {
        type: CaptureMessageType.CAPTURE_FULL,
        actionType,
        ...(scenarioCapture == null ? {} : { scenarioCapture }),
      }
    : {
        type: CaptureMessageType.CAPTURE_VISIBLE,
        actionType,
        ...(scenarioCapture == null ? {} : { scenarioCapture }),
      };
}
