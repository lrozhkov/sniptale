import type {
  BackgroundIngressNonActionData,
  BackgroundIngressRouteGroupData,
} from './background-ingress.types';
import { backgroundIngressBackgroundOwnedRouteGroups } from './background-ingress.background-owned.data';
import { backgroundIngressTabRouteGroups } from './background-ingress.tab.data';
import { backgroundIngressVideoRouteGroups } from './background-ingress.video-runtime.data';

export const backgroundIngressRouteGroups = [
  ...backgroundIngressBackgroundOwnedRouteGroups,
  ...backgroundIngressTabRouteGroups,
  ...backgroundIngressVideoRouteGroups,
] as const satisfies readonly BackgroundIngressRouteGroupData[];

export const backgroundIngressNonActionData = [
  {
    boundary: 'background-runtime',
    classification: 'content-runtime-event',
    disposition: 'unknown',
    type: 'AREA_SELECTED',
  },
  {
    boundary: 'background-runtime',
    classification: 'internal-signal',
    disposition: 'internal-signal',
    type: 'COUNTDOWN_COMPLETE',
  },
  {
    boundary: 'background-runtime',
    classification: 'outbound-offscreen-command',
    disposition: 'unknown',
    type: 'DISPOSE_DESKTOP_MEDIA',
  },
  {
    boundary: 'background-runtime',
    classification: 'internal-signal',
    disposition: 'internal-signal',
    type: 'KEEP_ALIVE',
  },
  {
    boundary: 'background-runtime',
    classification: 'content-runtime-event',
    disposition: 'internal-signal',
    type: 'REGION_SELECTED',
  },
  {
    boundary: 'background-runtime',
    classification: 'content-runtime-event',
    disposition: 'internal-signal',
    type: 'REGION_SELECTION_CANCELLED',
  },
] as const satisfies readonly BackgroundIngressNonActionData[];
