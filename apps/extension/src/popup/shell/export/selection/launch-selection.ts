import type { PopupExportSelection } from '../session/types';

// policyStateIds: [] - this popup-local, one-shot UI handoff is not privileged authority;
// popup teardown discards it and the export owner independently validates the final request.

type PopupExportLaunchSelection = Partial<PopupExportSelection>;

let pendingLaunchSelection: PopupExportLaunchSelection | null = null;

export function stagePopupExportLaunchSelection(selection: PopupExportLaunchSelection): void {
  pendingLaunchSelection = { ...selection };
}

export function consumePopupExportLaunchSelection(): PopupExportLaunchSelection | null {
  const selection = pendingLaunchSelection;
  pendingLaunchSelection = null;
  return selection;
}

export function resetPopupExportLaunchSelectionForTests(): void {
  pendingLaunchSelection = null;
}
