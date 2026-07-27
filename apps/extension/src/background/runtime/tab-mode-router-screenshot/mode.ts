import { browserTabs } from '@sniptale/platform/browser/tabs';
import { translate } from '../../../platform/i18n';
import { createLogger } from '@sniptale/platform/observability/logger';
import { loadSettings } from '../../../composition/persistence/settings';
import { classifyTabRuntimeCapability } from '../../../features/tab-capabilities/runtime';
import { getScreenshotModeCapability } from '../../../features/tab-capabilities/capabilities';
import { TabRuntimeCapability } from '@sniptale/runtime-contracts/tab-capabilities/types';
import {
  armDebuggerActivation,
  attachDebugger,
  clearViewport,
  detachDebugger,
  isDebuggerAttached,
  resetZoom,
  setViewport,
} from '../../diagnostics/lifecycle';
import {
  disablePreparationByCapability,
  enablePreparationByCapability,
} from '../../capture/routes';
import { createWebSnapshotViewerPorts, type WebSnapshotViewerPorts } from '../../capture/lifecycle';
import { resolveDefaultScreenshotViewport } from './helpers';
import { runScreenshotModeOperation } from './operation-queue';
import type {
  ModeState,
  ScreenshotViewport,
  ViewportOwnerState,
  ViewportState,
} from '../../routing-contracts/tab-mode-state';

const logger = createLogger({ namespace: 'BackgroundScreenshotMode' });

type ScreenshotModeCommitGuard = () => boolean | Promise<boolean>;
type ScreenshotModePreparationState = {
  screenshotMode: boolean;
  visible: boolean;
};

type ScreenshotModeEnableEffect = {
  capability: TabRuntimeCapability;
  viewportApply: { wasAttachedBefore: boolean } | null;
};

type ScreenshotModeTransactionArgs = {
  options: {
    commitGuard?: ScreenshotModeCommitGuard;
    readPreparationState?: () => Promise<ScreenshotModePreparationState>;
    toolbarVisible?: boolean;
  };
  screenshotModeState: ModeState;
  tabId: number;
  viewportOwnerState: ViewportOwnerState;
  viewportState: ViewportState;
  webSnapshotViewerPorts: WebSnapshotViewerPorts;
};

type MapEntrySnapshot<T> = { present: false } | { present: true; value: T };

function snapshotMapEntry<T>(state: Map<number, T>, tabId: number): MapEntrySnapshot<T> {
  if (!state.has(tabId)) {
    return { present: false };
  }
  return { present: true, value: state.get(tabId) as T };
}

function restoreMapEntry<T>(
  state: Map<number, T>,
  tabId: number,
  snapshot: MapEntrySnapshot<T>
): void {
  if (snapshot.present) {
    state.set(tabId, snapshot.value);
    return;
  }
  state.delete(tabId);
}

async function notifyScreenshotModeEnabled(
  tabId: number,
  viewport: ScreenshotViewport | undefined,
  ports: WebSnapshotViewerPorts,
  capability: TabRuntimeCapability,
  toolbarVisible?: boolean
): Promise<void> {
  await enablePreparationByCapability({
    capability,
    ports,
    tabId,
    ...(toolbarVisible === undefined ? {} : { toolbarVisible }),
    viewport: viewport ?? null,
  });
}

async function applyViewportPreset(
  tabId: number,
  viewport: Exclude<ScreenshotViewport, null>
): Promise<{ wasAttachedBefore: boolean }> {
  const wasAttachedBefore = await isDebuggerAttached(tabId);
  if (!wasAttachedBefore) {
    await attachDebugger(
      tabId,
      'screenshot',
      armDebuggerActivation({ client: 'screenshot', reason: 'enable-screenshot-mode', tabId })
    );
  }
  await setViewport(tabId, viewport.width, viewport.height);
  await resetZoom(tabId);
  return { wasAttachedBefore };
}

async function rollbackViewportPreset(tabId: number, wasAttachedBefore: boolean): Promise<void> {
  try {
    await clearViewport(tabId);
  } catch (error) {
    logger.warn('Failed to clear viewport after screenshot-mode setup error', error);
  }

  if (wasAttachedBefore) {
    return;
  }

  try {
    await detachDebugger(tabId, 'screenshot');
  } catch (error) {
    logger.warn('Failed to detach debugger after screenshot-mode setup error', error);
  }
}

async function enablePresetScreenshotMode(args: {
  capability: TabRuntimeCapability;
  ports: WebSnapshotViewerPorts;
  tabId: number;
  viewport: Exclude<ScreenshotViewport, null>;
  viewportOwnerState: ViewportOwnerState;
  viewportState: ViewportState;
  toolbarVisible?: boolean;
}): Promise<ScreenshotModeEnableEffect> {
  const viewportApply = await applyViewportPreset(args.tabId, args.viewport);

  try {
    await notifyScreenshotModeEnabled(
      args.tabId,
      args.viewport,
      args.ports,
      args.capability,
      args.toolbarVisible
    );
  } catch (error) {
    args.viewportOwnerState.delete(args.tabId);
    args.viewportState.set(args.tabId, null);
    await rollbackViewportPreset(args.tabId, viewportApply.wasAttachedBefore);
    throw error;
  }

  args.viewportOwnerState.set(args.tabId, 'debugger');
  args.viewportState.set(args.tabId, args.viewport);
  logger.debug('Applied default screenshot viewport preset', {
    tabId: args.tabId,
    viewport: args.viewport,
  });
  return { capability: args.capability, viewportApply };
}

