export interface LocalExtensionDataErasureOptions {
  includeAiProviderSecrets: boolean;
  preservePreferences: boolean;
}

export type ErasureParticipantSeverity = 'best-effort' | 'required';

export type ErasureParticipantStatus = 'erased' | 'failed' | 'skipped' | 'verified-empty';

export interface ErasureParticipantResult {
  error?: string | undefined;
  id: string;
  remainingCount?: number | undefined;
  removedCount?: number | undefined;
  severity: ErasureParticipantSeverity;
  status: ErasureParticipantStatus;
}

export interface LocalExtensionDataErasureResult {
  failedRequiredParticipantIds: string[];
  indexedDbStoresCleared: number;
  localStorageKeysRemoved: string[];
  participants: ErasureParticipantResult[];
  success: boolean;
  sessionStorageKeysRemoved: string[];
  syncStorageKeysRemoved: string[];
}

export interface BrowserStorageErasurePlan {
  local: string[];
  localPrefixes: string[];
  session: string[];
  sessionPrefixes: string[];
  sync: string[];
  syncPrefixes: string[];
}
