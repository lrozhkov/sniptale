import type { QuickAction, QuickActionOrigin } from '../../contracts/settings';
import {
  createBundledQuickAction,
  getBundledQuickActionConfig,
  getBundledQuickActions,
} from './catalog';

function normalizeAfterCapture(action: QuickAction): QuickAction {
  const normalizedAfterCapture =
    (action.afterCapture as string | null) === 'download'
      ? ('download_default' as const)
      : action.afterCapture;

  return {
    ...action,
    ...(normalizedAfterCapture === undefined ? {} : { afterCapture: normalizedAfterCapture }),
  };
}

function toUserQuickAction(action: QuickAction): QuickAction {
  return {
    ...normalizeAfterCapture(action),
    origin: 'user' as QuickActionOrigin,
    bundledId: null,
  };
}

function areQuickActionsEqual(left: QuickAction[], right: QuickAction[]) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function normalizeQuickAction(action: QuickAction): QuickAction {
  const bundledConfig = getBundledQuickActionConfig(action);

  if (!bundledConfig) {
    return toUserQuickAction(action);
  }

  const bundledAction = createBundledQuickAction(bundledConfig);
  return {
    ...bundledAction,
    ...(typeof action.status === 'undefined' ? {} : { status: action.status }),
  };
}

export function mergeStoredQuickActions(storedActions: QuickAction[]) {
  const normalizedActions = storedActions.map(normalizeQuickAction);
  const nextActions = [...normalizedActions];
  const normalizedIds = new Set(normalizedActions.map((action) => action.id));

  for (const bundledAction of getBundledQuickActions()) {
    const alreadyPresent = normalizedIds.has(bundledAction.id);

    if (!alreadyPresent) {
      nextActions.push(bundledAction);
    }
  }

  return {
    actions: nextActions,
    changed:
      !areQuickActionsEqual(normalizedActions, storedActions) ||
      nextActions.length !== normalizedActions.length,
  };
}
