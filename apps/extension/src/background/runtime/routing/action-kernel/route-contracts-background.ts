import type { ActionRouteContract } from './route-contract-types';

export const BACKGROUND_ACTION_ROUTE_CONTRACTS = {
  'background-owned-ipc': {
    acceptedSenderClass: 'authorized extension page or content runtime selected by owner policy',
    errorShape: 'standard runtime error response with sanitized message',
    freshnessReplayPolicy:
      'owner policy checks sender and route-specific freshness before dispatch',
    requiredAuthority: 'background-owned authorization policy registry entry',
    responseShape: 'owner route response contract',
    sideEffects: 'owner-scoped background storage, AI, privacy, page-access, or runtime effects',
    transitiveStateOwner: 'declared background route owner module',
  },
  'content-action-capability-issuance': {
    acceptedSenderClass:
      'owned content runtime requesting activation-key, runtime-token, proof, or capability issuance',
    errorShape: 'capability issuance error response',
    freshnessReplayPolicy:
      'activation key binds sender and action purpose; runtime token/proof/content intent ' +
      'bind action, request, sender, one-shot use, and expiry',
    requiredAuthority: 'content privileged action capability issuer',
    responseShape:
      'activation key, runtime token, trusted-event proof, or content action capability grant response',
    sideEffects: 'issues one-shot proofs and capabilities without performing the privileged action',
    transitiveStateOwner: 'content privileged action capability store',
  },
  'content-runtime-wakeup': {
    acceptedSenderClass: 'owned top-frame content shim for a page-access tab',
    errorShape: 'content runtime wake-up route error response',
    freshnessReplayPolicy:
      'content sender binding and page-access state are checked before full runtime injection',
    requiredAuthority: 'content runtime wake-up owner policy',
    responseShape: 'wake-up restored flag and optional restore reason',
    sideEffects: 'lazy full content runtime injection and optional page-preparation restore',
    transitiveStateOwner: 'background page-access owner plus scenario session state',
  },
  'internal-signal': {
    acceptedSenderClass: 'background runtime internals',
    errorShape: 'none',
    freshnessReplayPolicy: 'internal service-worker lifecycle only',
    requiredAuthority: 'internal preflight signal',
    responseShape: 'no external response contract',
    sideEffects: 'runtime initialization or lifecycle side effects',
    transitiveStateOwner: 'background runtime wiring owners',
  },
  'page-access-owner': {
    acceptedSenderClass:
      'authorized extension page or content runtime selected by page-access policy',
    errorShape: 'page-access route error response',
    freshnessReplayPolicy: 'tab activation record and tab lifecycle cleanup reject stale access',
    requiredAuthority: 'page-access owner policy',
    responseShape: 'page-access route response',
    sideEffects: 'page-access activation and session-storage authority writes',
    transitiveStateOwner: 'background page-access owner',
  },
  'popup-export-archive-download': {
    acceptedSenderClass: 'popup export runtime with staged archive session authority',
    errorShape: 'popup archive route error response',
    freshnessReplayPolicy:
      'archive session id, staged blob id, chunk order, and byte caps must match',
    requiredAuthority: 'popup export archive staged transfer authority',
    responseShape: 'popup archive staging/save/release response',
    sideEffects: 'staged archive chunk persistence, download creation, and staged cleanup',
    transitiveStateOwner: 'background popup-export archive owner',
  },
  'popup-tab-route-capability-issuance': {
    acceptedSenderClass: 'popup runtime requesting scoped tab-route authority',
    errorShape: 'popup capability issuance error response',
    freshnessReplayPolicy: 'issued capability binds current tab, operation, request id, and expiry',
    requiredAuthority: 'popup tab-route capability issuer',
    responseShape: 'popup tab-route capability grant response',
    sideEffects: 'issues one-shot tab-route capability without performing tab side effects',
    transitiveStateOwner: 'popup tab-route capability store',
  },
  unsupported: {
    acceptedSenderClass: 'none',
    errorShape: 'unsupported action route error response',
    freshnessReplayPolicy: 'unsupported routes fail closed before side effects',
    requiredAuthority: 'none',
    responseShape: 'standard unsupported route failure',
    sideEffects: 'none',
    transitiveStateOwner: 'none',
  },
} as const satisfies Record<string, ActionRouteContract>;
