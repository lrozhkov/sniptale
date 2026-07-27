import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { TabRuntimeCapability } from '@sniptale/runtime-contracts/tab-capabilities/types';
import { getBackgroundRuntimeMessaging } from '../../routing-contracts/runtime-messaging/services';
import { sendViewerPreparationCommand, type WebSnapshotViewerPorts } from './viewer-ports';

async function enablePreparationForRegularPage(
  tabId: number,
  viewport: { width: number; height: number } | null,
  toolbarVisible?: boolean
): Promise<void> {
  await getBackgroundRuntimeMessaging().sendTabMessage(tabId, {
    type: MessageType.ENABLE_SCREENSHOT_MODE,
    viewport,
    ...(toolbarVisible === undefined ? {} : { toolbarVisible }),
  });
}

export async function enablePreparationByCapability(args: {
  capability: TabRuntimeCapability;
  ports: WebSnapshotViewerPorts;
  tabId: number;
  toolbarVisible?: boolean;
  viewport: { width: number; height: number } | null;
}): Promise<void> {
  switch (args.capability) {
    case TabRuntimeCapability.Regular:
      await enablePreparationForRegularPage(args.tabId, args.viewport, args.toolbarVisible);
      return;
    case TabRuntimeCapability.OwnedSnapshotViewer:
      await sendViewerPreparationCommand(args.ports, args.tabId, {
        type: MessageType.ENABLE_SCREENSHOT_MODE,
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
      await getBackgroundRuntimeMessaging().sendTabMessage(args.tabId, {
        type: MessageType.DISABLE_SCREENSHOT_MODE,
      });
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