async function enableNativeScreenshotMode(args: {
  capability: TabRuntimeCapability;
  ports: WebSnapshotViewerPorts;
  tabId: number;
  viewportOwnerState: ViewportOwnerState;
  viewportState: ViewportState;
  toolbarVisible?: boolean;
}): Promise<ScreenshotModeEnableEffect> {
  args.viewportOwnerState.delete(args.tabId);
  args.viewportState.set(args.tabId, null);
  await notifyScreenshotModeEnabled(
    args.tabId,
    null,
    args.ports,
    args.capability,
    args.toolbarVisible
  );
  logger.debug('Using native screenshot viewport', { tabId: args.tabId });
  return { capability: args.capability, viewportApply: null };
}

async function rollbackGuardedScreenshotModeEnable(args: {
  effect: ScreenshotModeEnableEffect;
  ports: WebSnapshotViewerPorts;
  previousPreparation: ScreenshotModePreparationState;
  previousViewport: MapEntrySnapshot<ScreenshotViewport>;
  previousViewportOwner: MapEntrySnapshot<'debugger' | 'viewer'>;
  tabId: number;
}): Promise<void> {
  if (args.previousPreparation.screenshotMode) {
    if (args.effect.viewportApply) {
      const previousDebuggerViewport =
        args.previousViewportOwner.present &&
        args.previousViewportOwner.value === 'debugger' &&
        args.previousViewport.present
          ? args.previousViewport.value
          : null;
      if (previousDebuggerViewport) {
        await setViewport(
          args.tabId,
          previousDebuggerViewport.width,
          previousDebuggerViewport.height
        );
        await resetZoom(args.tabId);
      } else {
        await rollbackViewportPreset(args.tabId, args.effect.viewportApply.wasAttachedBefore);
      }
    }

    await notifyScreenshotModeEnabled(
      args.tabId,
      args.previousViewport.present ? args.previousViewport.value : null,
      args.ports,
      args.effect.capability,
      args.previousPreparation.visible
    );
    return;
  }

  let rollbackError: unknown;
  try {
    await disablePreparationByCapability({
      capability: args.effect.capability,
      ports: args.ports,
      tabId: args.tabId,
    });
  } catch (error) {
    rollbackError = error;
    logger.warn('Failed to disable superseded screenshot-mode preparation', error);
  }

  if (args.effect.viewportApply) {
    await rollbackViewportPreset(args.tabId, args.effect.viewportApply.wasAttachedBefore);
  }

  if (rollbackError) {
    throw rollbackError;
  }
}

async function applyScreenshotModeEnable(
  args: ScreenshotModeTransactionArgs
): Promise<ScreenshotModeEnableEffect> {
  const tab = await browserTabs.get(args.tabId);
  const screenshotCapability = getScreenshotModeCapability(tab);
  if (!screenshotCapability.supported) {
    throw new Error(
      screenshotCapability.reason || translate('background.runtime.pagePrepUnavailable')
    );
  }
  const capability = classifyTabRuntimeCapability(tab);
  const defaultViewport = resolveDefaultScreenshotViewport(await loadSettings());
  const shared = {
    capability,
    ports: args.webSnapshotViewerPorts,
    tabId: args.tabId,
    viewportOwnerState: args.viewportOwnerState,
    viewportState: args.viewportState,
    ...(args.options.toolbarVisible === undefined
      ? {}
      : { toolbarVisible: args.options.toolbarVisible }),
  };

  if (defaultViewport && capability === TabRuntimeCapability.Regular) {
    return enablePresetScreenshotMode({ ...shared, viewport: defaultViewport });
  }
  return enableNativeScreenshotMode(shared);
}

async function evaluateCommitGuard(
  commitGuard: ScreenshotModeCommitGuard | undefined
): Promise<{ allowed: boolean; error?: unknown }> {
  if (!commitGuard) {
    return { allowed: true };
  }
  try {
    return { allowed: await commitGuard() };
  } catch (error) {
    return { allowed: false, error };
  }
}

