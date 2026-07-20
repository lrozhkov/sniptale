import { getActionRouteMessageTypesByKind } from '../../../apps/extension/src/background/runtime/routing/action-kernel/routes';

export const backgroundTabMessageTypesForRuntimeMessagingTests =
  getActionRouteMessageTypesByKind('tab');

export const videoRuntimeMessageTypesForRuntimeMessagingTests =
  getActionRouteMessageTypesByKind('video-runtime');
