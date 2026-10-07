import {
  invertQuickEditProjection,
  projectQuickEditPoint,
  type QuickEditHomography,
} from '../../features/video/review/advanced/spatial-geometry';

/** Freeze the inverse and viewport at pointer-down so a live camera cannot feed back into its drag. */
export function captureReviewSpatialPointer(
  node: HTMLElement,
  projection: QuickEditHomography | undefined,
  output: { width: number; height: number }
) {
  const inverse = projection ? invertQuickEditProjection(projection) : null;
  const stage = node.closest('[data-ui="gallery.videoReview.stage"]') ?? node;
  const bounds = stage.getBoundingClientRect();
  return (event: { clientX: number; clientY: number }) => {
    if (!inverse) return { x: event.clientX, y: event.clientY };
    const point = {
      x: ((event.clientX - bounds.left) * output.width) / Math.max(1, bounds.width),
      y: ((event.clientY - bounds.top) * output.height) / Math.max(1, bounds.height),
    };
    return projectQuickEditPoint(inverse, point) ?? point;
  };
}
