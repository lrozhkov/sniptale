import { diagnosticContentRuntimeRouteDescriptor } from '../../../diagnostics/route-descriptors';
import {
  projectExportCapabilityIssuanceRouteDescriptor,
  projectExportCommandRouteDescriptor,
  recordingDownloadRouteDescriptor,
} from '../../../media/video/runtime/handlers/export/route-descriptors';
import {
  captureSourceObtainedRouteDescriptor,
  offscreenLifecycleRouteDescriptor,
  projectExportLifecycleRouteDescriptor,
  videoRuntimeStateRouteDescriptor,
} from '../../../media/video/runtime/handlers/state/route-descriptors';
import type { ActionRouteGroup } from './route-group-types';

export const videoRuntimeRouteGroups = [
  videoRuntimeStateRouteDescriptor,
  offscreenLifecycleRouteDescriptor,
  captureSourceObtainedRouteDescriptor,
  projectExportCommandRouteDescriptor,
  projectExportCapabilityIssuanceRouteDescriptor,
  projectExportLifecycleRouteDescriptor,
  recordingDownloadRouteDescriptor,
  diagnosticContentRuntimeRouteDescriptor,
] as const satisfies readonly ActionRouteGroup[];
