import type { BrowserDomAnnotationRecord } from '../annotations';
import type { PagePreparationChangeScope, PagePreparationSessionSnapshot } from './types';

const DESIGN_FIELDS = ['propertyChanges', 'comment', 'designReview', 'markerNumber'] as const;

function recordsForScope(
  before: readonly BrowserDomAnnotationRecord[],
  after: readonly BrowserDomAnnotationRecord[],
  current: readonly BrowserDomAnnotationRecord[],
  scope: 'content-editing' | 'design-review'
): BrowserDomAnnotationRecord[] {
  const records = new Map(current.map((record) => [record.annotationId, structuredClone(record)]));
  const beforeRecords = new Map(before.map((record) => [record.annotationId, record]));
  const afterRecords = new Map(after.map((record) => [record.annotationId, record]));
  const fields = scope === 'content-editing' ? (['textChange'] as const) : DESIGN_FIELDS;
  for (const id of new Set([...beforeRecords.keys(), ...afterRecords.keys()])) {
    const previous = beforeRecords.get(id);
    const next = afterRecords.get(id);
    if (
      fields.every((field) => JSON.stringify(previous?.[field]) === JSON.stringify(next?.[field]))
    ) {
      continue;
    }
    const source = next ?? previous;
    if (!source) continue;
    const record = records.get(id) ?? {
      annotationId: source.annotationId,
      creationOrder: source.creationOrder,
      evidence: structuredClone(source.evidence),
      propertyChanges: [],
    };
    for (const field of fields) {
      if (JSON.stringify(previous?.[field]) === JSON.stringify(next?.[field])) continue;
      // These producer-owned fields are replaced independently of foreign evidence on the target.
      Object.assign(record, { [field]: structuredClone(next?.[field]) });
      if (next?.[field] === undefined) Reflect.deleteProperty(record, field);
    }
    record.propertyChanges ??= [];
    if (
      record.textChange ||
      record.comment ||
      record.designReview?.action ||
      record.propertyChanges.length
    ) {
      records.set(id, record);
    } else {
      records.delete(id);
    }
  }
  return [...records.values()].sort((left, right) => left.creationOrder - right.creationOrder);
}

/** Applies only the producer's snapshot delta to the current factual session. */
export function applyScopedSnapshotDelta(
  before: PagePreparationSessionSnapshot,
  after: PagePreparationSessionSnapshot,
  current: PagePreparationSessionSnapshot,
  scope: PagePreparationChangeScope
): PagePreparationSessionSnapshot {
  const next = structuredClone(current);
  if (scope === 'annotation') {
    next.frameSession = structuredClone(after.frameSession);
    next.annotations.frameOrders = structuredClone(after.annotations.frameOrders);
  } else if (scope !== 'drawing') {
    next.annotations.domRecords = recordsForScope(
      before.annotations.domRecords,
      after.annotations.domRecords,
      current.annotations.domRecords,
      scope
    );
  }
  next.annotations.nextAnnotationId = Math.max(
    current.annotations.nextAnnotationId,
    after.annotations.nextAnnotationId
  );
  next.annotations.nextCreationOrder = Math.max(
    current.annotations.nextCreationOrder,
    after.annotations.nextCreationOrder
  );
  next.annotations.nextMarkerNumber = Math.max(
    current.annotations.nextMarkerNumber,
    after.annotations.nextMarkerNumber
  );
  return next;
}
