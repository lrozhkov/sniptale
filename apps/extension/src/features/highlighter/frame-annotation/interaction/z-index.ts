/** Canonical stacking order for the live frame-annotation DOM surface. */
export const FRAME_ANNOTATION_Z_INDEX = {
  frameIdleMax: 2_147_483_640,
  blockingOverlay: 2_147_483_641,
  frameActive: 2_147_483_642,
  editingOverlay: 2_147_483_643,
  calloutViewing: 2_147_483_645,
  stepBadge: 2_147_483_645,
  calloutEditing: 2_147_483_646,
  resizeHandles: 2_147_483_644,
  floatingUi: 2_147_483_647,
} as const;
