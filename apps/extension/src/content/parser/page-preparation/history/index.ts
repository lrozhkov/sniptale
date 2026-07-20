import { createPagePreparationHistoryStore } from './store';

const pagePreparationHistoryStore = createPagePreparationHistoryStore();

export const pagePreparationHistory = pagePreparationHistoryStore;

export { addPagePreparationHistoryAppliedListener } from './store';
export {
  applyDomMutationBatch,
  captureDomElementState,
  captureDomStateMap,
  createDomMutationBatch,
  createDomMutationPatch,
} from './dom';
export { captureFrameSessionSnapshot, hydrateFrameSessionSnapshot } from './frame-session';
export type {
  FrameSessionSnapshot,
  PageDomElementState,
  PageDomMutationBatch,
  PageDomMutationPatch,
  PagePreparationHistoryBridge,
  PagePreparationHistoryEntry,
  PagePreparationHistoryState,
  SerializableFrameData,
} from './types';
