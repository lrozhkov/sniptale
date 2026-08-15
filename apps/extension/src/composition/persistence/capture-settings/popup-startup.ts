import { browserStorage } from '../infrastructure/browser-storage';
import { runWithPersistenceDomainMutationLock } from '../infrastructure/mutation-barrier';
import type {
  PersistedPopupPage,
  PopupStartupSelection,
  PopupStartupState,
} from './popup-startup-contracts';
import { parseStoredPopupStartupState } from './popup-startup-guards';

const POPUP_STARTUP_KEY = 'sniptale_popup_startup';

export type {
  PopupStartupSelection,
  PopupStartupState,
  PopupStartupTarget,
} from './popup-startup-contracts';

export const DEFAULT_POPUP_STARTUP_STATE: PopupStartupState = {
  selection: 'remember-last',
  lastPage: 'menu',
};

export async function loadPopupStartupState(): Promise<PopupStartupState> {
  const stored = await browserStorage.local.get([POPUP_STARTUP_KEY]);
  return {
    ...DEFAULT_POPUP_STARTUP_STATE,
    ...parseStoredPopupStartupState(stored[POPUP_STARTUP_KEY]),
  };
}

async function patchPopupStartupState(
  patch: Partial<PopupStartupState>
): Promise<PopupStartupState> {
  return runWithPersistenceDomainMutationLock('popup-startup', async (permit) => {
    const current = await loadPopupStartupState();
    const next = { ...current, ...patch };
    await browserStorage.local.set({ [POPUP_STARTUP_KEY]: next }, permit);
    return next;
  });
}

export function savePopupStartupSelection(
  selection: PopupStartupSelection
): Promise<PopupStartupState> {
  return patchPopupStartupState({ selection });
}

export function savePopupLastPage(lastPage: PersistedPopupPage): Promise<PopupStartupState> {
  return patchPopupStartupState({ lastPage });
}
