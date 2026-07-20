import { browserTabs } from '@sniptale/platform/browser/tabs';
import type {
  RegionSelectedMessage,
  RegionSelectionCancelledMessage,
  ShowRegionSelectorMessage,
} from '../../../../contracts/video/types/messages';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';

type RegionSelectionResultMessage = RegionSelectedMessage | RegionSelectionCancelledMessage;

export type RegionSelectionRequestBinding = Pick<
  ShowRegionSelectorMessage,
  'regionSelectionCapabilityToken' | 'regionSelectionRequestGeneration' | 'regionSelectionRequestId'
> & {
  documentId?: string;
  expiresAtMs: number;
  frameId: number;
  senderUrl?: string;
  tabId: number;
};

const REGION_SELECTION_REQUEST_TTL_MS = 60000;
const TOP_LEVEL_FRAME_ID = 0;

function createRegionSelectionRequestToken(): string {
  const randomUUID = globalThis.crypto?.randomUUID;
  if (!randomUUID) {
    throw new Error('Region selection request token generation is unavailable.');
  }
  return randomUUID.call(globalThis.crypto);
}

export async function createRegionSelectionRequestBinding(
  tabId: number,
  nowMs = Date.now()
): Promise<RegionSelectionRequestBinding> {
  const tab = await browserTabs.get(tabId).catch(() => null);
  return {
    regionSelectionCapabilityToken: createRegionSelectionRequestToken(),
    regionSelectionRequestGeneration: createRegionSelectionRequestToken(),
    regionSelectionRequestId: createRegionSelectionRequestToken(),
    expiresAtMs: nowMs + REGION_SELECTION_REQUEST_TTL_MS,
    frameId: TOP_LEVEL_FRAME_ID,
    ...(tab?.url === undefined ? {} : { senderUrl: tab.url }),
    tabId,
  };
}

export function toShowRegionSelectorMessage(
  binding: RegionSelectionRequestBinding
): ShowRegionSelectorMessage {
  return {
    type: VideoMessageType.SHOW_REGION_SELECTOR,
    regionSelectionCapabilityToken: binding.regionSelectionCapabilityToken,
    regionSelectionRequestGeneration: binding.regionSelectionRequestGeneration,
    regionSelectionRequestId: binding.regionSelectionRequestId,
  };
}

export function isRegionSelectionResultForRequest(
  message: RegionSelectionResultMessage,
  binding: RegionSelectionRequestBinding,
  nowMs = Date.now()
): boolean {
  return (
    nowMs <= binding.expiresAtMs &&
    message.regionSelectionCapabilityToken === binding.regionSelectionCapabilityToken &&
    message.regionSelectionRequestGeneration === binding.regionSelectionRequestGeneration &&
    message.regionSelectionRequestId === binding.regionSelectionRequestId
  );
}

export function isRegionSelectionSenderForRequest(
  sender: chrome.runtime.MessageSender,
  binding: RegionSelectionRequestBinding
): boolean {
  if (sender.tab?.id !== binding.tabId || sender.frameId !== binding.frameId) {
    return false;
  }

  if (binding.documentId !== undefined && sender.documentId !== binding.documentId) {
    return false;
  }

  if (binding.senderUrl !== undefined && sender.url !== binding.senderUrl) {
    return false;
  }

  return true;
}
