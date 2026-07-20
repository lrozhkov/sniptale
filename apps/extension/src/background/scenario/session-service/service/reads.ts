import type { ScenarioSessionServiceRuntime } from '../runtime/types/index';

type ScenarioSessionServiceReadsApiContext = Pick<
  ScenarioSessionServiceRuntime,
  | 'consumePendingCapture'
  | 'getPendingCapture'
  | 'getRestoreSnapshot'
  | 'getSession'
  | 'hasPendingCapture'
  | 'resolvePendingCapture'
>;

export function createScenarioSessionServiceReadsApi(
  runtime: ScenarioSessionServiceReadsApiContext
) {
  return {
    async consumePendingCapture(tabId: number) {
      return runtime.consumePendingCapture(tabId);
    },
    getPendingCapture(tabId: number) {
      return runtime.getPendingCapture(tabId);
    },
    async getRestoreSnapshot(tabId: number, projectRevision: number) {
      return runtime.getRestoreSnapshot(tabId, projectRevision);
    },
    async getSession(tabId: number) {
      return runtime.getSession(tabId);
    },
    hasPendingCapture(tabId: number) {
      return runtime.hasPendingCapture(tabId);
    },
    async resolvePendingCapture(tabId: number) {
      return runtime.resolvePendingCapture(tabId);
    },
  };
}
