import type { EditorTextLayoutMode } from '../../../../features/editor/document/text';

export function normalizeTextLayoutMode(value: unknown): EditorTextLayoutMode {
  return value === 'auto' ? 'auto' : 'fixed-width';
}
