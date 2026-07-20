import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

export const tabModeRouteDescriptor = {
  actionKind: 'tab',
  authorityFamily: 'tab-mode-privileged-tab-route',
  handlerAdapter: 'routeTabAction',
  keepChannelBehaviorSource: 'tab-routing-adapter',
  messageTypes: [
    MessageType.ENABLE_SCREENSHOT_MODE,
    MessageType.DISABLE_SCREENSHOT_MODE,
    MessageType.SCREENSHOT_MODE_STATUS,
    MessageType.ENABLE_HIGHLIGHTER_MODE,
    MessageType.DISABLE_HIGHLIGHTER_MODE,
    MessageType.HIGHLIGHTER_MODE_STATUS,
    MessageType.ENABLE_QUICK_EDIT_MODE,
    MessageType.DISABLE_QUICK_EDIT_MODE,
    MessageType.QUICK_EDIT_MODE_STATUS,
    MessageType.SET_VIEWPORT,
    MessageType.GET_VIEWPORT_STATUS,
  ],
  ownerModule: 'apps/extension/src/background/runtime/tab-mode-router/index.ts',
} as const;
