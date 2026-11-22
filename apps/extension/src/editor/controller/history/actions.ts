import { isPlainRecord } from '@sniptale/runtime-contracts/validation/primitives';
import type { EditorHistoryAction } from '../../../features/editor-history/action';

type Version = { token: string; id: string; name: string | null };
export type EditorHistoryDescription = {
  objects: Version[];
  document: Record<string, unknown>;
};

/** Captures lightweight identities while the encoder already visits current object versions. */
export function describeEditorHistoryObject(token: string, object: unknown): Version | null {
  if (!isPlainRecord(object)) return null;
  const id = object['sniptaleId'] ?? object['id'];
  if (typeof id !== 'string') return null;
  const source = object['source'];
  const name = object['sniptaleLabel'] ?? (isPlainRecord(source) ? source['name'] : null);
  return { token, id, name: typeof name === 'string' ? name : null };
}

function sameValue(left: unknown, right: unknown): boolean {
  return left === right || JSON.stringify(left) === JSON.stringify(right);
}

function changedFields(left: Record<string, unknown>, right: Record<string, unknown>): string[] {
  return [...new Set([...Object.keys(left), ...Object.keys(right)])].filter(
    (key) => !sameValue(left[key], right[key])
  );
}

function color(value: unknown): string | null {
  if (typeof value === 'string') return value;
  return isPlainRecord(value) && typeof value['color'] === 'string' ? value['color'] : null;
}

function flatOperation(fields: string[]): EditorHistoryAction['operation'] | null {
  const only = (...names: string[]) =>
    fields.length > 0 && fields.every((key) => names.includes(key));
  const includes = (...names: string[]) => fields.some((key) => names.includes(key));
  // Canonical drawings update their geometry metadata together with the Fabric transform.
  if (only('left', 'top', 'sniptaleDrawingJson') && includes('left', 'top')) return 'move';
  if (
    only('width', 'height', 'scaleX', 'scaleY', 'left', 'top', 'sniptaleDrawingJson') &&
    includes('width', 'height', 'scaleX', 'scaleY')
  )
    return 'resize';
  if (
    only('angle', 'rotation', 'left', 'top', 'sniptaleDrawingJson') &&
    includes('angle', 'rotation')
  )
    return 'rotate';
  if (only('sniptaleLabel')) return 'rename';
  if (only('visible')) return 'visibility';
  if (only('sniptaleLocked', 'sniptaleContentLocked')) return 'lock';
  if (
    only(
      'text',
      'styles',
      'fontFamily',
      'fontSize',
      'fontWeight',
      'fontStyle',
      'underline',
      'linethrough'
    )
  )
    return 'text';
  if (only('fill')) return 'fill';
  if (only('stroke', 'strokeWidth', 'strokeDashArray')) return 'stroke';
  return null;
}

function fillAction(
  before: unknown,
  after: unknown,
  target: EditorHistoryAction['target']
): EditorHistoryAction {
  return { operation: 'fill', target, color: { before: color(before), after: color(after) } };
}

function describeObjectChange(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  target: EditorHistoryAction['target']
): EditorHistoryAction {
  const fields = changedFields(before, after);
  const operation = flatOperation(fields);
  if (operation === 'fill') return fillAction(before['fill'], after['fill'], target);
  if (operation) return { operation, target };
  const fallback: EditorHistoryAction = { operation: 'update', target };
  if (fields.length !== 1) return fallback;
  const field = fields[0]!;
  const previous = before[field];
  const next = after[field];
  if (!isPlainRecord(previous) || !isPlainRecord(next)) return fallback;
  // Rich shapes keep geometry, layer state and paint in structured fields.
  const nested = changedFields(previous, next);
  if (field === 'frame')
    return {
      operation: nested.every((key) => key === 'left' || key === 'top') ? 'move' : 'resize',
      target,
    };
  if (nested.length !== 1) return fallback;
  if (field === 'layer') {
    if (nested[0] === 'visible') return { operation: 'visibility', target };
    if (nested[0] === 'locked') return { operation: 'lock', target };
    if (nested[0] === 'zIndex') return { operation: 'reorder', target };
  }
  if (field === 'style') {
    if (nested[0] === 'fill') return fillAction(previous['fill'], next['fill'], target);
    if (nested[0] === 'line') return { operation: 'stroke', target };
  }
  return fallback;
}

/** Describes adjacent pooled versions. No tool registry, media decoding, or old-document walk. */
export function describeEditorHistoryAction(
  before: EditorHistoryDescription,
  after: EditorHistoryDescription,
  readVersion: (token: string) => string | undefined
): EditorHistoryAction {
  const previous = new Map(before.objects.map((object) => [object.id, object]));
  const next = new Map(after.objects.map((object) => [object.id, object]));
  const added = after.objects.filter((object) => !previous.has(object.id));
  const removed = before.objects.filter((object) => !next.has(object.id));
  const changed = after.objects.filter((object) => {
    const old = previous.get(object.id);
    return old && old.token !== object.token;
  });
  const targetOf = (object: Version | undefined) =>
    object ? { id: object.id, name: object.name } : null;
  if (added.length && !removed.length && !changed.length)
    return { operation: 'add', target: added.length === 1 ? targetOf(added[0]) : null };
  if (removed.length && !added.length && !changed.length)
    return { operation: 'remove', target: removed.length === 1 ? targetOf(removed[0]) : null };
  if (!added.length && !removed.length && changed.length === 1) {
    const object = changed[0]!;
    const old = previous.get(object.id)!;
    const left = readVersion(old.token);
    const right = readVersion(object.token);
    const parsedLeft: unknown = left === undefined ? null : JSON.parse(left);
    const parsedRight: unknown = right === undefined ? null : JSON.parse(right);
    if (isPlainRecord(parsedLeft) && isPlainRecord(parsedRight))
      return describeObjectChange(parsedLeft, parsedRight, targetOf(object));
  }
  if (!added.length && !removed.length && !changed.length) {
    const reordered = before.objects.find(
      (object, index) => object.id !== after.objects[index]?.id
    );
    if (reordered) return { operation: 'reorder', target: null };
    const fields = changedFields(before.document, after.document);
    if (fields.length === 1 && fields[0] === 'displayName')
      return { operation: 'rename', target: null };
    if (fields.some((key) => key === 'canvasWidth' || key === 'canvasHeight'))
      return { operation: 'resize', target: null };
  }
  return { operation: 'update', target: changed.length === 1 ? targetOf(changed[0]) : null };
}
