import {
  bufferPendingCaptureState,
  clearPendingCaptureState,
  consumePendingCaptureState,
  resolvePendingCaptureState,
  type ScenarioSessionPendingCaptureContext,
} from './pending-state';
import type {
  PendingScenarioCapture,
  PendingScenarioCaptureInput,
  ResolvedPendingScenarioCapture,
} from './types';

export type { ScenarioSessionPendingCaptureContext } from './pending-state';

export type ScenarioSessionPendingCaptureBridge = ReturnType<
  typeof createScenarioSessionPendingCaptureBridge
>;

export function createScenarioSessionPendingCaptureBridge(
  context: ScenarioSessionPendingCaptureContext
) {
  return {
    buffer(tabId: number, capture: PendingScenarioCaptureInput) {
      return bufferPendingCaptureState(context, tabId, capture);
    },
    clear(tabId: number) {
      return clearPendingCaptureState(context, tabId);
    },
    clearIfCurrent(tabId: number, capture: PendingScenarioCapture) {
      return clearPendingCaptureState(context, tabId, capture);
    },
    consume(tabId: number): Promise<ResolvedPendingScenarioCapture | null> {
      return consumePendingCaptureState(context, tabId);
    },
    get(tabId: number): PendingScenarioCapture | null {
      return context.pendingCaptures.get(tabId) ?? null;
    },
    has(tabId: number): boolean {
      return context.pendingCaptures.has(tabId);
    },
    resolve(tabId: number): Promise<ResolvedPendingScenarioCapture | null> {
      return resolvePendingCaptureState(context, tabId);
    },
  };
}
