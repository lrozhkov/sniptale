import {
  llmContentProcessingRouteDescriptor,
  llmScenarioEditorProcessingRouteDescriptor,
  llmSessionRouteDescriptor,
} from '../../../ai/llm/route-descriptors';
import {
  aiSecretUnlockRouteDescriptor,
  aiSettingsMutationRouteDescriptor,
  aiSettingsQueryRouteDescriptor,
} from '../../../ai/settings/route-descriptors';
import { popupExportArchiveRouteDescriptor } from '../../../capture/popup-export/route-descriptors';
import { localDataErasureRouteDescriptor } from '../../../application/privacy-erasure/route-descriptors';
import { nativeAppRouteDescriptor } from '../../native-app/route-descriptors';
import { contentActionRouteDescriptor } from '../../../routing-contracts/capabilities/content-action/route-descriptors';
import type { BackgroundOwnedRouteInventoryEntry } from '../../../routing-contracts/owned-route-context';
import { pageAccessRouteDescriptor } from '../../page-access/route-descriptors';
import { contentRuntimeWakeupRouteDescriptor } from '../../page-access/wakeup-route-descriptors';
import { popupTabRouteCapabilityIssuanceDescriptor } from '../capabilities/popup-tab/route-descriptors';
import type { BackgroundOwnedRouteDescriptor } from './route-descriptors';

export const backgroundOwnedRouteInventory = [
  llmSessionRouteDescriptor,
  aiSettingsQueryRouteDescriptor,
  aiSettingsMutationRouteDescriptor,
  aiSecretUnlockRouteDescriptor,
  nativeAppRouteDescriptor,
  pageAccessRouteDescriptor,
  contentRuntimeWakeupRouteDescriptor,
  localDataErasureRouteDescriptor,
  popupExportArchiveRouteDescriptor,
  llmContentProcessingRouteDescriptor,
  llmScenarioEditorProcessingRouteDescriptor,
  popupTabRouteCapabilityIssuanceDescriptor,
  contentActionRouteDescriptor,
] as const satisfies readonly BackgroundOwnedRouteDescriptor[];

export function getBackgroundOwnedRouteInventoryEntry(
  messageType: string
): BackgroundOwnedRouteInventoryEntry | undefined {
  return backgroundOwnedRouteInventory.find((entry) =>
    entry.messageTypes.some((entryMessageType) => entryMessageType === messageType)
  );
}
