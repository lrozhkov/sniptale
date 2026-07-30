import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { AppliedViewportPresetPayload } from '@sniptale/runtime-contracts/messaging/message-types';
import { TabRuntimeCapability } from '@sniptale/runtime-contracts/tab-capabilities/types';
import { getBackgroundRuntimeMessaging } from '../../routing-contracts/runtime-messaging/services';
import { sendViewerPreparationCommand, type WebSnapshotViewerPorts } from './viewer-ports';

async function enablePreparationForRegularPage(
  tabId: number,
  viewport: AppliedViewportPresetPayload | null,
  surfaceCapabilityToken: string,
  surfaceOperationGeneration: number,
  surfaceLeaseGeneration?: number,
  surfaceWarning?: string,
  toolbarVisible?: boolean
): Promise<void> {
  await getBackgroundRuntimeMessaging().sendTabMessage(tabId, {
    type: MessageType.ENABLE_SCREENSHOT_MODE,
    surfaceCapabilityToken,
    surfaceOperationGeneration,
    ...(surfaceLeaseGeneration === undefined ? {} : { surfaceLeaseGeneration }),
    ...(surfaceWarning === undefined ? {} : { surfaceWarning }),
    viewport,
    ...(toolbarVisible === undefined ? {} : { toolbarVisible }),
  });
}

export async function enablePreparationByCapability(args: {
  capability: TabRuntimeCapability;
  ports: WebSnapshotViewerPorts;
  tabId: number;
  toolbarVisible?: boolean;
  viewport: AppliedViewportPresetPayload | null;
  surfaceCapabilityToken: string;
  surfaceLeaseGeneration?: number;
  surfaceOperationGeneration: number;
  surfaceWarning?: string;
}): Promise<void> {
  switch (args.capability) {
    case TabRuntimeCapability.Regular:
      await enablePreparationForRegularPage(
        args.tabId,
        args.viewport,
        args.surfaceCapabilityToken,
        args.surfaceOperationGeneration,
        args.surfaceLeaseGeneration,
        args.surfaceWarning,
        args.toolbarVisible
      );
      return;
    case TabRuntimeCapability.OwnedSnapshotViewer:
      await sendViewerPreparationCommand(args.ports, args.tabId, {
        type: MessageType.ENABLE_SCREENSHOT_MODE,
        surfaceCapabilityToken: args.surfaceCapabilityToken,
        ...(args.surfaceWarning === undefined ? {} : { surfaceWarning: args.surfaceWarning }),
        viewport: args.viewport,
        ...(args.toolbarVisible === undefined ? {} : { toolbarVisible: args.toolbarVisible }),
      });
      return;
    case TabRuntimeCapability.Restricted:
      throw new Error('Page preparation is unavailable for this page.');
  }
}

export async function disablePreparationByCapability(args: {
  capability: TabRuntimeCapability;
  ports: WebSnapshotViewerPorts;
  tabId: number;
}): Promise<void> {
  switch (args.capability) {
    case TabRuntimeCapability.Regular:
      const response = await getBackgroundRuntimeMessaging().sendTabMessage(args.tabId, {
        type: MessageType.DISABLE_SCREENSHOT_MODE,
      });
      if (response?.success === false) {
        throw new Error(response.error || 'Content screenshot teardown failed');
      }
      return;
    case TabRuntimeCapability.OwnedSnapshotViewer:
      await sendViewerPreparationCommand(args.ports, args.tabId, {
        type: MessageType.DISABLE_SCREENSHOT_MODE,
      });
      return;
    case TabRuntimeCapability.Restricted:
      return;
  }
}
