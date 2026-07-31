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
  type BrowserAnnotationTextChangesInput,
  type BrowserDesignReviewActionInput,
  type BrowserDomAnnotationRecord,
  type BrowserFrameAnnotationInput,
  type BrowserFrameAnnotationRecord,
} from './types';

const logger = createLogger({ namespace: 'ContentBrowserAnnotationSession' });

type BrowserAnnotationListener = () => void;

interface BrowserAnnotationRuntimeState {
  domRecords: Map<number, BrowserDomAnnotationRecord>;
  frameOrders: Map<string, BrowserFrameAnnotationRecord>;
  knownTargets: Map<number, Element>;
  listeners: Set<BrowserAnnotationListener>;
  liveAnnotationIds: WeakMap<Element, number>;
  nextAnnotationId: number;
  nextCreationOrder: number;
  nextMarkerNumber: number;
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
    nextCreationOrder: 1,
    nextMarkerNumber: 1,
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
    ...(record.designReview ? { designReview: { ...record.designReview } } : {}),
    ...(record.textChange ? { textChange: { ...record.textChange } } : {}),
  };
}

function cloneFrameRecord(record: BrowserFrameAnnotationRecord): BrowserFrameAnnotationRecord {
  return {
    ...record,
    rect: { ...record.rect },
    viewport: { ...record.viewport },
  };
}

function createSnapshot(state: BrowserAnnotationRuntimeState): BrowserAnnotationSessionSnapshot {
  return {
    domRecords: Array.from(state.domRecords.values(), cloneDomRecord).sort(
      (left, right) => left.creationOrder - right.creationOrder
    ),
    frameOrders: Array.from(state.frameOrders.values(), cloneFrameRecord).sort(
      (left, right) => left.creationOrder - right.creationOrder
    ),
    nextAnnotationId: state.nextAnnotationId,
    nextCreationOrder: state.nextCreationOrder,
    nextMarkerNumber: state.nextMarkerNumber,
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
  if (
    record.comment ||
    record.designReview?.action ||
    record.textChange ||
    record.propertyChanges.length > 0
  ) {
    return;
  }

  state.domRecords.delete(record.annotationId);
  const target = state.knownTargets.get(record.annotationId);
  if (target && state.liveAnnotationIds.get(target) === record.annotationId) {
    state.liveAnnotationIds.delete(target);
  }
}

function hasDesignReviewEvidence(record: BrowserDomAnnotationRecord): boolean {
  return Boolean(
    record.comment || record.designReview?.action || record.propertyChanges.length > 0
  );
}

function syncDesignReviewMarker(
  state: BrowserAnnotationRuntimeState,
  record: BrowserDomAnnotationRecord
): void {
  if (hasDesignReviewEvidence(record)) {
    if (record.markerNumber === undefined) {
      record.markerNumber = state.nextMarkerNumber;
      state.nextMarkerNumber += 1;
    }
    return;
  }

  delete record.markerNumber;
}

function setDesignReviewAction(
  state: BrowserAnnotationRuntimeState,
  input: BrowserDesignReviewActionInput
): void {
  const existingRecord = getRecordForTarget(state, input.target);
  if (!existingRecord && input.action === null) {
    return;
  }
  if (existingRecord?.designReview?.action === input.action) {
    return;
  }

  const record = existingRecord ?? createRecord(state, input);
  record.evidence = cloneEvidence(input.evidence);
  if (input.action === null) {
    delete record.designReview;
  } else {
    record.designReview = { action: input.action };
  }
  syncDesignReviewMarker(state, record);
  removeEmptyRecord(state, record);
  publish(state);
}

function clearDesignReview(state: BrowserAnnotationRuntimeState, target: Element): void {
  const record = getRecordForTarget(state, target);
  if (!record) {
    return;
  }

  const hasDesignReviewEvidence = Boolean(
    record.comment || record.designReview || record.propertyChanges.length > 0
  );
  if (!hasDesignReviewEvidence) {
    return;
  }

  delete record.comment;
  delete record.designReview;
  delete record.markerNumber;
  record.propertyChanges = [];
  removeEmptyRecord(state, record);
  publish(state);
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
  syncDesignReviewMarker(state, record);
  removeEmptyRecord(state, record);
  publish(state);
}

function applyTextChange(
  state: BrowserAnnotationRuntimeState,
  input: BrowserAnnotationTextChangeInput
): boolean {
  const existingRecord = getRecordForTarget(state, input.target);
  const baseline = existingRecord?.textChange?.before ?? input.before;
  const nextChange =
    baseline === input.after ? undefined : { after: input.after, before: baseline };

  if (!existingRecord && !nextChange) {
    return false;
  }
  if (
    existingRecord?.textChange?.before === nextChange?.before &&
    existingRecord?.textChange?.after === nextChange?.after
  ) {
    return false;
  }

  const record = existingRecord ?? createRecord(state, input);
  record.evidence = cloneEvidence(input.evidence);
  if (nextChange) {
    record.textChange = nextChange;
  } else {
    delete record.textChange;
  }
  removeEmptyRecord(state, record);
  return true;
}

function recordTextChanges(
  state: BrowserAnnotationRuntimeState,
  inputs: BrowserAnnotationTextChangesInput
): void {
  const changed = inputs.reduce(
    (didChange, input) => applyTextChange(state, input) || didChange,
    false
  );
  if (!changed) {
    return;
  }
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
    return existingRecord.markerNumber ?? null;
  }

  const record = existingRecord ?? createRecord(state, input);
  record.evidence = cloneEvidence(input.evidence);
  if (comment === '') {
    delete record.comment;
    syncDesignReviewMarker(state, record);
    removeEmptyRecord(state, record);
    publish(state);
    return null;
  }

  record.comment = comment;
  syncDesignReviewMarker(state, record);
  publish(state);
  return record.markerNumber ?? null;
}

