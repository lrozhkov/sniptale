/** Stable change primitives; tools use the capture boundary rather than registering history types. */
export const EDITOR_HISTORY_OPERATIONS = [
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
