import type { CaptureArea } from '@sniptale/runtime-contracts/messaging/capture-messages';
import { createLazyContentDefaultOwner } from '../../application/default-owner';
import { registerContentMode } from '../../application/mode-session';
import { createSelectionModeController } from './controller';
import type { SelectionModeActivationOptions } from './types';

const selectionModeControllerOwner = createLazyContentDefaultOwner(createSelectionModeController);

/**
 * Включает гибридный режим выделения области
 * @returns Promise с координатами выделенной области
 */
export function enableSelectionMode(
  options?: SelectionModeActivationOptions
): Promise<CaptureArea> {
  return selectionModeControllerOwner.getOwner().enableSelectionMode(options);
}

/**
 * Отключает режим выделения области
 */
export function disableSelectionMode(): void {
  selectionModeControllerOwner.getOwnerIfCreated()?.disableSelectionMode();
}

/**
 * Проверяет, активен ли режим выделения
 */
registerContentMode('selection-mode', disableSelectionMode);
