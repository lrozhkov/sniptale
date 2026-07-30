import { createLogger } from '@sniptale/platform/observability/logger';
import {
  BROWSER_ANNOTATION_SCHEMA_VERSION,
  type BrowserAnnotationCommentInput,
  type BrowserAnnotationFailedMutationRollbackPoint,
  type BrowserAnnotationPropertyChange,
  type BrowserAnnotationPropertyChangesInput,
  type BrowserAnnotationSessionSnapshot,
  type BrowserAnnotationSessionState,
  type BrowserAnnotationTargetEvidence,
  type BrowserAnnotationTextChangeInput,
  type BrowserDomAnnotationRecord,
  type BrowserFrameAnnotationOrder,
} from './types';

const logger = createLogger({ namespace: 'ContentBrowserAnnotationSession' });

type BrowserAnnotationListener = () => void;

interface BrowserAnnotationRuntimeState {
  domRecords: Map<number, BrowserDomAnnotationRecord>;
  frameOrders: Map<string, BrowserFrameAnnotationOrder>;
  knownTargets: Map<number, Element>;
  listeners: Set<BrowserAnnotationListener>;
  liveAnnotationIds: WeakMap<Element, number>;
  nextAnnotationId: number;
  nextCommentMarker: number;
  nextCreationOrder: number;
  revision: number;
}

function createEmptyRuntimeState(): BrowserAnnotationRuntimeState {
  return {
    domRecords: new Map(),
    frameOrders: new Map(),
    knownTargets: new Map(),
    listeners: new Set(),
    liveAnnotationIds: new WeakMap(),
    nextAnnotationId: 1,
    nextCommentMarker: 1,
    nextCreationOrder: 1,
    revision: 0,
  };
}

function cloneEvidence(evidence: BrowserAnnotationTargetEvidence): BrowserAnnotationTargetEvidence {
  return {
    ...evidence,
    frame: { ...evidence.frame },
    nodePosition: { ...evidence.nodePosition },
    viewport: { ...evidence.viewport },
  };
}

function clonePropertyChange(
  change: BrowserAnnotationPropertyChange
): BrowserAnnotationPropertyChange {
  return {
    ...change,
    after: { ...change.after },
    before: { ...change.before },
  };
}

function cloneDomRecord(record: BrowserDomAnnotationRecord): BrowserDomAnnotationRecord {
  return {
    ...record,
    evidence: cloneEvidence(record.evidence),
    propertyChanges: record.propertyChanges.map(clonePropertyChange),
    ...(record.textChange ? { textChange: { ...record.textChange } } : {}),
  };
}

function createSnapshot(state: BrowserAnnotationRuntimeState): BrowserAnnotationSessionSnapshot {
  return {
    domRecords: Array.from(state.domRecords.values(), cloneDomRecord).sort(
      (left, right) => left.creationOrder - right.creationOrder
    ),
    frameOrders: Array.from(state.frameOrders.values(), (entry) => ({ ...entry })).sort(
      (left, right) => left.creationOrder - right.creationOrder
    ),
    nextAnnotationId: state.nextAnnotationId,
    nextCommentMarker: state.nextCommentMarker,
    nextCreationOrder: state.nextCreationOrder,
    schemaVersion: BROWSER_ANNOTATION_SCHEMA_VERSION,
  };
}

function publish(state: BrowserAnnotationRuntimeState): void {
  state.revision += 1;
  state.listeners.forEach((listener) => {
    try {
      listener();
    } catch (error) {
      logger.error('Annotation session listener failed', error);
    }
  });
}

function getRecordForTarget(
  state: BrowserAnnotationRuntimeState,
  target: Element
): BrowserDomAnnotationRecord | undefined {
  const annotationId = state.liveAnnotationIds.get(target);
  return annotationId === undefined ? undefined : state.domRecords.get(annotationId);
}

function createRecord(
  state: BrowserAnnotationRuntimeState,
  input: { evidence: BrowserAnnotationTargetEvidence; target: Element }
): BrowserDomAnnotationRecord {
  const record: BrowserDomAnnotationRecord = {
    annotationId: state.nextAnnotationId,
    creationOrder: state.nextCreationOrder,
    evidence: cloneEvidence(input.evidence),
    propertyChanges: [],
  };
  state.nextAnnotationId += 1;
  state.nextCreationOrder += 1;
  state.domRecords.set(record.annotationId, record);
  state.knownTargets.set(record.annotationId, input.target);
  state.liveAnnotationIds.set(input.target, record.annotationId);
  return record;
}

