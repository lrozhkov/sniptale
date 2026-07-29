import {
  BROWSER_ANNOTATION_SCHEMA_VERSION,
  type BrowserAnnotationCommentInput,
  type BrowserAnnotationPropertyChange,
  type BrowserAnnotationPropertyChangeInput,
  type BrowserAnnotationSessionSnapshot,
  type BrowserAnnotationSessionState,
  type BrowserAnnotationTargetEvidence,
  type BrowserAnnotationTextChangeInput,
  type BrowserDomAnnotationRecord,
  type BrowserFrameAnnotationOrder,
} from './types';
import { createLogger } from '@sniptale/platform/observability/logger';

const logger = createLogger({ namespace: 'ContentBrowserAnnotationSession' });

type BrowserAnnotationListener = () => void;

interface BrowserAnnotationRuntimeState {
  domRecords: Map<string, BrowserDomAnnotationRecord>;
  frameOrders: Map<string, BrowserFrameAnnotationOrder>;
  listeners: Set<BrowserAnnotationListener>;
  nextAnnotationId: number;
  nextCommentMarker: number;
  nextCreationOrder: number;
  revision: number;
}

function createEmptyRuntimeState(): BrowserAnnotationRuntimeState {
  return {
    domRecords: new Map(),
    frameOrders: new Map(),
    listeners: new Set(),
    nextAnnotationId: 1,
    nextCommentMarker: 1,
    nextCreationOrder: 1,
    revision: 0,
  };
}

function cloneDomRecord(record: BrowserDomAnnotationRecord): BrowserDomAnnotationRecord {
  return {
    ...record,
    evidence: {
      ...record.evidence,
      frame: { ...record.evidence.frame },
      nodePosition: { ...record.evidence.nodePosition },
      viewport: { ...record.evidence.viewport },
    },
    propertyChanges: record.propertyChanges.map((change) => ({ ...change })),
    ...(record.textChange ? { textChange: { ...record.textChange } } : {}),
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

function createRecord(
  state: BrowserAnnotationRuntimeState,
  input: Pick<BrowserAnnotationPropertyChangeInput, 'evidence' | 'targetKey'>
): BrowserDomAnnotationRecord {
  const record: BrowserDomAnnotationRecord = {
    annotationId: state.nextAnnotationId,
    creationOrder: state.nextCreationOrder,
    evidence: cloneEvidence(input.evidence),
    propertyChanges: [],
    targetKey: input.targetKey,
  };
  state.nextAnnotationId += 1;
  state.nextCreationOrder += 1;
  state.domRecords.set(input.targetKey, record);
  return record;
}

function removeEmptyRecord(state: BrowserAnnotationRuntimeState, targetKey: string): void {
  const record = state.domRecords.get(targetKey);
  if (record && !record.comment && !record.textChange && record.propertyChanges.length === 0) {
    state.domRecords.delete(targetKey);
  }
}

function normalizePropertyChanges(
  changes: BrowserAnnotationPropertyChange[]
): BrowserAnnotationPropertyChange[] {
  return changes
    .map((change) => ({ ...change }))
    .sort((left, right) => left.order - right.order || left.property.localeCompare(right.property));
}

function recordPropertyChange(
  state: BrowserAnnotationRuntimeState,
  input: BrowserAnnotationPropertyChangeInput
): void {
  const existingRecord = state.domRecords.get(input.targetKey);
  const existingChange = existingRecord?.propertyChanges.find(
    (change) => change.property === input.property
  );
  const baseline = existingChange?.before ?? input.before;

  if (!existingRecord && baseline === input.after) {
    return;
  }

  const record = existingRecord ?? createRecord(state, input);
  if (existingRecord) {
    record.evidence = cloneEvidence(input.evidence);
  }
  record.propertyChanges = record.propertyChanges.filter(
    (change) => change.property !== input.property
  );

  if (baseline !== input.after) {
    record.propertyChanges.push({
      after: input.after,
      before: baseline,
      order: input.order,
      property: input.property,
    });
    record.propertyChanges = normalizePropertyChanges(record.propertyChanges);
  }

  removeEmptyRecord(state, input.targetKey);
  publish(state);
}

function recordTextChange(
  state: BrowserAnnotationRuntimeState,
  input: BrowserAnnotationTextChangeInput
): void {
  const existingRecord = state.domRecords.get(input.targetKey);
  const baseline = existingRecord?.textChange?.before ?? input.before;

  if (!existingRecord && baseline === input.after) {
    return;
  }

  const record = existingRecord ?? createRecord(state, input);
  if (existingRecord) {
    record.evidence = cloneEvidence(input.evidence);
  }
  if (baseline === input.after) {
    delete record.textChange;
  } else {
    record.textChange = { after: input.after, before: baseline };
  }
  removeEmptyRecord(state, input.targetKey);
  publish(state);
}

function setComment(
  state: BrowserAnnotationRuntimeState,
  input: BrowserAnnotationCommentInput
): number | null {
  const comment = input.comment.trim() === '' ? '' : input.comment;
  const existingRecord = state.domRecords.get(input.targetKey);
  if (!existingRecord && comment === '') {
    return null;
  }

  const record = existingRecord ?? createRecord(state, input);
  if (existingRecord) {
    record.evidence = cloneEvidence(input.evidence);
  }

  if (comment === '') {
    delete record.comment;
    delete record.commentMarker;
    removeEmptyRecord(state, input.targetKey);
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
  snapshot: BrowserAnnotationSessionSnapshot
): void {
  const nextAnnotationId = Math.max(state.nextAnnotationId, snapshot.nextAnnotationId);
  const nextCommentMarker = Math.max(state.nextCommentMarker, snapshot.nextCommentMarker);
  const nextCreationOrder = Math.max(state.nextCreationOrder, snapshot.nextCreationOrder);

  state.domRecords = new Map(
    snapshot.domRecords.map((record) => [record.targetKey, cloneDomRecord(record)])
  );
  state.frameOrders = new Map(snapshot.frameOrders.map((entry) => [entry.frameId, { ...entry }]));
  state.nextAnnotationId = nextAnnotationId;
  state.nextCommentMarker = nextCommentMarker;
  state.nextCreationOrder = nextCreationOrder;
  publish(state);
}

/** Creates the sole mutable authority for annotations in one content-document session. */
export function createBrowserAnnotationSession() {
  const state = createEmptyRuntimeState();

  return {
    applySnapshot: (snapshot: BrowserAnnotationSessionSnapshot): void =>
      applySnapshot(state, snapshot),
    captureSnapshot: (): BrowserAnnotationSessionSnapshot => createSnapshot(state),
    getState: (): BrowserAnnotationSessionState => ({
      ...createSnapshot(state),
      revision: state.revision,
    }),
    recordPropertyChange: (input: BrowserAnnotationPropertyChangeInput): void =>
      recordPropertyChange(state, input),
    recordTextChange: (input: BrowserAnnotationTextChangeInput): void =>
      recordTextChange(state, input),
    resetForDocument: (): void => {
      const listeners = state.listeners;
      Object.assign(state, createEmptyRuntimeState(), { listeners });
      publish(state);
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
