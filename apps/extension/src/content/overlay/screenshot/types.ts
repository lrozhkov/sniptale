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

export type ScreenshotEditingMode =
  | 'ai-pick'
  | 'design-review'
  | 'drawing'
  | 'highlighter'
  | 'quick-edit';

export type ScreenshotType = 'visible' | 'full' | 'selection';

export interface ScreenshotCaptureAdapter {
  captureSelection: () => Promise<string>;
  captureViewport: (type: 'visible' | 'full') => Promise<string>;
}

export interface ScreenshotControllerCapturePersistenceBridge {
  sessionActivePresetId: string | null;
  setSaveDialogState: (state: SaveDialogState | null) => void;
}

export interface ScreenshotControllerRuntimeSession {
  editingModeBaseline: ScreenshotEditingMode | null;
  navigationLockBaseline: boolean;
  runActive: boolean;
  runGeneration: number;
}

export interface ScreenshotControllerRuntime {
  captureAdapter?: ScreenshotCaptureAdapter;
  capturePersistence: ScreenshotControllerCapturePersistenceBridge;
  captureActionRef: MutableRefObject<CaptureActionType>;
  session: ScreenshotControllerRuntimeSession;
  scenario?: ScreenshotControllerScenarioBridge;
  restoreEditingMode: (mode: ScreenshotEditingMode) => void;
  setCaptureAction: (action: CaptureActionType) => void;
  setIsCompletelyHidden: (hidden: boolean) => void;
  setIsToolbarVisible: (visible: boolean) => void;
  setNavigationLockEnabled: (enabled: boolean) => void;
}
