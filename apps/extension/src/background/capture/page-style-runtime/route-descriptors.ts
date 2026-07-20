import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

export const pageStyleRouteDescriptor = {
  actionKind: 'tab',
  authorityFamily: 'page-style-privileged-tab-route',
  handlerAdapter: 'routeTabAction',
  keepChannelBehaviorSource: 'tab-routing-adapter',
  messageTypes: [
    MessageType.GET_PAGE_STYLE_CURRENT_RULE_SUMMARY,
    MessageType.OPEN_PAGE_STYLE_INSPECTOR,
  ],
  ownerModule: 'apps/extension/src/background/capture/page-style-runtime/route.ts',
} as const;