function removeEmptyRecord(
  state: BrowserAnnotationRuntimeState,
  record: BrowserDomAnnotationRecord
): void {
  if (record.comment || record.textChange || record.propertyChanges.length > 0) {
    return;
  }

  state.domRecords.delete(record.annotationId);
  const target = state.knownTargets.get(record.annotationId);
  if (target && state.liveAnnotationIds.get(target) === record.annotationId) {
    state.liveAnnotationIds.delete(target);
  }
}

function declarationValuesEqual(
  left: BrowserAnnotationPropertyChange['before'],
  right: BrowserAnnotationPropertyChange['before']
): boolean {
  return left.priority === right.priority && left.value === right.value;
}

function propertyChangesEqual(
  left: BrowserAnnotationPropertyChange[],
  right: BrowserAnnotationPropertyChange[]
): boolean {
  return (
    left.length === right.length &&
    left.every((change, index) => {
      const other = right[index];
      return Boolean(
        other &&
        change.order === other.order &&
        change.property === other.property &&
        declarationValuesEqual(change.before, other.before) &&
        declarationValuesEqual(change.after, other.after)
      );
    })
  );
}

function normalizePropertyChanges(
  changes: BrowserAnnotationPropertyChange[]
): BrowserAnnotationPropertyChange[] {
  return changes
    .map(clonePropertyChange)
    .sort((left, right) => left.order - right.order || left.property.localeCompare(right.property));
}

function recordPropertyChanges(
  state: BrowserAnnotationRuntimeState,
  input: BrowserAnnotationPropertyChangesInput
): void {
  const existingRecord = getRecordForTarget(state, input.target);
  let nextChanges = existingRecord?.propertyChanges.map(clonePropertyChange) ?? [];

  input.changes.forEach((change) => {
    const existingChange = nextChanges.find((entry) => entry.property === change.property);
    const baseline = existingChange?.before ?? change.before;
    nextChanges = nextChanges.filter((entry) => entry.property !== change.property);
    if (!declarationValuesEqual(baseline, change.after)) {
      nextChanges.push({
        ...clonePropertyChange(change),
        before: { ...baseline },
      });
    }
  });
  nextChanges = normalizePropertyChanges(nextChanges);

  if (!existingRecord && nextChanges.length === 0) {
    return;
  }
  if (existingRecord && propertyChangesEqual(existingRecord.propertyChanges, nextChanges)) {
    return;
  }

  const record = existingRecord ?? createRecord(state, input);
  record.evidence = cloneEvidence(input.evidence);
  record.propertyChanges = nextChanges;
  removeEmptyRecord(state, record);
  publish(state);
}

function recordTextChange(
  state: BrowserAnnotationRuntimeState,
  input: BrowserAnnotationTextChangeInput
): void {
  const existingRecord = getRecordForTarget(state, input.target);
  const baseline = existingRecord?.textChange?.before ?? input.before;
  const nextChange =
    baseline === input.after ? undefined : { after: input.after, before: baseline };

  if (!existingRecord && !nextChange) {
    return;
  }
  if (
    existingRecord?.textChange?.before === nextChange?.before &&
    existingRecord?.textChange?.after === nextChange?.after
  ) {
    return;
  }

  const record = existingRecord ?? createRecord(state, input);
  record.evidence = cloneEvidence(input.evidence);
  if (nextChange) {
    record.textChange = nextChange;
  } else {
    delete record.textChange;
  }
  removeEmptyRecord(state, record);
  publish(state);
}

function setComment(
  state: BrowserAnnotationRuntimeState,
  input: BrowserAnnotationCommentInput
): number | null {
  const comment = input.comment.trim() === '' ? '' : input.comment;
  const existingRecord = getRecordForTarget(state, input.target);
  if (!existingRecord && comment === '') {
    return null;
  }
  if (existingRecord?.comment === comment) {
    return existingRecord.commentMarker ?? null;
  }

  const record = existingRecord ?? createRecord(state, input);
  record.evidence = cloneEvidence(input.evidence);
  if (comment === '') {
    delete record.comment;
    delete record.commentMarker;
    removeEmptyRecord(state, record);
    publish(state);
    return null;
  }

  if (record.commentMarker === undefined) {
    record.commentMarker = state.nextCommentMarker;
    state.nextCommentMarker += 1;
  }
  record.comment = comment;
  publish(state);
  return record.commentMarker;
}

