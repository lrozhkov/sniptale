import type { CaptureArea } from '@sniptale/runtime-contracts/messaging/capture-messages';
import {
  createRetryableModuleLoader,
  preloadModule,
} from '../../platform/module-loader/retryable-module-loader';

type SelectionModeModule = {
  disableSelectionMode: () => void;
  enableSelectionMode: () => Promise<CaptureArea>;
};

const selectionModeModuleLoader = createRetryableModuleLoader<SelectionModeModule>(
  () => import('.')
);

export function preloadSelectionMode(): Promise<void> {
  return preloadModule(selectionModeModuleLoader);
}

export async function enableSelectionModeDeferred(): Promise<CaptureArea> {
  const { enableSelectionMode } = await selectionModeModuleLoader.load();
  return enableSelectionMode();
}

export async function enableSelectionModeDeferredIfCurrent(
  isCurrent: () => boolean
): Promise<CaptureArea> {
  const { enableSelectionMode } = await selectionModeModuleLoader.load();
  if (!isCurrent()) {
    throw new Error('Selection mode activation was superseded.');
  }
  return enableSelectionMode();
}

export function disableSelectionModeIfLoaded(): void {
  selectionModeModuleLoader.getLoaded()?.disableSelectionMode();
}
