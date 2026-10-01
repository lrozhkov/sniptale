import { createLazyContentDefaultOwner } from '../../application/default-owner';
import { registerContentMode } from '../../application/mode-session';
import { createQuickEditController } from './controller';
import { subscribeToQuickEditChanges } from '../quick-edit-runtime/history-changes';

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

export { subscribeToQuickEditChanges };

registerContentMode('quick-edit', disableQuickEditMode);

/** Pending inline content stays editable when focus moves into owned toolbars. */
export function hasPendingQuickEditElementChanges(): boolean {
  const editing = quickEditControllerOwner.getOwnerIfCreated()?.getEditingElements();
  return [...(editing?.values() ?? [])].some(
    ({ element, originalInnerHTML }) =>
      element.isConnected && element.innerHTML !== originalInnerHTML
  );
}

export function finalizeQuickEditElementChanges(): void {
  quickEditControllerOwner.getOwnerIfCreated()?.finishPendingElementChanges();
}
