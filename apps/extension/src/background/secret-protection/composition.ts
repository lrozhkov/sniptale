import { createSecretProtectionService } from '../../composition/persistence/secret-protection/service';
import { createAISecretProtectionParticipant } from '../../composition/persistence/ai-settings/provider-secret-protection.store';
import { createWebdavSecretProtectionParticipant } from '../../composition/persistence/remote-connection/protection';

interface SyncProtectionLifetime {
  containForSecretProtection(): Promise<void>;
  revokeCredentialLeases(): void;
  resumeAfterUnlock?(): Promise<void>;
}

/** Construct the worker's sole secret service before binding the sync lifecycle closure. */
export function createBackgroundSecretProtection() {
  let sync: SyncProtectionLifetime | null = null;
  const service = createSecretProtectionService({
    participants: [
      createAISecretProtectionParticipant(),
      createWebdavSecretProtectionParticipant(),
    ],
    async containSync() {
      if (!sync) {
        throw new Error('Secret protection sync containment unavailable');
      }
      await sync.containForSecretProtection();
    },
    revokeLeases() {
      sync?.revokeCredentialLeases();
    },
    async onUnlocked() {
      await sync?.resumeAfterUnlock?.();
    },
  });

  return {
    service,
    bindSync(lifetime: SyncProtectionLifetime) {
      if (sync) {
        throw new Error('Secret protection sync lifetime already bound');
      }
      sync = lifetime;
    },
  };
}
