import {
  issueExportHarStartCapability,
  startExportHarSession,
  stopExportHarSession,
} from '../export-har-collector';
import {
  getPreauthorizedHarStartRouteMessage,
  hasPreauthorizedHarStartRouteMessage,
  hasPreauthorizedHarStopRouteMessage,
} from '../export-har-collector/authorization/preauthorization';

export { issueExportHarStartCapability };

export function isExportHarStartPreauthorized(payload: object): boolean {
  return hasPreauthorizedHarStartRouteMessage(payload);
}

export function isExportHarStopPreauthorized(payload: object): boolean {
  return hasPreauthorizedHarStopRouteMessage(payload);
}

export async function startPreauthorizedExportHarSession(
  payload: object,
  sessionId: string,
  tabId: number,
  senderUrl?: string
) {
  const preauthorization = getPreauthorizedHarStartRouteMessage(payload);
  if (!preauthorization) {
    throw new Error('Missing HAR start capability token');
  }
  return startExportHarSession(sessionId, tabId, preauthorization, senderUrl);
}

export async function stopPreauthorizedExportHarSession(
  payload: object,
  sessionId: string,
  tabId: number,
  capabilityToken: string
) {
  if (!hasPreauthorizedHarStopRouteMessage(payload)) {
    throw new Error('Missing HAR capability token');
  }
  return stopExportHarSession(sessionId, tabId, capabilityToken);
}
