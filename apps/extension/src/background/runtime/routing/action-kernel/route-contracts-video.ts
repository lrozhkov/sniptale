import type { ActionRouteContract } from './route-contract-types';

export const VIDEO_ACTION_ROUTE_CONTRACTS = {
  'diagnostic-content-runtime': {
    acceptedSenderClass: 'owned content runtime for diagnostics events',
    errorShape: 'diagnostics route error response',
    freshnessReplayPolicy: 'sender tab authority and diagnostics session identity gate writes',
    requiredAuthority: 'diagnostic content runtime sender policy',
    responseShape: 'diagnostics event acknowledgement',
    sideEffects: 'sanitized diagnostics event persistence or session update',
    transitiveStateOwner: 'background diagnostics owner',
  },
  'offscreen-runtime-capability': {
    acceptedSenderClass: 'authorized offscreen document or background video owner',
    errorShape: 'video runtime error response',
    freshnessReplayPolicy:
      'offscreen capability, runtime generation, and command idempotency gate writes',
    requiredAuthority: 'offscreen runtime sender capability',
    responseShape: 'video runtime route response',
    sideEffects: 'recording, project export, download, or offscreen lifecycle state mutation',
    transitiveStateOwner: 'background video runtime and offscreen runtime owners',
  },
  'project-export-capability': {
    acceptedSenderClass: 'video editor owner presenting project-export start/cancel authority',
    errorShape: 'project export authorization or route error response',
    freshnessReplayPolicy: 'capability binds job, project, owner document/url, purpose, and TTL',
    requiredAuthority: 'project export start/cancel preauthorization',
    responseShape: 'project export start/cancel route response',
    sideEffects: 'project export ledger reservation, offscreen export start, or cancel request',
    transitiveStateOwner: 'video export ledger and project-export handler owners',
  },
  'project-export-capability-issuance': {
    acceptedSenderClass: 'video editor owner requesting project-export capabilities',
    errorShape: 'project export capability issuance error response',
    freshnessReplayPolicy: 'active ledger owner and requested project/job identity gate issuance',
    requiredAuthority: 'project export capability issuer',
    responseShape: 'project export capability grant response',
    sideEffects: 'issues or reissues owner-scoped project export controls',
    transitiveStateOwner: 'video export ledger capability owner',
  },
  'video-runtime-owner-policy': {
    acceptedSenderClass: 'video editor owner, background video owner, or authorized runtime sender',
    errorShape: 'video runtime route error response',
    freshnessReplayPolicy:
      'video runtime owner policy and recording/export ids reject stale messages',
    requiredAuthority: 'video runtime owner policy',
    responseShape: 'video runtime route response',
    sideEffects: 'video runtime state reads, capture source handoff, or owner-local state changes',
    transitiveStateOwner: 'background video runtime owner',
  },
} as const satisfies Record<string, ActionRouteContract>;
