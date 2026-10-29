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

interface PageRecoveryCleanupPort {
  cleanup(): Promise<readonly ErasureParticipantResult[]>;
  reserveErasureExclusion(): ErasureExclusion;
}

interface RuntimeCleanupPort {
  cleanup(state: BackgroundRuntimeState): Promise<readonly ErasureParticipantResult[]>;
}

interface PopupExportExclusionPort {
  cancelActiveJob(): Promise<void>;
  reserveErasureExclusion(): ErasureExclusion;
}

interface StorageCleanupPort {
  cleanup(options: LocalExtensionDataErasureOptions): Promise<LocalExtensionDataErasureResult>;
}

/** Reserves sync admission before queued erasure and drains producers before local cleanup. */
export interface SyncPrivacyErasurePort {
  reserveErasureExclusion(): {
    release(): void;
    quiesce(): Promise<void>;
  };
}

export interface PrivacyErasurePorts {
  audioJobs: PopupExportExclusionPort;
  diagnostics: DiagnosticsCleanupPort;
  media: MediaCleanupPort;
  nativeIngestion: NativeIngestionCleanupPort;
  popupExport: PopupExportExclusionPort;
  pageRecovery: PageRecoveryCleanupPort;
  runtime: RuntimeCleanupPort;
  storage: StorageCleanupPort;
  sync: SyncPrivacyErasurePort;
}
