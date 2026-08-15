import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

export const localDataErasureRouteDescriptor = {
  handlerId: 'local-data-erasure',
  messageTypes: [MessageType.ERASE_LOCAL_EXTENSION_DATA],
  ownerModule: 'apps/extension/src/background/application/privacy-erasure/route.ts',
  policyAuthorityFamily: 'local-data-erasure-authority',
  policyStateIds: [
    'diagnostics-erasure-exclusion',
    'native-ingestion-erasure-exclusion',
    'offscreen-command-capability-generations',
    'offscreen-media-activity-lease',
    'page-access-tab-activation',
    'persistent-data-erasure-lease',
    'popup-export-erasure-exclusion',
    'project-export-capabilities',
    'project-export-job-ledger',
    'tab-mode-runtime-state',
    'video-recording-control-lease',
    'voice-input-port-session-authority',
  ],
  routeAuthorityFamily: 'background-owned-ipc',
} as const;
