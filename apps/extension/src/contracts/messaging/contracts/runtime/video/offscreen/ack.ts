import type { RuntimeAckResponse } from '@sniptale/runtime-contracts/messaging/contracts/response';
import { createRuntimeResponseGuard, isString } from '../../../../validators/index';

export const offscreenAcceptedAckResponseGuard = createRuntimeResponseGuard<RuntimeAckResponse>({
  allowUndefined: true,
  optional: { result: isString },
});
