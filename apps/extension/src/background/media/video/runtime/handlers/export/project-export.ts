import type { VideoProjectExportSettings } from '../../../../../../features/video/project/types';
import type { ProjectExportInputReference } from '../../../../../../contracts/video/types/project-export-input';
import { createLogger } from '@sniptale/platform/observability/logger';
import { respondAsyncRouteWithLogger } from '../../../../../routing-contracts/response';
import type { ResponseSender } from '@sniptale/runtime-contracts/messaging/message-types';
import { type RouteResult } from '../shared';
import {
  cancelProjectExportUseCase,
  getProjectExportCapabilitiesUseCase,
  startProjectExportUseCase,
  type ProjectExportOwnerIdentity,
} from '../../../application/export/use-case';

const logger = createLogger({ namespace: 'BackgroundVideoRuntimeRouterHandlers' });

export function handleStartProjectExport(
  message: {
    input: ProjectExportInputReference;
    jobId: string;
    settings: VideoProjectExportSettings;
  },
  sendResponse: ResponseSender,
  owner: ProjectExportOwnerIdentity
): RouteResult {
  respondAsyncRouteWithLogger({
    work: startProjectExportUseCase(message, owner),
    sendResponse,
    logger,
    failureLogMessage: 'Failed to start project export through background route',
  });
  return { handled: true, keepChannelOpen: true };
}

export function handleGetProjectExportCapabilities(
  message: { jobId?: string; settings: VideoProjectExportSettings },
  sendResponse: ResponseSender,
  owner: ProjectExportOwnerIdentity
): RouteResult {
  respondAsyncRouteWithLogger({
    work: getProjectExportCapabilitiesUseCase(message, owner),
    sendResponse,
    logger,
    failureLogMessage: 'Failed to probe project export capabilities through background route',
  });
  return { handled: true, keepChannelOpen: true };
}

export function handleCancelProjectExport(
  message: { jobId: string },
  sendResponse: ResponseSender
): RouteResult {
  respondAsyncRouteWithLogger({
    work: cancelProjectExportUseCase(message),
    sendResponse,
    logger,
    failureLogMessage: 'Failed to cancel project export through background route',
  });
  return { handled: true, keepChannelOpen: true };
}
