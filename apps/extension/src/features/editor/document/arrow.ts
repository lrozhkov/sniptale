export const EDITOR_ARROW_HEAD_SIZE_MIN = 1;
export const EDITOR_ARROW_HEAD_SIZE_MAX = 6;
export const EDITOR_ARROW_HEAD_SIZE_DEFAULT = 1;

export function normalizeEditorArrowHeadSize(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(EDITOR_ARROW_HEAD_SIZE_MAX, Math.max(EDITOR_ARROW_HEAD_SIZE_MIN, value))
    : EDITOR_ARROW_HEAD_SIZE_DEFAULT;
}
