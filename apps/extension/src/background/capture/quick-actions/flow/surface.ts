// policyStateId: capture-surface-leases - quick actions borrow and release the canonical capture-surface lease.
import { TabRuntimeCapability } from '@sniptale/runtime-contracts/tab-capabilities/types';
import { loadSettings } from '../../../../composition/persistence/settings';
import { getCaptureSurfaceService } from '../../../capture-surface';
import {
  beginScreenshotSurfaceSession,
  endScreenshotSurfaceSession,
  getScreenshotSurfaceSession,
  markScreenshotSurfaceApplied,
  nextScreenshotSurfaceGeneration,
  setScreenshotSurfaceActiveLeaseGeneration,
} from '../../../capture-surface/screenshot-session';
import type { QuickActionFlowArgs } from './shared';

type QuickActionSurfaceTransaction = {
  appliedLeaseId: string | null;
  ownsSession: boolean;
  priorViewport: ReturnType<QuickActionFlowArgs['viewportState']['get']>;
  surfaceCapabilityToken: string | null;
  viewportState: QuickActionFlowArgs['viewportState'];
  viewer: boolean;
};

const transactions = new Map<number, QuickActionSurfaceTransaction>();

export async function applyQuickActionSurface(
  args: QuickActionFlowArgs
): Promise<{ surfaceCapabilityToken: string | null }> {
  if (transactions.has(args.tabId)) throw new Error('surface-busy');
  const existingSession = getScreenshotSurfaceSession(args.tabId);
  const session = beginScreenshotSurfaceSession(args.tabId);
  const viewer = args.pageCapability === TabRuntimeCapability.OwnedSnapshotViewer;
  const transaction: QuickActionSurfaceTransaction = {
    appliedLeaseId: null,
    ownsSession: existingSession === null,
    priorViewport: args.viewportState.get(args.tabId),
    surfaceCapabilityToken: viewer ? null : session.capabilityToken,
    viewportState: args.viewportState,
    viewer,
  };
  transactions.set(args.tabId, transaction);
  try {
    return await applyQuickActionSurfaceTransaction(args, transaction);
  } catch (error) {
    return releaseQuickActionSurfaceAfterFailure(args.tabId, args.viewportState, error);
  }
}

export async function releaseQuickActionSurfaceAfterFailure(
  tabId: number,
  viewportState: QuickActionFlowArgs['viewportState'],
  cause: unknown
): Promise<never> {
  try {
    await releaseQuickActionSurface(tabId, viewportState);
  } catch (rollbackError) {
    throw new AggregateError(
      [cause, rollbackError],
      'Quick-action surface operation and rollback both failed',
      { cause: rollbackError }
    );
  }
  throw cause;
}

async function applyQuickActionSurfaceTransaction(
  args: QuickActionFlowArgs,
  transaction: QuickActionSurfaceTransaction
): Promise<{ surfaceCapabilityToken: string | null }> {
  const viewer = transaction.viewer;
  if (!args.viewportPresetId) {
    if (transaction.ownsSession) args.viewportState.set(args.tabId, null);
    return { surfaceCapabilityToken: transaction.surfaceCapabilityToken };
  }
  const settings = await loadSettings();
  const preset = settings.viewportPresets.find(
    (candidate) => candidate.id === args.viewportPresetId
  );
  if (!preset) throw new Error('missing');
  if (!preset.enabled) throw new Error('disabled');
  if (viewer) {
    if (preset.target === 'window') throw new Error('unsupported-context');
    args.viewportState.set(args.tabId, {
      presetId: preset.id,
      target: preset.target,
      width: preset.width,
      height: preset.height,
    });
    return { surfaceCapabilityToken: null };
  }
  const availability = await getCaptureSurfaceService().getAvailability({
    tabId: args.tabId,
    presetId: preset.id,
    context: 'quick-action',
  });
  if (availability.status === 'unavailable') throw new Error(availability.reason);
  const generation = nextScreenshotSurfaceGeneration(args.tabId);
  const applied = await getCaptureSurfaceService().apply({
    sessionId: generation.sessionId,
    generation: generation.generation,
    owner: 'quick-action',
    tabId: args.tabId,
    presetId: preset.id,
    context: 'quick-action',
  });
  transaction.appliedLeaseId = applied.leaseId;
  markScreenshotSurfaceApplied(args.tabId, generation.generation);
  args.viewportState.set(args.tabId, {
    presetId: applied.presetId,
    target: applied.target,
    width: applied.width,
    height: applied.height,
  });
  return { surfaceCapabilityToken: transaction.surfaceCapabilityToken };
}

export async function releaseQuickActionSurface(
  tabId: number,
  viewportState?: QuickActionFlowArgs['viewportState']
): Promise<void> {
  const transaction = transactions.get(tabId);
  if (!transaction) return;
  const state = viewportState ?? transaction.viewportState;
  if (!transaction.viewer && transaction.appliedLeaseId !== null) {
    await getCaptureSurfaceService().releaseTabOwners(tabId, ['quick-action']);
    const resumed = getCaptureSurfaceService().getApplied(tabId);
    setScreenshotSurfaceActiveLeaseGeneration(tabId, resumed?.generation ?? null);
  }
  transactions.delete(tabId);
  if (transaction && !transaction.ownsSession) {
    if (transaction.priorViewport === undefined) state?.delete(tabId);
    else state?.set(tabId, transaction.priorViewport);
    return;
  }
  endScreenshotSurfaceSession(tabId);
  state?.delete(tabId);
}

export function getQuickActionSurfaceTransactionTabIds(): number[] {
  return [...transactions.keys()];
}

export function shouldCloseQuickActionTools(tabId: number): boolean {
  return transactions.get(tabId)?.ownsSession === true;
}

export function forgetQuickActionSurfaceTransaction(tabId: number): void {
  transactions.delete(tabId);
}

export function resetQuickActionSurfaceTransactionsForTests(): void {
  transactions.clear();
}
