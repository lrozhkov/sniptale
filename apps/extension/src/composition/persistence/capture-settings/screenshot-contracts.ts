import type { ScreenshotCaptureConfig } from '@sniptale/runtime-contracts/capture/action';

export type ScreenshotSetupMode = 'quick-actions' | 'tab' | 'desktop';
export type ScreenshotSetupState = {
  selectedMode: ScreenshotSetupMode;
  tab: ScreenshotCaptureConfig;
  desktop: ScreenshotCaptureConfig;
};
