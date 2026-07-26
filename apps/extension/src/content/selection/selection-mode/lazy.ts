import type { CaptureArea } from '@sniptale/runtime-contracts/messaging/capture-messages';
import {
  createRetryableModuleLoader,
  preloadModule,
} from '../../platform/module-loader/retryable-module-loader';
import type { SelectionModeActivationOptions } from './types';

type SelectionModeModule = {
  disableSelectionMode: () => void;
  enableSelectionMode: (options?: SelectionModeActivationOptions) => Promise<CaptureArea>;
};

const selectionModeModuleLoader = createRetryableModuleLoader<SelectionModeModule>(
  () => import('.')
);

export function preloadSelectionMode(): Promise<void> {
  return preloadModule(selectionModeModuleLoader);
}

export async function enableSelectionModeDeferred(
  options?: SelectionModeActivationOptions
): Promise<CaptureArea> {
  const { enableSelectionMode } = await selectionModeModuleLoader.load();
  return enableSelectionMode(options);
}

export async function enableSelectionModeDeferredIfCurrent(
  isCurrent: () => boolean,
  options?: SelectionModeActivationOptions
): Promise<CaptureArea> {
  const { enableSelectionMode } = await selectionModeModuleLoader.load();
  if (!isCurrent()) {
    throw new Error('Selection mode activation was superseded.');
  }
  return enableSelectionMode(options);
}

export function disableSelectionModeIfLoaded(): void {
  selectionModeModuleLoader.getLoaded()?.disableSelectionMode();
}
