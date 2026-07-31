import { browserTabs } from '@sniptale/platform/browser/tabs';
import { createLogger } from '@sniptale/platform/observability/logger';
import { TabRuntimeCapability } from '@sniptale/runtime-contracts/tab-capabilities/types';
import { loadSettings } from '../../../composition/persistence/settings';
import { getScreenshotModeCapability } from '../../../features/tab-capabilities/capabilities';
import { classifyTabRuntimeCapability } from '../../../features/tab-capabilities/runtime';
import { translate } from '../../../platform/i18n';
import {
  disablePreparationByCapability,
  enablePreparationByCapability,
} from '../../capture/routes';
import { createWebSnapshotViewerPorts, type WebSnapshotViewerPorts } from '../../capture/lifecycle';
import { releaseQuickActionSurface } from '../../capture/quick-actions/flow/surface';
import { getCaptureSurfaceService } from '../../capture-surface';
import {
  authorizeScreenshotSurfaceMutation,
  beginScreenshotSurfaceSession,
  bindScreenshotSurfaceSession,
  claimScreenshotModeDisable,
  endScreenshotSurfaceSession,
  getScreenshotSurfaceBinding,
  getScreenshotSurfaceSession,
  markScreenshotSurfaceApplied,
  nextScreenshotSurfaceGeneration,
} from '../../capture-surface/screenshot-session';
import type {
  ModeState,
  ScreenshotViewport,
  ViewportOwnerState,
  ViewportState,
} from '../../routing-contracts/tab-mode-state';
import { runScreenshotModeOperation } from './operation-queue';

const logger = createLogger({ namespace: 'BackgroundScreenshotMode' });

type ScreenshotModeCommitGuard = () => boolean | Promise<boolean>;
type ScreenshotModePreparationState = { screenshotMode: boolean; visible: boolean };
type EnableScreenshotModeArgs = {
  options: {
    commitGuard?: ScreenshotModeCommitGuard;
    readPreparationState?: () => Promise<ScreenshotModePreparationState>;
    surfaceDocumentId?: string;
    toolbarVisible?: boolean;
  };
  screenshotModeState: ModeState;
  tabId: number;
  viewportOwnerState: ViewportOwnerState;
  viewportState: ViewportState;
  webSnapshotViewerPorts: WebSnapshotViewerPorts;
};

type DisableScreenshotModeArgs = {
  screenshotModeState: ModeState;
  tabId: number;
  viewportOwnerState: ViewportOwnerState;
  viewportState: ViewportState;
  webSnapshotViewerPorts: WebSnapshotViewerPorts;
};

async function evaluateGuard(guard?: ScreenshotModeCommitGuard): Promise<boolean> {
  return guard ? guard() : true;
}

async function releaseRegularScreenshotSurface(tabId: number): Promise<void> {
  await getCaptureSurfaceService().releaseTabOwners(tabId, ['screenshot']);
}

async function restoreRegularScreenshotSurfaceAfterFailedTeardown(
  args: DisableScreenshotModeArgs
): Promise<void> {
  const viewport = args.viewportState.get(args.tabId);
  if (!viewport) return;
  const generation = nextScreenshotSurfaceGeneration(args.tabId);
  const applied = await getCaptureSurfaceService().apply({
    context: 'screenshot',
    generation: generation.generation,
    owner: 'screenshot',
    presetId: viewport.presetId,
    sessionId: generation.sessionId,
    tabId: args.tabId,
  });
  markScreenshotSurfaceApplied(args.tabId, generation.generation);
  args.viewportState.set(args.tabId, {
    height: applied.height,
    presetId: applied.presetId,
    target: applied.target,
    width: applied.width,
  });
  args.viewportOwnerState.set(args.tabId, 'capture-surface');
}

async function resolveDefaultSurface(args: {
  capability: TabRuntimeCapability;
  tabId: number;
}): Promise<{ viewport: ScreenshotViewport; warning: string | null }> {
  const settings = await loadSettings();
  const presetId = settings.defaultViewportPresetId;
  if (!presetId) return { viewport: null, warning: null };
  const preset = settings.viewportPresets.find((candidate) => candidate.id === presetId);
  if (!preset?.enabled) {
    return { viewport: null, warning: translate('viewportPresets.messages.defaultUnavailable') };
  }
  if (args.capability === TabRuntimeCapability.OwnedSnapshotViewer) {
    if (preset.target === 'window') {
      return {
        viewport: null,
        warning: translate('viewportPresets.messages.viewerWindowDisabled'),
      };
    }
    return {
      viewport: {
        presetId: preset.id,
        target: 'viewport',
        width: preset.width,
        height: preset.height,
      },
      warning: null,
    };
  }
  const availability = await getCaptureSurfaceService().getAvailability({
    tabId: args.tabId,
    presetId,
    context: 'screenshot',
  });
  if (availability.status === 'unavailable') {
    return { viewport: null, warning: translate('viewportPresets.messages.defaultUnavailable') };
  }
  const session = nextScreenshotSurfaceGeneration(args.tabId);
  const applied = await getCaptureSurfaceService().apply({
    sessionId: session.sessionId,
    generation: session.generation,
    owner: 'screenshot',
    tabId: args.tabId,
    presetId,
    context: 'screenshot',
  });
  markScreenshotSurfaceApplied(args.tabId, session.generation);
  return {
    viewport: {
      presetId: applied.presetId,
      target: applied.target,
      width: applied.width,
      height: applied.height,
    },
    warning: null,
  };
}

