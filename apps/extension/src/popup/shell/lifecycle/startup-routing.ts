import {
  DEFAULT_POPUP_STARTUP_STATE,
  loadPopupStartupState,
  type PopupStartupSelection,
} from '../../../composition/persistence/capture-settings/popup-startup';
import {
  CaptureMode,
  type CaptureMode as VideoCaptureMode,
} from '@sniptale/runtime-contracts/video/types/types';
import type { PopupLifecycleBootstrapParams } from './contracts';
import { createLogger } from '@sniptale/platform/observability/logger';

const logger = createLogger({ namespace: 'PopupStartupRouting' });

const VIDEO_MODES: Partial<Record<PopupStartupSelection, VideoCaptureMode>> = {
  'video:tab': CaptureMode.TAB,
  'video:area': CaptureMode.TAB_CROP,
  'video:camera': CaptureMode.CAMERA,
  'video:screen': CaptureMode.SCREEN,
};

const SCREENSHOT_MODES = {
  'screenshots:quick-actions': 'quick-actions',
  'screenshots:tab': 'tab',
  'screenshots:desktop': 'desktop',
  'screenshots:tools': 'tools',
} as const;

export async function loadPopupStartupSelection() {
  try {
    return await loadPopupStartupState();
  } catch (error) {
    logger.error('Failed to load popup startup state', error);
    return DEFAULT_POPUP_STARTUP_STATE;
  }
}

export async function applyPopupStartupSelection(
  params: Pick<
    PopupLifecycleBootstrapParams,
    'setPage' | 'setScreenshotStartupMode' | 'setVideoCaptureMode'
  >,
  selection: PopupStartupSelection,
  lastPage: 'home' | 'video' | 'export'
): Promise<void> {
  if (selection === 'remember-last') {
    params.setPage(lastPage);
    return;
  }

  if (selection === 'export') {
    params.setPage('export');
    return;
  }

  const videoMode = VIDEO_MODES[selection];
  if (videoMode) {
    params.setVideoCaptureMode(videoMode);
    params.setPage('video');
    return;
  }

  const screenshotMode = SCREENSHOT_MODES[selection as keyof typeof SCREENSHOT_MODES];
  if (screenshotMode) {
    params.setScreenshotStartupMode(screenshotMode);
    params.setPage('home');
  }
}
