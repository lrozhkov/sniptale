/** Locale-independent description of one admitted user action, shared by editor adapters. */
export interface EditorHistoryAction {
  operation:
    | 'add'
    | 'remove'
    | 'move'
    | 'resize'
    | 'rotate'
    | 'reorder'
    | 'text'
    | 'fill'
    | 'stroke'
    | 'rename'
    | 'visibility'
    | 'lock'
    | 'update';
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