function frameRecordsEqual(
  left: BrowserFrameAnnotationRecord,
  right: BrowserFrameAnnotationRecord
): boolean {
  return (
    left.borderPresetName === right.borderPresetName &&
    left.comment === right.comment &&
    left.frameId === right.frameId &&
    left.kind === right.kind &&
    left.linkedElementSelector === right.linkedElementSelector &&
    left.pageUrl === right.pageUrl &&
    left.rect.height === right.rect.height &&
    left.rect.width === right.rect.width &&
    left.rect.x === right.rect.x &&
    left.rect.y === right.rect.y &&
    left.viewport.height === right.viewport.height &&
    left.viewport.width === right.viewport.width
  );
}

function syncFrames(
  state: BrowserAnnotationRuntimeState,
  inputs: readonly BrowserFrameAnnotationInput[],
  updatedFrameIds: readonly string[] = inputs.map((input) => input.frameId)
): void {
  const nextIds = new Set(inputs.map((input) => input.frameId));
  const updatedIds = new Set(updatedFrameIds);
  let changed = false;

  state.frameOrders.forEach((_entry, frameId) => {
    if (!nextIds.has(frameId)) {
      state.frameOrders.delete(frameId);
      changed = true;
    }
  });

  inputs.forEach((input) => {
    const existing = state.frameOrders.get(input.frameId);
    if (!updatedIds.has(input.frameId)) {
      return;
    }
    if (existing) {
      const next = {
        ...input,
        creationOrder: existing.creationOrder,
        frameName: existing.frameName,
        rect: { ...input.rect },
        viewport: { ...input.viewport },
      };
      if (!frameRecordsEqual(existing, next)) {
        state.frameOrders.set(input.frameId, next);
        changed = true;
      }
      return;
    }
    const creationOrder = state.nextCreationOrder;
    state.frameOrders.set(input.frameId, {
      ...input,
      creationOrder,
      frameName: `Frame ${creationOrder}`,
      rect: { ...input.rect },
      viewport: { ...input.viewport },
    });
    state.nextCreationOrder += 1;
    changed = true;
  });

  if (changed) {
    publish(state);
  }
}

function cloneFrameRecords(
  records: BrowserFrameAnnotationRecord[]
): Map<string, BrowserFrameAnnotationRecord> {
  return new Map(records.map((entry) => [entry.frameId, cloneFrameRecord(entry)]));
}

function applySnapshot(
  state: BrowserAnnotationRuntimeState,
  snapshot: BrowserAnnotationSessionSnapshot,
  allocatorMode: 'exact' | 'monotonic' = 'monotonic'
): void {
  const resolveAllocator = (current: number, captured: number) =>
    allocatorMode === 'exact' ? captured : Math.max(current, captured);
  const nextAnnotationId = resolveAllocator(state.nextAnnotationId, snapshot.nextAnnotationId);
  const nextCreationOrder = resolveAllocator(state.nextCreationOrder, snapshot.nextCreationOrder);
  const nextMarkerNumber = resolveAllocator(state.nextMarkerNumber, snapshot.nextMarkerNumber);
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
  state.frameOrders = cloneFrameRecords(snapshot.frameOrders);
  state.liveAnnotationIds = nextLiveAnnotationIds;
  state.nextAnnotationId = nextAnnotationId;
  state.nextCreationOrder = nextCreationOrder;
  state.nextMarkerNumber = nextMarkerNumber;
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
    clearDesignReview: (target: Element): void => clearDesignReview(state, target),
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
      recordTextChanges(state, [input]),
    recordTextChanges: (inputs: BrowserAnnotationTextChangesInput): void =>
      recordTextChanges(state, inputs),
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
    setDesignReviewAction: (input: BrowserDesignReviewActionInput): void =>
      setDesignReviewAction(state, input),
    subscribe: (listener: BrowserAnnotationListener): (() => void) => {
      state.listeners.add(listener);
      return () => state.listeners.delete(listener);
    },
    syncFrames: (
      inputs: readonly BrowserFrameAnnotationInput[],
      updatedFrameIds?: readonly string[]
    ): void => syncFrames(state, inputs, updatedFrameIds),
  };
}

export const browserAnnotationSession = createBrowserAnnotationSession();
