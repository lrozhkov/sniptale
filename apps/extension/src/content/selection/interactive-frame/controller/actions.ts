import { useInteractiveFrameActionHandlers } from './action-handlers';
import type { InteractiveFrameActionParams } from './types';

export function useInteractiveFrameActions(params: InteractiveFrameActionParams) {
  return useInteractiveFrameActionHandlers(params);
}
