import type {
  FrameSessionSnapshot,
  PageDomMutationBatch,
  PagePreparationHistoryBridge,
  PagePreparationHistoryEntry,
} from './types';

type DeferredCommit = {
  before: FrameSessionSnapshot;
  id: number;
};

type OpenTransaction = {
  before: FrameSessionSnapshot;
  domBatch: PageDomMutationBatch | null;
};

export type HistoryListener = () => void;

export type HistoryStoreInternals = {
  bridge: PagePreparationHistoryBridge | null;
  deferredCommitId: number;
  deferredCommits: Map<number, DeferredCommit>;
  future: PagePreparationHistoryEntry[];
  isApplying: boolean;
  listeners: Set<HistoryListener>;
  past: PagePreparationHistoryEntry[];
  revision: number;
  transactions: Map<string, OpenTransaction>;
};

export function createHistoryStoreInternals(): HistoryStoreInternals {
  return {
    bridge: null,
    deferredCommitId: 0,
    deferredCommits: new Map<number, DeferredCommit>(),
    future: [],
    isApplying: false,
    listeners: new Set<HistoryListener>(),
    past: [],
    revision: 0,
    transactions: new Map<string, OpenTransaction>(),
  };
}
