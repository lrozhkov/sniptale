import { pageStyleRouteDescriptor } from '../../../capture/page-style-runtime/route-descriptors';
import {
  captureActionsRouteDescriptor,
  captureDownloadRouteDescriptor,
  captureExportRouteDescriptor,
  gallerySaveRouteDescriptor,
  galleryUpdateCapabilityIssuanceRouteDescriptor,
  galleryUpdateCapabilityRouteDescriptor,
  quickActionRouteDescriptor,
  webSnapshotRouteDescriptor,
} from '../../../capture/routing/route-descriptors';
import { videoControlRouteDescriptor } from '../../../media/video/runtime/manager/route-descriptors';
import { scenarioRouteDescriptor } from '../../../scenario/router/route-descriptors';
import { tabModeRouteDescriptor } from '../../tab-mode-router/route-descriptors';
import { popupExportTabRouteDescriptor } from '../boundary/popup-export-route-descriptors';
import type { ActionRouteGroup } from './route-group-types';

export const tabRouteGroups = [
  tabModeRouteDescriptor,
  pageStyleRouteDescriptor,
  scenarioRouteDescriptor,
  popupExportTabRouteDescriptor,
  captureActionsRouteDescriptor,
  quickActionRouteDescriptor,
  captureDownloadRouteDescriptor,
  captureExportRouteDescriptor,
  gallerySaveRouteDescriptor,
  webSnapshotRouteDescriptor,
  galleryUpdateCapabilityIssuanceRouteDescriptor,
  galleryUpdateCapabilityRouteDescriptor,
  videoControlRouteDescriptor,
] as const satisfies readonly ActionRouteGroup[];
