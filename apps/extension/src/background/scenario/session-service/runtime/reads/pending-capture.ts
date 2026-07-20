import { cloneScenarioSessionState } from '../../helpers';
import type {
  PendingScenarioCapture,
  PendingScenarioCaptureInput,
  ResolvedPendingScenarioCapture,
} from '../../types';
import type { ScenarioSessionServiceCore } from '../types/core';

export function createScenarioSessionServicePendingCaptureApi(core: ScenarioSessionServiceCore) {
  return {
    async bufferPendingCapture(tabId: number, capture: PendingScenarioCaptureInput) {
      return cloneScenarioSessionState(await core.pendingCaptureBridge.buffer(tabId, capture));
    },
    async clearPendingCapture(tabId: number) {
      return cloneScenarioSessionState(await core.pendingCaptureBridge.clear(tabId));
    },
    async clearPendingCaptureIfCurrent(tabId: number, capture: PendingScenarioCapture) {
      return cloneScenarioSessionState(
        await core.pendingCaptureBridge.clearIfCurrent(tabId, capture)
      );
    },
    async consumePendingCapture(tabId: number): Promise<ResolvedPendingScenarioCapture | null> {
      return core.pendingCaptureBridge.consume(tabId);
    },
  };
}
