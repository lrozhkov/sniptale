import { vi } from 'vitest';
import type {
  ErasureParticipantResult,
  LocalExtensionDataErasureResult,
} from '@sniptale/runtime-contracts/privacy-erasure/types';

import { createBackgroundRuntimeState } from '../runtime-state';
import { reserveDiagnosticsErasureExclusion } from '../../diagnostics/lifecycle-gate';
import { reserveMediaErasureExclusion } from '../../media/lifecycle-gate';
import { reserveNativeIngestionErasureExclusion } from '../../capture/native-app/lifecycle-gate';
import type { PrivacyErasurePorts } from './ports';

export function verified(id: string): ErasureParticipantResult {
  return {
    id,
    remainingCount: 0,
    severity: 'required',
    status: 'verified-empty',
  };
}

export function failed(id: string): ErasureParticipantResult {
  return {
    error: `${id}-failed`,
    id,
    severity: 'required',
    status: 'failed',
  };
}

export function storageResult(
  overrides: Partial<LocalExtensionDataErasureResult> = {}
): LocalExtensionDataErasureResult {
  return {
    failedRequiredParticipantIds: [],
    indexedDbStoresCleared: 19,
    localStorageKeysRemoved: ['local-key'],
    participants: [verified('indexed-db:core')],
    sessionStorageKeysRemoved: ['session-key'],
    success: true,
    syncStorageKeysRemoved: ['sync-key'],
    ...overrides,
  };
}

export function createPorts(order: string[] = []): PrivacyErasurePorts {
  return {
    diagnostics: {
      cleanup: vi.fn(async () => {
        order.push('diagnostics');
        return [verified('diagnostics-runtime-state')];
      }),
      reserveErasureExclusion: reserveDiagnosticsErasureExclusion,
    },
    media: {
      cleanup: vi.fn(async () => {
        order.push('media');
        return [verified('recording-runtime-state')];
      }),
      reserveErasureExclusion: reserveMediaErasureExclusion,
    },
    nativeIngestion: {
      cleanup: vi.fn(async () => {
        order.push('native-ingestion');
        return [verified('native-ingestion-runtime-state')];
      }),
      reserveErasureExclusion: reserveNativeIngestionErasureExclusion,
    },
    runtime: {
      cleanup: vi.fn(async () => {
        order.push('runtime');
        return [verified('background-runtime-state')];
      }),
    },
    storage: {
      cleanup: vi.fn(async () => {
        order.push('storage');
        return storageResult();
      }),
    },
  };
}

export function createErasureRequest() {
  return {
    options: { includeAiProviderSecrets: true, preservePreferences: false },
    state: createBackgroundRuntimeState(),
  };
}