function syncFrameIds(state: BrowserAnnotationRuntimeState, frameIds: readonly string[]): void {
  const nextIds = new Set(frameIds);
  let changed = false;

  state.frameOrders.forEach((_entry, frameId) => {
    if (!nextIds.has(frameId)) {
      state.frameOrders.delete(frameId);
      changed = true;
    }
  });

  frameIds.forEach((frameId) => {
    if (state.frameOrders.has(frameId)) {
      return;
    }
    state.frameOrders.set(frameId, {
      creationOrder: state.nextCreationOrder,
      frameId,
    });
    state.nextCreationOrder += 1;
    changed = true;
  });

  if (changed) {
    publish(state);
  }
}

function applySnapshot(
  state: BrowserAnnotationRuntimeState,
  snapshot: BrowserAnnotationSessionSnapshot,
  allocatorMode: 'exact' | 'monotonic' = 'monotonic'
): void {
  const resolveAllocator = (current: number, captured: number) =>
    allocatorMode === 'exact' ? captured : Math.max(current, captured);
  const nextAnnotationId = resolveAllocator(state.nextAnnotationId, snapshot.nextAnnotationId);
  const nextCommentMarker = resolveAllocator(state.nextCommentMarker, snapshot.nextCommentMarker);
  const nextCreationOrder = resolveAllocator(state.nextCreationOrder, snapshot.nextCreationOrder);
  const nextRecords = new Map(
    snapshot.domRecords.map((record) => [record.annotationId, cloneDomRecord(record)])
  );
  const nextLiveAnnotationIds = new WeakMap<Element, number>();

  nextRecords.forEach((record) => {
    const target = state.knownTargets.get(record.annotationId);
    if (target) {
      nextLiveAnnotationIds.set(target, record.annotationId);
    }
  });

  state.domRecords = nextRecords;
  state.frameOrders = new Map(snapshot.frameOrders.map((entry) => [entry.frameId, { ...entry }]));
  state.liveAnnotationIds = nextLiveAnnotationIds;
  state.nextAnnotationId = nextAnnotationId;
  state.nextCommentMarker = nextCommentMarker;
  state.nextCreationOrder = nextCreationOrder;
  publish(state);
}

/** Creates the sole mutable authority for annotations in one content-document session. */
export function createBrowserAnnotationSession() {
  const state = createEmptyRuntimeState();
  const rollbackAuthority = Symbol('BrowserAnnotationFailedMutationRollback');

  return {
    applySnapshot: (snapshot: BrowserAnnotationSessionSnapshot): void =>
      applySnapshot(state, snapshot),
    captureSnapshot: (): BrowserAnnotationSessionSnapshot => createSnapshot(state),
    captureFailedMutationRollbackPoint: (): BrowserAnnotationFailedMutationRollbackPoint => ({
      authority: rollbackAuthority,
      revision: state.revision,
      snapshot: createSnapshot(state),
    }),
    getAnnotationId: (target: Element): number | null =>
      state.liveAnnotationIds.get(target) ?? null,
    getLiveTarget: (annotationId: number): Element | null =>
      state.domRecords.has(annotationId) ? (state.knownTargets.get(annotationId) ?? null) : null,
    getState: (): BrowserAnnotationSessionState => ({
      ...createSnapshot(state),
      revision: state.revision,
    }),
    recordPropertyChanges: (input: BrowserAnnotationPropertyChangesInput): void =>
      recordPropertyChanges(state, input),
    recordTextChange: (input: BrowserAnnotationTextChangeInput): void =>
      recordTextChange(state, input),
    resetForDocument: (): void => {
      const listeners = state.listeners;
      Object.assign(state, createEmptyRuntimeState(), { listeners });
      publish(state);
    },
    rollbackFailedMutation: (point: BrowserAnnotationFailedMutationRollbackPoint): boolean => {
      if (point.authority !== rollbackAuthority) {
        return false;
      }
      if (state.revision === point.revision) {
        return true;
      }
      if (state.revision !== point.revision + 1) {
        return false;
      }
      applySnapshot(state, point.snapshot, 'exact');
      return true;
    },
    setComment: (input: BrowserAnnotationCommentInput): number | null => setComment(state, input),
    subscribe: (listener: BrowserAnnotationListener): (() => void) => {
      state.listeners.add(listener);
      return () => state.listeners.delete(listener);
    },
    syncFrameIds: (frameIds: readonly string[]): void => syncFrameIds(state, frameIds),
  };
}

export const browserAnnotationSession = createBrowserAnnotationSession();
