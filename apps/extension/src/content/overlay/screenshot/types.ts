import type { MutableRefObject } from 'react';

import type { CaptureActionType } from '../../../contracts/settings';
import type { ContentPrivilegedActionIntentSource } from '../../application/privileged-action-intent';
import type { ScreenshotControllerScenarioBridge } from './scenario';

type SaveDialogState = {
  dataUrl: string;
  filename: string;
};

export type ScreenshotSuccessFeedbackOptions = {
  contentIntentSource?: ContentPrivilegedActionIntentSource | undefined;
  runToken?: number | undefined;
  showSuccessToast?: boolean;
};

export type ScreenshotStartContext = {
  navigationLockBaseline?: boolean | undefined;
};

export interface ScreenshotCaptureAdapter {
  captureSelection: () => Promise<string>;
  captureViewport: (type: 'visible' | 'full') => Promise<string>;
}

export interface ScreenshotControllerCapturePersistenceBridge {
  sessionActivePresetId: string | null;
  setSaveDialogState: (state: SaveDialogState | null) => void;
}

export interface ScreenshotControllerRuntime {
  captureAdapter?: ScreenshotCaptureAdapter;
  capturePersistence: ScreenshotControllerCapturePersistenceBridge;
  captureActionRef: MutableRefObject<CaptureActionType>;
  navigationLockStateBeforeScreenshot: { current: boolean };
  screenshotRunActiveRef: { current: boolean };
  screenshotRunGenerationRef: { current: number };
  scenario?: ScreenshotControllerScenarioBridge;
  setIsCompletelyHidden: (hidden: boolean) => void;
  setIsToolbarVisible: (visible: boolean) => void;
  setNavigationLockEnabled: (enabled: boolean) => void;
}
