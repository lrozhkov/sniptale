import type { PendingScenarioCapture, ResolvedPendingScenarioCapture } from '../../../types';
import type { ScenarioSessionServiceCore } from '../../types/core';

export function createPendingCaptureSnapshotApi(core: ScenarioSessionServiceCore) {
  return {
    async consumePendingCapture(tabId: number): Promise<ResolvedPendingScenarioCapture | null> {
      return core.pendingCaptureBridge.consume(tabId);
    },
    getPendingCapture(tabId: number): PendingScenarioCapture | null {
      return core.pendingCaptureBridge.get(tabId);
    },
    hasPendingCapture(tabId: number): boolean {
      return core.pendingCaptureBridge.has(tabId);
    },
    async resolvePendingCapture(tabId: number): Promise<ResolvedPendingScenarioCapture | null> {
      return core.pendingCaptureBridge.resolve(tabId);
    },
  };
}