async function reenableScreenshotMode(
  args: EnableScreenshotModeArgs,
  capability: TabRuntimeCapability
): Promise<boolean> {
  const session = getScreenshotSurfaceSession(args.tabId);
  if (!session) throw new Error('Screenshot surface session is unavailable');
  if (
    args.options.surfaceDocumentId &&
    !bindScreenshotSurfaceSession({
      documentId: args.options.surfaceDocumentId,
      tabId: args.tabId,
    })
  ) {
    throw new Error('authorization-expired');
  }
  const surfaceBinding = getScreenshotSurfaceBinding(args.tabId);
  if (!surfaceBinding) throw new Error('Screenshot surface binding is unavailable');
  const previous = args.options.readPreparationState
    ? await args.options.readPreparationState()
    : { screenshotMode: true, visible: true };
  const enable = (toolbarVisible: boolean) =>
    enablePreparationByCapability({
      capability,
      ports: args.webSnapshotViewerPorts,
      tabId: args.tabId,
      toolbarVisible,
      viewport: args.viewportState.get(args.tabId) ?? null,
      ...surfaceBinding,
    });
  try {
    await enable(args.options.toolbarVisible ?? previous.visible);
    if (await evaluateGuard(args.options.commitGuard)) return true;
    await enable(previous.visible);
    return false;
  } catch (error) {
    await enable(previous.visible).catch((rollbackError) => {
      logger.error('Failed to restore screenshot preparation state', rollbackError);
    });
    throw error;
  }
}

function commitScreenshotMode(
  args: EnableScreenshotModeArgs,
  capability: TabRuntimeCapability,
  resolved: Awaited<ReturnType<typeof resolveDefaultSurface>>
): void {
  args.screenshotModeState.set(args.tabId, true);
  args.viewportState.set(args.tabId, resolved.viewport);
  if (resolved.viewport) {
    args.viewportOwnerState.set(
      args.tabId,
      capability === TabRuntimeCapability.OwnedSnapshotViewer ? 'viewer' : 'capture-surface'
    );
  } else {
    args.viewportOwnerState.delete(args.tabId);
  }
  if (resolved.warning) logger.warn(resolved.warning, { tabId: args.tabId });
}

async function rollbackUncommittedScreenshotMode(
  args: EnableScreenshotModeArgs,
  capability: TabRuntimeCapability,
  surfaceApplied: boolean
): Promise<unknown[]> {
  const failures: unknown[] = [];
  await disablePreparationByCapability({
    capability,
    ports: args.webSnapshotViewerPorts,
    tabId: args.tabId,
  }).catch((error) => failures.push(error));

  let surfaceReleased = !surfaceApplied;
  if (surfaceApplied) {
    await releaseRegularScreenshotSurface(args.tabId)
      .then(() => {
        surfaceReleased = true;
      })
      .catch((error) => failures.push(error));
  }
  if (surfaceReleased) endScreenshotSurfaceSession(args.tabId);
  return failures;
}

function throwRollbackFailures(primary: unknown, rollbackFailures: unknown[]): never {
  throw new AggregateError(
    [primary, ...rollbackFailures],
    'Screenshot mode operation and rollback both failed'
  );
}

async function enableNewScreenshotMode(
  args: EnableScreenshotModeArgs,
  capability: TabRuntimeCapability
): Promise<boolean> {
  beginScreenshotSurfaceSession(args.tabId);
  if (
    args.options.surfaceDocumentId &&
    !bindScreenshotSurfaceSession({
      documentId: args.options.surfaceDocumentId,
      tabId: args.tabId,
    })
  ) {
    endScreenshotSurfaceSession(args.tabId);
    throw new Error('authorization-expired');
  }
  let surfaceApplied = false;
  let preparationAttempted = false;
  try {
    const resolved = await resolveDefaultSurface({ capability, tabId: args.tabId });
    const surfaceBinding = getScreenshotSurfaceBinding(args.tabId);
    if (!surfaceBinding) throw new Error('Screenshot surface binding is unavailable');
    surfaceApplied = capability === TabRuntimeCapability.Regular && resolved.viewport !== null;
    preparationAttempted = true;
    await enablePreparationByCapability({
      capability,
      ports: args.webSnapshotViewerPorts,
      tabId: args.tabId,
      ...(args.options.toolbarVisible === undefined
        ? {}
        : { toolbarVisible: args.options.toolbarVisible }),
      viewport: resolved.viewport,
      ...surfaceBinding,
      ...(resolved.warning === null ? {} : { surfaceWarning: resolved.warning }),
    });
    if (await evaluateGuard(args.options.commitGuard)) {
      commitScreenshotMode(args, capability, resolved);
      return true;
    }
  } catch (error) {
    if (preparationAttempted || surfaceApplied) {
      const rollbackFailures = await rollbackUncommittedScreenshotMode(
        args,
        capability,
        surfaceApplied
      );
      if (rollbackFailures.length > 0) throwRollbackFailures(error, rollbackFailures);
    } else {
      endScreenshotSurfaceSession(args.tabId);
    }
    throw error;
  }

  const rollbackFailures = await rollbackUncommittedScreenshotMode(
    args,
    capability,
    surfaceApplied
  );
  if (rollbackFailures.length > 0) {
    throw new AggregateError(rollbackFailures, 'Screenshot mode rollback failed');
  }
  return false;
}

