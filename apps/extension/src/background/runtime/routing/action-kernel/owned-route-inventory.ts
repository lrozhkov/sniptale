import {
  llmContentProcessingRouteDescriptor,
  llmScenarioEditorProcessingRouteDescriptor,
  llmSessionRouteDescriptor,
} from '../../../ai/llm/route-descriptors';
import {
  aiSecretUnlockRouteDescriptor,
  aiSettingsNavigationRouteDescriptor,
  aiSettingsMutationRouteDescriptor,
  aiSettingsQueryRouteDescriptor,
} from '../../../ai/settings/route-descriptors';
import { popupExportJobRouteDescriptor } from '../../../capture/popup-export/job/route-descriptors';
import { localDataErasureRouteDescriptor } from '../../../application/privacy-erasure/route-descriptors';
import { settingsTransferRouteDescriptor } from '../../../application/settings-transfer/route-descriptors';
import { nativeAppRouteDescriptor } from '../../native-app/route-descriptors';
import { contentActionRouteDescriptor } from '../../../routing-contracts/capabilities/content-action/route-descriptors';
import type { BackgroundOwnedRouteInventoryEntry } from '../../../routing-contracts/owned-route-context';
import { pageAccessRouteDescriptor } from '../../../page-access/route-descriptors';
import { contentRuntimeWakeupRouteDescriptor } from '../../page-access/wakeup-route-descriptors';
import { popupTabRouteCapabilityIssuanceDescriptor } from '../capabilities/popup-tab/route-descriptors';
import type { BackgroundOwnedRouteDescriptor } from './route-descriptors';
import { voiceInputOffscreenEventRouteDescriptor } from '../../../voice-input/route-descriptors';
import { frameAnnotationRasterRouteDescriptor } from '../../../frame-annotation-raster/route-descriptors';
import { annotationForkSessionRouteDescriptor } from '../../../annotation-fork-session/route-descriptors';
import { aggregatePromotionRouteDescriptor } from '../../../application/aggregate-promotion/route-descriptors';

export const backgroundOwnedRouteInventory = [
  aggregatePromotionRouteDescriptor,
  llmSessionRouteDescriptor,
  aiSettingsQueryRouteDescriptor,
  aiSettingsMutationRouteDescriptor,
  aiSettingsNavigationRouteDescriptor,
  annotationForkSessionRouteDescriptor,
  aiSecretUnlockRouteDescriptor,
  nativeAppRouteDescriptor,
  pageAccessRouteDescriptor,
  contentRuntimeWakeupRouteDescriptor,
  localDataErasureRouteDescriptor,
  settingsTransferRouteDescriptor,
  popupExportJobRouteDescriptor,
  llmContentProcessingRouteDescriptor,
  llmScenarioEditorProcessingRouteDescriptor,
  popupTabRouteCapabilityIssuanceDescriptor,
  contentActionRouteDescriptor,
  voiceInputOffscreenEventRouteDescriptor,
  frameAnnotationRasterRouteDescriptor,
] as const satisfies readonly BackgroundOwnedRouteDescriptor[];

export function getBackgroundOwnedRouteInventoryEntry(
  messageType: string
): BackgroundOwnedRouteInventoryEntry | undefined {
  return backgroundOwnedRouteInventory.find((entry) =>
    entry.messageTypes.some((entryMessageType) => entryMessageType === messageType)
  );
}
