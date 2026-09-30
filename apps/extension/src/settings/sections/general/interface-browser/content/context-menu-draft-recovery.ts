import {
  parseContextMenuTree,
  type ContextMenuTree,
} from '../../../../../contracts/settings/context-menu-layout';

export const CONTEXT_MENU_PENDING_DRAFT_KEY = 'sniptale.context-menu.pending-layout';

function draftStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readPendingContextMenuDraft(): ContextMenuTree | null {
  try {
    const raw = draftStorage()?.getItem(CONTEXT_MENU_PENDING_DRAFT_KEY);
    return raw ? parseContextMenuTree(JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

export function keepPendingContextMenuDraft(tree: ContextMenuTree): boolean {
  if (!parseContextMenuTree(tree)) return false;
  try {
    const storage = draftStorage();
    if (!storage) return false;
    storage.setItem(CONTEXT_MENU_PENDING_DRAFT_KEY, JSON.stringify(tree));
    return true;
  } catch {
    return false;
  }
}

export function clearPendingContextMenuDraft(expected?: ContextMenuTree): void {
  try {
    const storage = draftStorage();
    if (!storage) return;
    if (expected && storage.getItem(CONTEXT_MENU_PENDING_DRAFT_KEY) !== JSON.stringify(expected))
      return;
    storage.removeItem(CONTEXT_MENU_PENDING_DRAFT_KEY);
  } catch {
    // A successful sync write is authoritative even if page-local cleanup is unavailable.
  }
}
