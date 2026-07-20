import type { NativeAppOutboundMessage } from '../../../contracts/native-app';
import type {
  AppControllerLeaseMessage,
  NativeAppCapabilities,
  NativeTrayActionRegistry,
} from '../../../contracts/native-app';
import { createNativeSettingsSyncMessage } from './outbound';
import { loadNativeSettingsSnapshot } from './settings-snapshot';
import type { NativeSettingsSyncTracker } from './settings-sync-state';

export async function syncNativeSettings(args: {
  hasGrantedLease: (message: { controllerLeaseId: string }) => boolean;
  post: (message: NativeAppOutboundMessage) => void;
  settingsSync: NativeSettingsSyncTracker;
  updateStatus: (patch: {
    settingsRevision: string;
    trayActions: NativeTrayActionRegistry;
  }) => void;
  getCapabilities: () => NativeAppCapabilities | null;
  getLease: () => AppControllerLeaseMessage | null;
}): Promise<void> {
  const lease = args.getLease();
  if (!lease || lease.status !== 'granted') {
    return;
  }

  const sequence = args.settingsSync.nextSequence();
  const snapshot = await loadNativeSettingsSnapshot(args.getCapabilities());
  if (!args.settingsSync.isCurrent(sequence) || !args.hasGrantedLease(lease)) {
    return;
  }

  args.settingsSync.setPendingRevision(snapshot.revision);
  args.updateStatus({
    settingsRevision: snapshot.revision,
    trayActions: snapshot.trayActions,
  });
  args.post(
    createNativeSettingsSyncMessage({
      controllerLeaseId: lease.controllerLeaseId,
      snapshot,
    })
  );
}
