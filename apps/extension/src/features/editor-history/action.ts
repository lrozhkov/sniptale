import { isPlainRecord } from '@sniptale/runtime-contracts/validation/primitives';

/** Stable change primitives; tools use the capture boundary rather than registering history types. */
const EDITOR_HISTORY_OPERATIONS = [
  'add',
  'remove',
  'move',
  'resize',
  'rotate',
  'reorder',
  'text',
  'fill',
  'stroke',
  'rename',
  'visibility',
  'lock',
  'update',
] as const;

/** Locale-independent description of one admitted user action, shared by editor adapters. */
export interface EditorHistoryAction {
  operation: (typeof EDITOR_HISTORY_OPERATIONS)[number];
  target: { id: string; name: string | null } | null;
  /** CSS color values, never inferred human color names. */
  color?: { before: string | null; after: string | null };
}

/** A selectable retained state. Grouping is a presentation concern, not another action. */
export interface EditorHistoryEntry {
  index: number;
  action: EditorHistoryAction | null;
  pending: boolean;
}

/** Parses shared history metadata without tool-specific registration or localized labels. */
function parseEditorHistoryAction(value: unknown): EditorHistoryAction | null | undefined {
  if (value === null) return null;
  if (
    !isPlainRecord(value) ||
    Object.keys(value).some((key) => !['operation', 'target', 'color'].includes(key))
  )
    return undefined;
  const operation = EDITOR_HISTORY_OPERATIONS.find((operation) => operation === value['operation']);
  if (!operation) return undefined;
  let target: EditorHistoryAction['target'] = null;
  if (value['target'] !== null) {
    const raw = value['target'];
    if (
      !isPlainRecord(raw) ||
      Object.keys(raw).length !== 2 ||
      typeof raw['id'] !== 'string' ||
      !raw['id'].length ||
      !(raw['name'] === null || typeof raw['name'] === 'string')
    )
      return undefined;
    target = { id: raw['id'], name: raw['name'] };
  }
  const rawColor = value['color'];
  if (rawColor === undefined) return { operation, target };
  if (
    !isPlainRecord(rawColor) ||
    Object.keys(rawColor).length !== 2 ||
    !(rawColor['before'] === null || typeof rawColor['before'] === 'string') ||
    !(rawColor['after'] === null || typeof rawColor['after'] === 'string')
  )
    return undefined;
  return { operation, target, color: { before: rawColor['before'], after: rawColor['after'] } };
}

/** A retained history cursor identifies one state within the admitted trail. */
export function isEditorHistoryCursor(cursor: unknown, snapshotCount: number): cursor is number {
  return (
    typeof cursor === 'number' &&
    Number.isSafeInteger(cursor) &&
    cursor >= 0 &&
    cursor < snapshotCount
  );
}

/** The baseline has no action. Every later state has one admitted editor operation. */
export function parseEditorHistoryActions(
  rawActions: readonly unknown[]
): (EditorHistoryAction | null)[] | null {
  const actions: (EditorHistoryAction | null)[] = [];
  for (const [index, raw] of rawActions.entries()) {
    const action = parseEditorHistoryAction(raw);
    if (action === undefined || (index === 0 ? action !== null : action === null)) return null;
    actions.push(action);
  }
  return actions;
}
