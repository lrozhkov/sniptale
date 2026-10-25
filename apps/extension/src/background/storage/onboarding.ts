import { browserTabs } from '@sniptale/platform/browser/tabs';
import { runtimeInfo } from '@sniptale/platform/browser/runtime';
import { browserStorage } from '../../composition/persistence/infrastructure/browser-storage';
import {
  runWithExclusivePersistenceMutationPermit,
  type PersistenceMutationPermit,
} from '../../composition/persistence/infrastructure/mutation-barrier';

const WELCOME_SHOWN_KEY = 'sniptale_welcome_shown';

interface WelcomePresentationDependencies {
  read(): Promise<unknown>;
  mark(permit: PersistenceMutationPermit): Promise<void>;
  clear(permit: PersistenceMutationPermit): Promise<void>;
  open(): Promise<unknown>;
}

const defaultDependencies: WelcomePresentationDependencies = {
  read: async () => (await browserStorage.local.get([WELCOME_SHOWN_KEY]))[WELCOME_SHOWN_KEY],
  mark: (permit) => browserStorage.local.set({ [WELCOME_SHOWN_KEY]: true }, permit),
  clear: (permit) => browserStorage.local.remove([WELCOME_SHOWN_KEY], permit),
  open: () =>
    browserTabs.create({
      url: runtimeInfo.getURL('apps/extension/src/settings/index.html?welcome=1'),
    }),
};

/** Claims first presentation before navigation; worker restart cannot repeat the claim. */
export function presentWelcomeOnce(deps = defaultDependencies): Promise<boolean> {
  return runWithExclusivePersistenceMutationPermit(async (permit) => {
    const shown = await deps.read();
    if (shown === true) return false;
    if (shown !== undefined && shown !== false) throw new Error('welcome-state-unavailable');
    await deps.mark(permit);
    try {
      await deps.open();
    } catch (error) {
      // An observed navigation failure permits a later explicit install attempt.
      await deps.clear(permit);
      throw error;
    }
    return true;
  });
}
