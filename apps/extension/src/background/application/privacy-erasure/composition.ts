import type { DesignReviewSessionService } from '../../design-review-session/service';
import { pageRecoveryService } from '../../page-recovery/service';
import type { AudioJobService } from '../../ai/audio/service';
import type { LocalDataErasureMessage } from '../../../contracts/messaging/privacy-erasure';
import { createPrivacyErasureStorageCleanupAdapter } from '../../../composition/persistence/privacy-erasure/cleanup';
import { diagnosticsPrivacyErasureCleanupAdapter } from '../../diagnostics/privacy-erasure/cleanup';
import { mediaPrivacyErasureCleanupAdapter } from '../../media/privacy-erasure/cleanup';
import { extensionPageLocalStorageErasureAdapter } from './page-local-storage';
import type { BackgroundRuntimeState } from '../runtime-state';
import type {
  NativeIngestionCleanupPort,
  SyncPrivacyErasurePort,
  SecretProtectionPrivacyErasurePort,
} from './ports';
import {
  backgroundRuntimeCleanupAdapter,
  configureBackgroundRuntimeScreenshotCleanupPort,
  type BackgroundRuntimeScreenshotCleanupPort,
} from './runtime-cleanup';
import { PrivacyErasureUseCase } from './use-case';
import { reservePopupExportErasureExclusion } from '../../capture/page-package/job/lifecycle-gate';
import { requestActivePagePackageJobCancellationForPrivacyErasure } from '../../capture/page-package/job';

const unavailableNativeIngestionCleanupPort: NativeIngestionCleanupPort = {
  async cleanup() {
    throw new Error('Native ingestion privacy-erasure cleanup is unavailable');
  },
  reserveErasureExclusion() {
    return {
      release() {},
      async waitForActiveMutations() {},
    };
  },
};

let secretProtectionPrivacyErasurePort: SecretProtectionPrivacyErasurePort = {
  reserveErasure() {
    return {
      release() {},
      async prepare() {
        throw new Error('Secret protection erasure is unavailable');
      },
    };
  },
};

let nativeIngestionCleanupPort = unavailableNativeIngestionCleanupPort;
let syncPrivacyErasurePort: SyncPrivacyErasurePort = {
  reserveErasureExclusion() {
    return {
      release() {},
      async quiesce() {
        throw new Error('Sync privacy-erasure quiescence is unavailable');
      },
    };
  },
};

const nativeIngestionCleanupProxy: NativeIngestionCleanupPort = {
  cleanup: () => nativeIngestionCleanupPort.cleanup(),
  reserveErasureExclusion: () => nativeIngestionCleanupPort.reserveErasureExclusion(),
};

let audioJobs: Pick<AudioJobService, 'reserveErasureExclusion' | 'cancelActiveJob'> | undefined;
export function configureAudioJobPrivacyErasurePort(
  ...ports: Array<Pick<AudioJobService, 'reserveErasureExclusion' | 'cancelActiveJob'>>
): void {
  audioJobs = {
    async cancelActiveJob() {
      await Promise.all(ports.map((port) => port.cancelActiveJob()));
    },
    reserveErasureExclusion() {
      const reservations: Array<ReturnType<AudioJobService['reserveErasureExclusion']>> = [];
      try {
        for (const port of ports) reservations.push(port.reserveErasureExclusion());
      } catch (error) {
        reservations.forEach((reservation) => reservation.release());
        throw error;
      }
      let released = false;
      return {
        release() {
          if (!released) {
            released = true;
            reservations.forEach((reservation) => reservation.release());
          }
        },
        async waitForActiveMutations() {
          await Promise.all(
            reservations.map((reservation) => reservation.waitForActiveMutations())
          );
        },
      };
    },
  };
}

let designReviewSessions: DesignReviewSessionService | undefined;
/** Installs the runtime session owner before erasure can admit work. */
export function configureDesignReviewSessionPrivacyErasurePort(
  port: DesignReviewSessionService
): void {
  designReviewSessions = port;
}

const privacyErasureUseCase = new PrivacyErasureUseCase({
  audioJobs: {
    cancelActiveJob: () => (audioJobs ? audioJobs.cancelActiveJob() : Promise.resolve()),
    reserveErasureExclusion: () =>
      audioJobs?.reserveErasureExclusion() ?? { release() {}, async waitForActiveMutations() {} },
  },
  sync: {
    reserveErasureExclusion(options) {
      const secret = secretProtectionPrivacyErasurePort.reserveErasure();
      try {
        const sync = syncPrivacyErasurePort.reserveErasureExclusion(options);
        return {
          release() {
            try {
              sync.release();
            } finally {
              secret.release();
            }
          },
          async quiesce() {
            // Native revocation uses ordinary writer admission before the common exclusive lock.
            await sync.quiesce();
            await secret.prepare({
              includeAiProviderSecrets: options?.includeAiProviderSecrets ?? true,
            });
          },
        };
      } catch (error) {
        secret.release();
        throw error;
      }
    },
  },
  diagnostics: diagnosticsPrivacyErasureCleanupAdapter,
  media: mediaPrivacyErasureCleanupAdapter,
  nativeIngestion: nativeIngestionCleanupProxy,
  popupExport: {
    cancelActiveJob: requestActivePagePackageJobCancellationForPrivacyErasure,
    reserveErasureExclusion: reservePopupExportErasureExclusion,
  },
  pageRecovery: {
    async cleanup() {
      const recovery = await pageRecoveryService.cleanup();
      const review = (await designReviewSessions?.cleanup()) ?? [];
      return [...recovery, ...review];
    },
    reserveErasureExclusion() {
      const recovery = pageRecoveryService.reserveErasureExclusion();
      const review = designReviewSessions?.reserveErasureExclusion();
      return {
        release() {
          recovery.release();
          review?.release();
        },
        async waitForActiveMutations() {
          await Promise.all([recovery.waitForActiveMutations(), review?.waitForActiveMutations()]);
        },
      };
    },
  },
  runtime: backgroundRuntimeCleanupAdapter,
  storage: createPrivacyErasureStorageCleanupAdapter(extensionPageLocalStorageErasureAdapter),
});

/** Installs the one runtime-owned shared secret session before erasure admission. */
export function configureSecretProtectionPrivacyErasurePort(
  port: SecretProtectionPrivacyErasurePort
): void {
  secretProtectionPrivacyErasurePort = port;
}

/** Installs the runtime-owned sync exclusion before privacy erasure can remove local data. */
export function configureSyncPrivacyErasurePort(port: SyncPrivacyErasurePort): void {
  syncPrivacyErasurePort = port;
}

export function configureNativeIngestionPrivacyErasureCleanupPort(
  port: NativeIngestionCleanupPort
): void {
  nativeIngestionCleanupPort = port;
}

export function configureScreenshotPrivacyErasureCleanupPort(
  port: BackgroundRuntimeScreenshotCleanupPort
): void {
  configureBackgroundRuntimeScreenshotCleanupPort(port);
}

export function eraseLocalExtensionDataFromBackground(
  message: LocalDataErasureMessage,
  state: BackgroundRuntimeState
) {
  return privacyErasureUseCase.execute({
    options: {
      includeAiProviderSecrets: message.includeAiProviderSecrets,
      preservePreferences: message.preservePreferences,
    },
    state,
  });
}
