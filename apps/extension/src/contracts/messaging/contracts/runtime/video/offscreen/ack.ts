import type { RuntimeAckResponse } from '@sniptale/runtime-contracts/messaging/contracts/response';
import { createRuntimeResponseGuard, isRecord, isString } from '../../../../validators/index';

export const offscreenAcceptedAckResponseGuard = createRuntimeResponseGuard<RuntimeAckResponse>({
  allowUndefined: true,
  optional: { result: isString },
});

export function offscreenProjectExportAcceptedResponseGuard(
  value: unknown
): value is RuntimeAckResponse {
  if (!isRecord(value)) {
    return false;
  }

  const fields = Object.keys(value);
  if (value['success'] === true) {
    return fields.length === 2 && fields.includes('result') && value['result'] === 'accepted';
  }

  return (
    value['success'] === false &&
    fields.length === 2 &&
    fields.includes('error') &&
    isString(value['error'])
  );
}
