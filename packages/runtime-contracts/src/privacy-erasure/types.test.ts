import { expectTypeOf, it } from 'vitest';

import type {
  BrowserStorageErasurePlan,
  ErasureParticipantResult,
  LocalExtensionDataErasureResult,
} from './types';

it('keeps erasure results and storage plans fully accounted', () => {
  expectTypeOf<ErasureParticipantResult['status']>().toEqualTypeOf<
    'erased' | 'failed' | 'skipped' | 'verified-empty'
  >();
  expectTypeOf<LocalExtensionDataErasureResult>().toMatchTypeOf<{
    failedRequiredParticipantIds: string[];
    participants: ErasureParticipantResult[];
    success: boolean;
  }>();
  expectTypeOf<keyof BrowserStorageErasurePlan>().toEqualTypeOf<
    'local' | 'localPrefixes' | 'session' | 'sessionPrefixes' | 'sync' | 'syncPrefixes'
  >();
});
