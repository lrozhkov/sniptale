import type { ScenarioSessionServiceRuntime } from '../runtime/types/index';

type ScenarioSessionServicePendingCaptureApiContext = Pick<
  ScenarioSessionServiceRuntime,
  'bufferPendingCapture' | 'clearPendingCapture' | 'clearPendingCaptureIfCurrent'
>;

export function createScenarioSessionServicePendingCaptureApi(
  runtime: ScenarioSessionServicePendingCaptureApiContext
) {
  return {
    async bufferPendingCapture(
      tabId: number,
      capture: Parameters<ScenarioSessionServiceRuntime['bufferPendingCapture']>[1]
    ) {
      return runtime.bufferPendingCapture(tabId, capture);
    },
    async clearPendingCapture(tabId: number) {
      return runtime.clearPendingCapture(tabId);
    },
    async clearPendingCaptureIfCurrent(
      tabId: number,
      capture: Parameters<ScenarioSessionServiceRuntime['clearPendingCaptureIfCurrent']>[1]
    ) {
      return runtime.clearPendingCaptureIfCurrent(tabId, capture);
    },
  };
}
