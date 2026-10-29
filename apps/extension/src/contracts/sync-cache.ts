/** Display-only local cache accounting. These values never authorize byte removal. */
export interface SyncCacheStatus {
  budgetBytes: number;
  budgetRevision: number;
  residentBytes: number;
  missingBytes: number;
  pinnedBytes: number;
  pinnedRoots: number;
  overBudgetBytes: number;
}
/** A current native root projection; physical commands repeat all authority checks. */
export interface SyncCacheRootStatus {
  root: {
    rootKind: 'media' | 'video-project' | 'video-review' | 'scenario-project';
    rootId: string;
  };
  configured: boolean;
  pinned: boolean;
  ready: boolean;
  releaseAllowed: boolean;
}
/** Count-only completion preserves no file payloads or native snapshots. */
export interface SyncCacheReleaseResult {
  released: number;
  releasedBytes: number;
  absent: number;
  unavailable: number;
  busy: number;
  protected: number;
}
/** A completed soft-budget pass reports actual remaining local bytes. */
export interface SyncCacheTrimResult {
  released: number;
  releasedBytes: number;
  unavailable: number;
  busy: number;
  protected: number;
  status: SyncCacheStatus;
}
