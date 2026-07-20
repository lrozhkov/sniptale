import { browserStorage } from '../../../composition/persistence/infrastructure/browser-storage';
import {
  createTemporaryTabActivationStore,
  type TemporaryTabActivationStore,
} from '../../storage/page-access/tab-activation';
import type { SupportedPageTarget } from './target';

export type { TemporaryTabActivationStore };

export const temporaryTabActivationStore = createTemporaryTabActivationStore({
  storage: browserStorage.session,
});

export async function hasTemporaryTabActivation(target: SupportedPageTarget): Promise<boolean> {
  return temporaryTabActivationStore.has(target);
}

export async function setTemporaryTabActivation(target: SupportedPageTarget): Promise<void> {
  await temporaryTabActivationStore.grant(target);
}

export async function clearPageAccessTabActivation(tabId: number): Promise<void> {
  await temporaryTabActivationStore.clear(tabId);
}
