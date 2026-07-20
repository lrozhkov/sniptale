import {
  CaptureMode,
  type VideoViewportPresetSelection,
} from '@sniptale/runtime-contracts/video/types/types';
import { defaultViewportSetupDeps, type ViewportSetupDeps } from './transport.deps';

export async function buildViewportEmulationResult(
  tabId: number,
  captureMode: CaptureMode,
  viewportPreset?: VideoViewportPresetSelection,
  deps: ViewportSetupDeps = defaultViewportSetupDeps
) {
  if (captureMode !== CaptureMode.VIEWPORT_EMULATION || !viewportPreset) {
    return undefined;
  }

  const result = await configureViewportEmulationSafe(tabId, captureMode, viewportPreset, deps);
  if (result === null) {
    return null;
  }
  if (deps.abortStart(tabId, captureMode, 'viewport emulation setup')) {
    await deps.cleanupViewportEmulation(tabId, 'viewport emulation setup cancelled');
    return null;
  }
  return result;
}

async function configureViewportEmulationSafe(
  tabId: number,
  captureMode: CaptureMode,
  viewportPreset: VideoViewportPresetSelection,
  deps: Pick<ViewportSetupDeps, 'configureViewportEmulation' | 'notifyStartFailed'>
) {
  try {
    return await deps.configureViewportEmulation(tabId, captureMode, viewportPreset);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    deps.notifyStartFailed(errorMessage);
    return null;
  }
}
