export {
  LOCAL_EXTENSION_PAGE_STORAGE_KEYS,
  LOCAL_EXTENSION_PAGE_STORAGE_PREFIXES,
  buildBrowserStorageErasurePlan,
  getIndexedDbStoresForLocalExtensionDataErasure,
} from './inventory';
export type {
  BrowserStorageErasurePlan,
  ErasureParticipantResult,
  ErasureParticipantSeverity,
  ErasureParticipantStatus,
  LocalExtensionDataErasureOptions,
  LocalExtensionDataErasureResult,
} from '@sniptale/runtime-contracts/privacy-erasure/types';
