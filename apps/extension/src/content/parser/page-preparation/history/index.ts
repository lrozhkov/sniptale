import { createPagePreparationHistoryStore } from './store';

const pagePreparationHistoryStore = createPagePreparationHistoryStore();

export const pagePreparationHistory = pagePreparationHistoryStore;

export { addPagePreparationHistoryAppliedListener } from './store';
export { getPagePreparationHistoryDomain } from './store-state';
export {
  applyDomMutationBatch,
  captureDomElementState,
  captureDomStateMap,
  createDomMutationBatch,
  createDomMutationPatch,
} from './dom';
export { HistoryLocatorAllocationError } from './dom-locators';
export { captureFrameSessionSnapshot, hydrateFrameSessionSnapshot } from './frame-session';
export type {
  PagePreparationRecovery,
  DrawingRecoveryEffect,
  FrameSessionSnapshot,
  PagePreparationChangeScope,
  PagePreparationResetScope,
  PageDomElementState,
  PageDomMutationBatch,
  PageDomMutationPatch,
  PagePreparationHistoryBridge,
  PagePreparationHistoryEntry,
  PagePreparationHistoryDomEffect,
  PagePreparationHistoryDomEffectResult,
  PagePreparationSessionSnapshot,
  PagePreparationHistoryState,
  PagePreparationHistoryDomain,
  PagePreparationDomElement,
  SerializableFrameData,
} from './types';
