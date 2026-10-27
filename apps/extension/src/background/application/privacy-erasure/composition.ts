import { pageRecoveryService } from '../../page-recovery/service';
import type { AudioJobService } from '../../ai/audio/service';
import type { LocalDataErasureMessage } from '../../../contracts/messaging/privacy-erasure';
import { createPrivacyErasureStorageCleanupAdapter } from '../../../composition/persistence/privacy-erasure/cleanup';
import { diagnosticsPrivacyErasureCleanupAdapter } from '../../diagnostics/privacy-erasure/cleanup';
import { mediaPrivacyErasureCleanupAdapter } from '../../media/privacy-erasure/cleanup';
import { extensionPageLocalStorageErasureAdapter } from './page-local-storage';
import type { BackgroundRuntimeState } from '../runtime-state';
import type { NativeIngestionCleanupPort, SyncPrivacyErasurePort } from './ports';
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

const privacyErasureUseCase = new PrivacyErasureUseCase({
  audioJobs: {
    cancelActiveJob: () => (audioJobs ? audioJobs.cancelActiveJob() : Promise.resolve()),
    reserveErasureExclusion: () =>
      audioJobs?.reserveErasureExclusion() ?? { release() {}, async waitForActiveMutations() {} },
  },
  sync: {
    reserveErasureExclusion: () => syncPrivacyErasurePort.reserveErasureExclusion(),
  },
  diagnostics: diagnosticsPrivacyErasureCleanupAdapter,
  media: mediaPrivacyErasureCleanupAdapter,
  nativeIngestion: nativeIngestionCleanupProxy,
  popupExport: {
    cancelActiveJob: requestActivePagePackageJobCancellationForPrivacyErasure,
    reserveErasureExclusion: reservePopupExportErasureExclusion,
  },
  pageRecovery: pageRecoveryService,
  runtime: backgroundRuntimeCleanupAdapter,
  storage: createPrivacyErasureStorageCleanupAdapter(extensionPageLocalStorageErasureAdapter),
});

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