async function enableScreenshotModeOperation(args: EnableScreenshotModeArgs): Promise<boolean> {
  if (!(await evaluateGuard(args.options.commitGuard))) return false;
  const tab = await browserTabs.get(args.tabId);
  const screenshotCapability = getScreenshotModeCapability(tab);
  if (!screenshotCapability.supported) {
    throw new Error(
      screenshotCapability.reason || translate('background.runtime.pagePrepUnavailable')
    );
  }
  const capability = classifyTabRuntimeCapability(tab);
  return args.screenshotModeState.get(args.tabId)
    ? reenableScreenshotMode(args, capability)
    : enableNewScreenshotMode(args, capability);
}

export async function enableScreenshotMode(
  tabId: number,
  screenshotModeState: ModeState,
  viewportState: ViewportState,
  viewportOwnerState: ViewportOwnerState,
  webSnapshotViewerPorts: WebSnapshotViewerPorts = new Map(),
  options: { surfaceDocumentId?: string; toolbarVisible?: boolean } = {}
): Promise<void> {
  await runScreenshotModeOperation(tabId, () =>
    enableScreenshotModeOperation({
      options,
      screenshotModeState,
      tabId,
      viewportOwnerState,
      viewportState,
      webSnapshotViewerPorts,
    })
  );
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
  return runScreenshotModeOperation(tabId, () =>
    enableScreenshotModeOperation({
      options,
      screenshotModeState,
      tabId,
      viewportOwnerState,
      viewportState,
      webSnapshotViewerPorts: webSnapshotViewerPorts ?? createWebSnapshotViewerPorts(),
    })
  );
}

export async function disableScreenshotMode(
  tabId: number,
  screenshotModeState: ModeState,
  viewportState: ViewportState,
  viewportOwnerState: ViewportOwnerState,
  webSnapshotViewerPorts: WebSnapshotViewerPorts = new Map()
): Promise<void> {
  return runScreenshotModeOperation(tabId, () =>
    disableScreenshotModeOperation({
      screenshotModeState,
      tabId,
      viewportOwnerState,
      viewportState,
      webSnapshotViewerPorts,
    })
  );
}

async function disableScreenshotModeOperation(args: DisableScreenshotModeArgs): Promise<void> {
  const tab = await browserTabs.get(args.tabId);
  const capability = classifyTabRuntimeCapability(tab);
  if (capability === TabRuntimeCapability.Regular) {
    await releaseQuickActionSurface(args.tabId, args.viewportState);
    await releaseRegularScreenshotSurface(args.tabId);
  }
  try {
    await disablePreparationByCapability({
      capability,
      ports: args.webSnapshotViewerPorts,
      tabId: args.tabId,
    });
  } catch (error) {
    if (capability === TabRuntimeCapability.Regular) {
      try {
        await restoreRegularScreenshotSurfaceAfterFailedTeardown(args);
      } catch (compensationError) {
        throw new AggregateError(
          [error, compensationError],
          'Content teardown and screenshot surface compensation both failed'
        );
      }
    }
    throw error;
  }
  endScreenshotSurfaceSession(args.tabId);
  args.viewportOwnerState.delete(args.tabId);
  args.viewportState.delete(args.tabId);
  args.screenshotModeState.delete(args.tabId);
  logger.debug('Disabled screenshot mode and restored the capture surface', {
    tabId: args.tabId,
  });
}

export async function disableScreenshotModeForContent(
  args: DisableScreenshotModeArgs & {
    leaseGeneration: number | null | undefined;
    operationGeneration: number | undefined;
    senderDocumentId: string | null | undefined;
    surfaceCapabilityToken: string | undefined;
  }
): Promise<void> {
  return runScreenshotModeOperation(args.tabId, async () => {
    const surfaceCapabilityToken = args.surfaceCapabilityToken;
    if (
      !surfaceCapabilityToken ||
      !authorizeScreenshotSurfaceMutation({
        capabilityToken: surfaceCapabilityToken,
        documentId: args.senderDocumentId,
        tabId: args.tabId,
      })
    ) {
      throw new Error('authorization-expired');
    }
    if (
      !claimScreenshotModeDisable({
        capabilityToken: surfaceCapabilityToken,
        documentId: args.senderDocumentId,
        leaseGeneration: args.leaseGeneration,
        operationGeneration: args.operationGeneration,
        tabId: args.tabId,
      })
    ) {
      throw new Error('stale-generation');
    }
    await disableScreenshotModeOperation(args);
  });
}
