import type { ErasureParticipantResult } from '@sniptale/runtime-contracts/privacy-erasure/types';

import {
  resetBackgroundRuntimeStateForLocalDataErasure,
  type BackgroundRuntimeState,
} from '../runtime-state';
import { readCaptureSurfaceJournal } from '../../storage/capture-surface';
import { getCaptureSurfaceService } from '../../capture-surface';
import { getScreenshotSurfaceSessionTabIds } from '../../capture-surface/screenshot-session';
import { getQuickActionSurfaceTransactionTabIds } from '../../capture/quick-actions/flow/surface';

export type BackgroundRuntimeScreenshotCleanupPort = {
  disableScreenshotMode(tabId: number, state: BackgroundRuntimeState): Promise<void>;
};

const unavailableScreenshotCleanupPort: BackgroundRuntimeScreenshotCleanupPort = {
  async disableScreenshotMode() {
    throw new Error('Background screenshot cleanup is unavailable');
  },
};

let screenshotCleanupPort = unavailableScreenshotCleanupPort;

export function configureBackgroundRuntimeScreenshotCleanupPort(
  port: BackgroundRuntimeScreenshotCleanupPort
): void {
  screenshotCleanupPort = port;
}

function failed(error: string): readonly ErasureParticipantResult[] {
  return [
    {
      error,
      id: 'background-runtime-state',
      severity: 'required',
      status: 'failed',
    },
  ];
}

export const backgroundRuntimeCleanupAdapter = {
  async cleanup(state: BackgroundRuntimeState): Promise<readonly ErasureParticipantResult[]> {
    const tabIds = new Set([
      ...state.screenshotModeState.keys(),
      ...state.viewportState.keys(),
      ...(state.webSnapshotViewerPorts?.keys() ?? []),
      ...getScreenshotSurfaceSessionTabIds(),
      ...getQuickActionSurfaceTransactionTabIds(),
    ]);
    try {
      for (const tabId of tabIds) {
        await screenshotCleanupPort.disableScreenshotMode(tabId, state);
      }
      const service = getCaptureSurfaceService();
      await service.releaseOwners(['quick-action', 'screenshot']);
      const journal = await readCaptureSurfaceJournal();
      if (
        service.hasOwnerLease('quick-action') ||
        service.hasOwnerLease('screenshot') ||
        journal.some((entry) => entry.owner === 'quick-action' || entry.owner === 'screenshot') ||
        getScreenshotSurfaceSessionTabIds().length > 0 ||
        getQuickActionSurfaceTransactionTabIds().length > 0
      ) {
        return failed('background-capture-surface-verification-failed');
      }
    } catch {
      return failed('background-capture-surface-cleanup-failed');
    }
    resetBackgroundRuntimeStateForLocalDataErasure(state);
    return [
      {
        id: 'background-runtime-state',
        remainingCount: 0,
        severity: 'required',
        status: 'verified-empty',
      },
    ];
  },
};
