import type { ActionRouteMetadata } from './types';

export type ActionRouteContract = Pick<
  ActionRouteMetadata,
  | 'acceptedSenderClass'
  | 'errorShape'
  | 'freshnessReplayPolicy'
  | 'requiredAuthority'
  | 'responseShape'
  | 'sideEffects'
  | 'transitiveStateOwner'
>;
