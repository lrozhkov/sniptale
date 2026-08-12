import type { QuickAction } from '../../../contracts/settings';
import { browserStorage } from '../infrastructure/browser-storage';
import { createLogger } from '@sniptale/platform/observability/logger';
import {
  getBundledQuickActions,
  isBundledQuickAction,
} from '../../../features/quick-actions-presets/catalog';
import {
  mergeStoredQuickActions,
  normalizeQuickAction,
} from '../../../features/quick-actions-presets/normalization';
import { parseStoredQuickActions } from './guards';

const QUICK_ACTIONS_KEY = 'sniptale_quick_actions';
const logger = createLogger({ namespace: 'SharedQuickActionsStorage' });
let quickActionsMutationQueue = Promise.resolve<void>(undefined);

// Authority contract: the user quick-action list is a serialized whole-list mutation owner.
// Reads parse and normalize only; storage repair or fallback writes must stay in mutation APIs.

function getDefaultQuickActions(): QuickAction[] {
  return getBundledQuickActions();
}

function buildQuickActionsStoragePayload(actions: QuickAction[]) {
  const normalizedActions = actions.map(normalizeQuickAction);

  return {
    [QUICK_ACTIONS_KEY]: normalizedActions,
  };
}

function queueQuickActionsMutation<T>(run: () => Promise<T>): Promise<T> {
  const nextMutation = quickActionsMutationQueue.catch(() => undefined).then(run);
  quickActionsMutationQueue = nextMutation.then(
    () => undefined,
    () => undefined
  );
  return nextMutation;
}

function resolveQuickActionsFromStoragePayload(payload: Record<string, unknown>): QuickAction[] {
  const parsedActions = parseStoredQuickActions(payload[QUICK_ACTIONS_KEY]);
  const actions = parsedActions.actions;

  if (parsedActions.hasInvalidRoot) {
    logger.warn('Ignoring invalid quick actions payload root from storage');
  }

  if (parsedActions.invalidEntryCount > 0) {
    logger.warn('Dropped invalid quick actions from storage', {
      invalidEntryCount: parsedActions.invalidEntryCount,
    });
  }

  if (!actions || actions.length === 0) {
    return getDefaultQuickActions();
  }

  const migrated = mergeStoredQuickActions(actions);
  if (migrated.changed) {
    logger.debug('Loaded quick actions requiring migration; returning normalized actions', {
      count: migrated.actions.length,
    });
  }

  return migrated.actions;
}

/**
 * Gets all quick actions from chrome.storage.local
 * Если действий нет — возвращает bundled defaults без write-on-read
 */
export async function getQuickActions(): Promise<QuickAction[]> {
  const payload = await browserStorage.local.get([QUICK_ACTIONS_KEY]);
  return resolveQuickActionsFromStoragePayload(payload);
}

/**
 * Saves all quick actions to chrome.storage.local
 */
export async function saveQuickActions(actions: QuickAction[]): Promise<void> {
  await queueQuickActionsMutation(async () => {
    await browserStorage.local.set(buildQuickActionsStoragePayload(actions));
    logger.debug('Saved quick actions', { count: actions.length });
  });
}

/**
 * Adds a new quick action
 */
export async function addQuickAction(action: QuickAction): Promise<void> {
  await queueQuickActionsMutation(async () => {
    const actions = [...(await getQuickActions()), action];
    await browserStorage.local.set(buildQuickActionsStoragePayload(actions));
    logger.debug('Saved quick actions', { count: actions.length });
  });
}

/**
 * Updates an existing quick action
 */
export async function updateQuickAction(action: QuickAction): Promise<void> {
  await queueQuickActionsMutation(async () => {
    const actions = await getQuickActions();
    const index = actions.findIndex((current) => current.id === action.id);
    if (index < 0) {
      return;
    }

    const nextActions = [...actions];
    nextActions[index] = action;
    await browserStorage.local.set(buildQuickActionsStoragePayload(nextActions));
    logger.debug('Saved quick actions', { count: nextActions.length });
  });
}

/**
 * Deletes a quick action by ID
 */
export async function deleteQuickAction(id: string): Promise<void> {
  await queueQuickActionsMutation(async () => {
    const actions = await getQuickActions();
    const action = actions.find((candidate) => candidate.id === id);

    if (!action || isBundledQuickAction(action)) {
      return;
    }

    const filtered = actions.filter((candidate) => candidate.id !== id);
    await browserStorage.local.set(buildQuickActionsStoragePayload(filtered));
    logger.debug('Saved quick actions', { count: filtered.length });
  });
}
