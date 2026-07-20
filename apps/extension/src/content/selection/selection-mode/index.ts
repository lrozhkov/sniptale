import type { CaptureArea } from '@sniptale/runtime-contracts/messaging/capture-messages';
import { createLazyContentDefaultOwner } from '../../application/default-owner';
import { registerContentMode } from '../../application/mode-session';
import { createSelectionModeController } from './controller';

const selectionModeControllerOwner = createLazyContentDefaultOwner(createSelectionModeController);

/**
 * Включает гибридный режим выделения области
 * @returns Promise с координатами выделенной области
 */
export function enableSelectionMode(): Promise<CaptureArea> {
  return selectionModeControllerOwner.getOwner().enableSelectionMode();
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
