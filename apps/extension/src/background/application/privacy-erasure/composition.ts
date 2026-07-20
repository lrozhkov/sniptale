import type { LocalDataErasureMessage } from '../../../contracts/messaging/privacy-erasure';
import { createPrivacyErasureStorageCleanupAdapter } from '../../../composition/persistence/privacy-erasure/cleanup';
import { diagnosticsPrivacyErasureCleanupAdapter } from '../../diagnostics/privacy-erasure/cleanup';
import { mediaPrivacyErasureCleanupAdapter } from '../../media/privacy-erasure/cleanup';
import { extensionPageLocalStorageErasureAdapter } from './page-local-storage';
import type { BackgroundRuntimeState } from '../runtime-state';
import type { NativeIngestionCleanupPort } from './ports';
import { backgroundRuntimeCleanupAdapter } from './runtime-cleanup';
import { PrivacyErasureUseCase } from './use-case';

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

const nativeIngestionCleanupProxy: NativeIngestionCleanupPort = {
  cleanup: () => nativeIngestionCleanupPort.cleanup(),
  reserveErasureExclusion: () => nativeIngestionCleanupPort.reserveErasureExclusion(),
};

const privacyErasureUseCase = new PrivacyErasureUseCase({
  diagnostics: diagnosticsPrivacyErasureCleanupAdapter,
  media: mediaPrivacyErasureCleanupAdapter,
  nativeIngestion: nativeIngestionCleanupProxy,
  runtime: backgroundRuntimeCleanupAdapter,
  storage: createPrivacyErasureStorageCleanupAdapter(extensionPageLocalStorageErasureAdapter),
});

export function configureNativeIngestionPrivacyErasureCleanupPort(
  port: NativeIngestionCleanupPort
): void {
  nativeIngestionCleanupPort = port;
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
