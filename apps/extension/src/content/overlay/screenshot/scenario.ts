import type { ScenarioRuntimeCapturePayload } from '../../../contracts/messaging/contracts/types';
import type { ScenarioCaptureSurface } from '@sniptale/runtime-contracts/scenario/types/base';

export type ScreenshotControllerScenarioBridge = {
  buildCapturePayload?: (
    captureSurface: ScenarioCaptureSurface
  ) => ScenarioRuntimeCapturePayload | null;
  ensureCaptureReady?: () => Promise<void>;
  refreshSession?: (shouldApplyResponse?: () => boolean) => Promise<void>;
  saveSelectionCapture?: (
    dataUrl: string,
    captureSurface: ScenarioCaptureSurface,
    shouldApplyResponse?: () => boolean
  ) => Promise<void>;
};
