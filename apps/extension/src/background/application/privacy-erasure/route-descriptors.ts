import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

export const localDataErasureRouteDescriptor = {
  handlerId: 'local-data-erasure',
  messageTypes: [MessageType.ERASE_LOCAL_EXTENSION_DATA],
  ownerModule: 'apps/extension/src/background/application/privacy-erasure/route.ts',
  policyAuthorityFamily: 'local-data-erasure-authority',
  policyStateIds: [
    'diagnostics-erasure-exclusion',
    'native-ingestion-erasure-exclusion',
    'page-access-tab-activation',
    'persistent-data-erasure-lease',
    'project-export-capabilities',
    'project-export-job-ledger',
    'tab-mode-runtime-state',
    'video-recording-control-lease',
  ],
  routeAuthorityFamily: 'background-owned-ipc',
} as const;
