import type {
  ErasureParticipantResult,
  LocalExtensionDataErasureOptions,
  LocalExtensionDataErasureResult,
} from '@sniptale/runtime-contracts/privacy-erasure/types';

import type { BackgroundRuntimeState } from '../runtime-state';

interface ErasureExclusion {
  release(): void;
  waitForActiveMutations(): Promise<void>;
}

interface DiagnosticsCleanupPort {
  cleanup(): Promise<readonly ErasureParticipantResult[]>;
  reserveErasureExclusion(): ErasureExclusion;
}

interface MediaCleanupPort {
  cleanup(): Promise<readonly ErasureParticipantResult[]>;
  reserveErasureExclusion(): ErasureExclusion;
}

export interface NativeIngestionCleanupPort {
  cleanup(): Promise<readonly ErasureParticipantResult[]>;
  reserveErasureExclusion(): ErasureExclusion;
}

interface RuntimeCleanupPort {
  cleanup(state: BackgroundRuntimeState): Promise<readonly ErasureParticipantResult[]>;
}

interface StorageCleanupPort {
  cleanup(options: LocalExtensionDataErasureOptions): Promise<LocalExtensionDataErasureResult>;
}

export interface PrivacyErasurePorts {
  diagnostics: DiagnosticsCleanupPort;
  media: MediaCleanupPort;
  nativeIngestion: NativeIngestionCleanupPort;
  runtime: RuntimeCleanupPort;
  storage: StorageCleanupPort;
}
