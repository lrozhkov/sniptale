import { createLazyDefaultOwner } from '@sniptale/foundation/default-owner';
import type { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { createOffscreenDesktopMediaController } from './controller';
import type { DesktopMediaRequestOptions } from './types';

const defaultDesktopMediaController = createLazyDefaultOwner(createOffscreenDesktopMediaController);

export async function requestDesktopMedia(
  captureMode: CaptureMode,
  controlledCursorCaptureEnabled = false,
  options: Omit<DesktopMediaRequestOptions, 'controlledCursorCaptureEnabled'>
): Promise<void> {
  return defaultDesktopMediaController.getOwner().requestDesktopMedia(captureMode, {
    controlledCursorCaptureEnabled,
    ...options,
  });
}

export function consumeDesktopStream(): { stream: MediaStream | null; label: string | null } {
  return defaultDesktopMediaController.getOwner().consumeDesktopStream();
}

export function consumeDesktopStreams(): Array<{ stream: MediaStream; label: string | null }> {
  return defaultDesktopMediaController.getOwner().consumeDesktopStreams();
}

export function detachCachedPreview(): void {
  defaultDesktopMediaController.getOwner().detachCachedPreview();
}

export function disposeMultiSourceDesktopMedia(): void {
  defaultDesktopMediaController.getOwner().disposeMultiSourceDesktopMedia();
}
