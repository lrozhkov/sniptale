import { translate } from '../../../platform/i18n';
import { showToast } from '@sniptale/ui/product-feedback/toast-service';
import type { CaptureResponse } from '../../../contracts/messaging/contracts/response-types';
import type { ScenarioRuntimeCapturePayload } from '../../../contracts/messaging/contracts/types';
import { buildScreenshotFilename as generateFilename } from '@sniptale/foundation/utils/screenshot-filename';
import { saveScenarioCaptureStep } from '../../../content/overlay/scenario/runtime/transport/steps';
import type { ScenarioAutoClickCaptureTransport, ScreenshotCaptureAdapter } from './types';

export function createPreparationScenarioAutoClickCaptureTransport(
  captureAdapter: ScreenshotCaptureAdapter
): ScenarioAutoClickCaptureTransport {
  return async (payload: ScenarioRuntimeCapturePayload): Promise<CaptureResponse> => {
    const dataUrl = await captureAdapter.captureViewport('visible');
    const response = await saveScenarioCaptureStep({
      dataUrl,
      filename: generateFilename(payload.captureSurface),
      scenarioCapture: payload,
    });

    if (response?.success) {
      return { success: true, dataUrl };
    }

    const error = response?.error || translate('scenario.content.captureSaveError');
    showToast(error, 'error');
    return { success: false, error };
  };
}