async function commitGuardedScreenshotModeEnable(args: {
  effect: ScreenshotModeEnableEffect;
  guard: ScreenshotModeCommitGuard | undefined;
  previousPreparation: ScreenshotModePreparationState;
  previousScreenshotMode: MapEntrySnapshot<boolean>;
  previousViewport: MapEntrySnapshot<ScreenshotViewport>;
  previousViewportOwner: MapEntrySnapshot<'debugger' | 'viewer'>;
  transaction: ScreenshotModeTransactionArgs;
}): Promise<boolean> {
  const decision = await evaluateCommitGuard(args.guard);
  if (decision.allowed) {
    return true;
  }

  try {
    await rollbackGuardedScreenshotModeEnable({
      effect: args.effect,
      ports: args.transaction.webSnapshotViewerPorts,
      previousPreparation: args.previousPreparation,
      previousViewport: args.previousViewport,
      previousViewportOwner: args.previousViewportOwner,
      tabId: args.transaction.tabId,
    });
  } finally {
    restoreMapEntry(args.transaction.viewportState, args.transaction.tabId, args.previousViewport);
    restoreMapEntry(
      args.transaction.viewportOwnerState,
      args.transaction.tabId,
      args.previousViewportOwner
    );
    restoreMapEntry(
      args.transaction.screenshotModeState,
      args.transaction.tabId,
      args.previousScreenshotMode
    );
  }
  logger.debug('Rolled back superseded screenshot mode enable', {
    tabId: args.transaction.tabId,
  });
  if (decision.error) {
    throw decision.error;
  }
  return false;
}

async function enableScreenshotModeTransaction(
  args: ScreenshotModeTransactionArgs
): Promise<boolean> {
  return runScreenshotModeOperation(args.tabId, async () => {
    const initialDecision = await evaluateCommitGuard(args.options.commitGuard);
    if (!initialDecision.allowed) {
      if (initialDecision.error) {
        throw initialDecision.error;
      }
      return false;
    }

    const previousPreparation = args.options.readPreparationState
      ? await args.options.readPreparationState()
      : {
          screenshotMode: args.screenshotModeState.get(args.tabId) === true,
          visible: args.options.toolbarVisible ?? true,
        };
    const previousScreenshotMode = snapshotMapEntry(args.screenshotModeState, args.tabId);
    const previousViewport = snapshotMapEntry(args.viewportState, args.tabId);
    const previousViewportOwner = snapshotMapEntry(args.viewportOwnerState, args.tabId);
    try {
      const effect = await applyScreenshotModeEnable(args);
      const canCommit = await commitGuardedScreenshotModeEnable({
        effect,
        guard: args.options.commitGuard,
        previousPreparation,
        previousScreenshotMode,
        previousViewport,
        previousViewportOwner,
        transaction: args,
      });
      if (!canCommit) {
        return false;
      }

      args.screenshotModeState.set(args.tabId, true);
      logger.debug('Enabled screenshot mode', { tabId: args.tabId });
      return true;
    } catch (error) {
      logger.error('Failed to enable screenshot mode', error);
      throw error;
    }
  });
}

export async function enableScreenshotMode(
  tabId: number,
  screenshotModeState: ModeState,
  viewportState: ViewportState,
  viewportOwnerState: ViewportOwnerState,
  webSnapshotViewerPorts: WebSnapshotViewerPorts = new Map(),
  options: { toolbarVisible?: boolean } = {}
): Promise<void> {
  await enableScreenshotModeTransaction({
    options,
    screenshotModeState,
    tabId,
    viewportOwnerState,
    viewportState,
    webSnapshotViewerPorts,
  });
}

export function enableScreenshotModeGuarded(
  tabId: number,
  screenshotModeState: ModeState,
  viewportState: ViewportState,
  viewportOwnerState: ViewportOwnerState,
  webSnapshotViewerPorts: WebSnapshotViewerPorts | undefined,
  options: {
    commitGuard: ScreenshotModeCommitGuard;
    readPreparationState?: () => Promise<ScreenshotModePreparationState>;
    toolbarVisible?: boolean;
  }
): Promise<boolean> {
  return enableScreenshotModeTransaction({
    options,
    screenshotModeState,
    tabId,
    viewportOwnerState,
    viewportState,
    webSnapshotViewerPorts: webSnapshotViewerPorts ?? createWebSnapshotViewerPorts(),
  });
}

export async function disableScreenshotMode(
  tabId: number,
  screenshotModeState: ModeState,
  viewportState: ViewportState,
  viewportOwnerState: ViewportOwnerState,
  webSnapshotViewerPorts: WebSnapshotViewerPorts = new Map()
): Promise<void> {
  return runScreenshotModeOperation(tabId, async () => {
    try {
      logger.log('Disabling screenshot mode', { tabId });

      const tab = await browserTabs.get(tabId);
      const capability = classifyTabRuntimeCapability(tab);
      await disablePreparationByCapability({
        capability,
        ports: webSnapshotViewerPorts,
        tabId,
      });

      const viewportOwner = viewportOwnerState.get(tabId) ?? null;
      if (capability === TabRuntimeCapability.Regular && viewportOwner === 'debugger') {
        try {
          await clearViewport(tabId);
        } catch (error) {
          logger.warn('Failed to clear viewport before disabling screenshot mode', error);
        }

        await detachDebugger(tabId, 'screenshot');
      }
      viewportOwnerState.delete(tabId);
      viewportState.delete(tabId);
      screenshotModeState.delete(tabId);
      logger.debug('Disabled screenshot mode', { tabId });
    } catch (error) {
      logger.error('Failed to disable screenshot mode', error);
      throw error;
    }
  });
}
