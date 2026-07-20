import { BACKGROUND_ACTION_ROUTE_CONTRACTS } from './route-contracts-background';
import { TAB_ACTION_ROUTE_CONTRACTS } from './route-contracts-tab';
import type { ActionRouteContract } from './route-contract-types';
import { VIDEO_ACTION_ROUTE_CONTRACTS } from './route-contracts-video';
import type { ActionRouteAuthorityFamily } from './types';

const routeContracts = {
  ...BACKGROUND_ACTION_ROUTE_CONTRACTS,
  ...TAB_ACTION_ROUTE_CONTRACTS,
  ...VIDEO_ACTION_ROUTE_CONTRACTS,
} as const satisfies Record<ActionRouteAuthorityFamily, ActionRouteContract>;

export function getActionRouteContract(
  authorityFamily: ActionRouteAuthorityFamily
): ActionRouteContract {
  return routeContracts[authorityFamily];
}
