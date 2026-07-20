import type { ScenarioCaptureStep } from '../../../../../../../features/scenario/contracts/types/project';
import { parseCaptureMetadata } from '../../capture/record';
import { isString } from '../../../../../../../contracts/messaging/validators';
import type { StepBase } from './base';

export function parseCaptureStep(
  value: Record<string, unknown>,
  base: StepBase
): ScenarioCaptureStep | null {
  if (!isString(value['assetId'])) {
    return null;
  }

  const capture = parseCaptureMetadata(value);
  if (!capture.assetId) {
    return null;
  }

  const { assetId, ...captureRest } = capture;

  return {
    ...base,
    kind: 'capture',
    assetId,
    ...captureRest,
  };
}
