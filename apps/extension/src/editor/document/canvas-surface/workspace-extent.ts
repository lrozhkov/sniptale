export type EditorWorkspaceInsets = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

type DocumentSize = { width: number; height: number };
type CropBounds = { left: number; top: number; width: number; height: number };

export function createEditorWorkspaceInsets(margin: number): EditorWorkspaceInsets {
  return { left: margin, top: margin, right: margin, bottom: margin };
}

/** Rebase the same scrollable world rectangle when the crop changes document origin. */
export function rebaseEditorWorkspaceInsets(
  current: EditorWorkspaceInsets,
  documentSize: DocumentSize,
  crop: CropBounds,
  minimumInset: number
): { insets: EditorWorkspaceInsets; scrollX: number; scrollY: number } {
  const raw = {
    left: current.left + crop.left,
    top: current.top + crop.top,
    right: current.right + documentSize.width - crop.left - crop.width,
    bottom: current.bottom + documentSize.height - crop.top - crop.height,
  };
  const insets = {
    left: Math.max(minimumInset, raw.left),
    top: Math.max(minimumInset, raw.top),
    right: Math.max(minimumInset, raw.right),
    bottom: Math.max(minimumInset, raw.bottom),
  };
  return {
    insets,
    scrollX: insets.left - raw.left,
    scrollY: insets.top - raw.top,
  };
}

export function getEditorWorkspaceSurfaceSize(
  size: DocumentSize,
  insets: EditorWorkspaceInsets
): DocumentSize {
  return {
    width: size.width + insets.left + insets.right,
    height: size.height + insets.top + insets.bottom,
  };
}
