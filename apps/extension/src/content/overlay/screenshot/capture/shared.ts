import { hideAllToasts } from '@sniptale/ui/product-feedback/toast-service';
import type { CaptureActionType } from '../../../../contracts/settings';
import type { ScreenshotControllerRuntime } from '../types';

const UI_HIDE_SETTLE_FRAME_COUNT = 2;

function waitForNextPaintFrame(): Promise<void> {
  return new Promise((resolve) => {
    const globalScope = globalThis as typeof globalThis & {
      requestAnimationFrame?: typeof requestAnimationFrame;
      setTimeout: typeof setTimeout;
    };
    const raf =
      typeof globalScope.requestAnimationFrame === 'function'
        ? globalScope.requestAnimationFrame.bind(globalScope)
        : (callback: FrameRequestCallback) =>
            globalScope.setTimeout(() => callback(Date.now()), 16);

    raf(() => {
      resolve();
    });
  });
}

export async function waitForUiHideSettle(frameCount = UI_HIDE_SETTLE_FRAME_COUNT): Promise<void> {
  for (let frame = 0; frame < frameCount; frame += 1) {
    await waitForNextPaintFrame();
  }
}

function isScenarioCaptureAction(actionType: CaptureActionType): boolean {
  return actionType === 'scenario';
}

export function shouldSaveScenarioCapture(
  actionType: CaptureActionType,
  runtime: ScreenshotControllerRuntime
): boolean {
  return isScenarioCaptureAction(actionType) || Boolean(runtime.captureAdapter);
}

export function hideRuntimeShellForCapture(runtime: ScreenshotControllerRuntime): void {
  hideAllToasts();
  runtime.setIsCompletelyHidden(true);
  runtime.setIsToolbarVisible(false);
}
