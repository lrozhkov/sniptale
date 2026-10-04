import {
  parseContextMenuTree,
  type ContextMenuTree,
} from '../../../../../contracts/settings/context-menu-layout';
import {
  runWithPersistenceMutationPermit,
  tryRunWithPersistenceMutationPermit,
} from '../../../../../composition/persistence/infrastructure/mutation-barrier';

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

export async function keepPendingContextMenuDraft(tree: ContextMenuTree): Promise<boolean> {
  if (!parseContextMenuTree(tree)) return false;
  const guardExit = (event: BeforeUnloadEvent) => {
    event.preventDefault();
    event.returnValue = '';
  };
  window.addEventListener('beforeunload', guardExit);
  try {
    return Boolean(
      await tryRunWithPersistenceMutationPermit(() => {
        const storage = draftStorage();
        if (!storage) return false;
        storage.setItem(CONTEXT_MENU_PENDING_DRAFT_KEY, JSON.stringify(tree));
        return true;
      })
    );
  } catch {
    return false;
  } finally {
    window.removeEventListener('beforeunload', guardExit);
  }
}

export async function clearPendingContextMenuDraft(expected?: ContextMenuTree): Promise<void> {
  try {
    await runWithPersistenceMutationPermit(() => {
      const storage = draftStorage();
      if (!storage) return;
      if (expected && storage.getItem(CONTEXT_MENU_PENDING_DRAFT_KEY) !== JSON.stringify(expected))
        return;
      storage.removeItem(CONTEXT_MENU_PENDING_DRAFT_KEY);
    });
  } catch {
    // A successful sync write is authoritative even if page-local cleanup is unavailable.
  }
}
