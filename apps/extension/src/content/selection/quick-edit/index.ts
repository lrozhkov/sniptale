import { createLazyContentDefaultOwner } from '../../application/default-owner';
import { registerContentMode } from '../../application/mode-session';
import { createQuickEditController } from './controller';
import { subscribeToQuickEditDocumentModeChanges } from '../quick-edit-runtime/document-mode.history';

const quickEditControllerOwner = createLazyContentDefaultOwner(createQuickEditController);

export function enableQuickEditMode(): void {
  quickEditControllerOwner.getOwner().enableMode();
}

export function disableQuickEditMode(): void {
  quickEditControllerOwner.getOwnerIfCreated()?.disableMode();
}

export function enableQuickEditDocumentMode(): void {
  quickEditControllerOwner.getOwnerIfCreated()?.enableDocumentMode();
}

export function disableQuickEditDocumentMode(): void {
  quickEditControllerOwner.getOwnerIfCreated()?.disableDocumentMode();
}

export function isQuickEditDocumentModeEnabled(): boolean {
  return quickEditControllerOwner.getOwnerIfCreated()?.isDocumentModeEnabled() ?? false;
}

export function hasPendingQuickEditDocumentModeChanges(): boolean {
  return quickEditControllerOwner.getOwnerIfCreated()?.hasPendingDocumentModeChanges() ?? false;
}

export { subscribeToQuickEditDocumentModeChanges };

registerContentMode('quick-edit', disableQuickEditMode);
