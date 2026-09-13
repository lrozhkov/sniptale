const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

/** Resolves one source-image projection shared by pixels, overlays and authoring hit tests. */
export function resolveTourCamera(slide, viewport, autoZoom) {
  if (!slide.image || viewport.stageWidth <= 0 || viewport.stageHeight <= 0) return null;
  const { stageWidth, stageHeight } = viewport;
  const scale = (slide.fit === 'cover' ? Math.max : Math.min)(
    stageWidth / slide.image.width,
    stageHeight / slide.image.height
  );
  const baseWidth = slide.image.width * scale;
  const baseHeight = slide.image.height * scale;
  const minimumZoom = Math.min(stageWidth / baseWidth, stageHeight / baseHeight);
  const automatic =
    !slide.requiresTargetReview &&
    slide.hotspots.length === 1 &&
    (slide.camera.mode === 'auto' || (slide.camera.mode === 'inherit' && autoZoom));
  const camera =
    slide.camera.mode === 'manual'
      ? slide.camera
      : automatic
        ? autoCamera(slide.hotspots[0], baseWidth, baseHeight, stageWidth, stageHeight, minimumZoom)
        : { zoom: 1, center: { x: 0.5, y: 0.5 } };
  const zoom = clamp(camera.zoom, automatic ? minimumZoom : 1, 8);
  const width = baseWidth * zoom;
  const height = baseHeight * zoom;
  const center = {
    x: boundedCenter(camera.center.x, width, stageWidth),
    y: boundedCenter(camera.center.y, height, stageHeight),
  };
  return {
    x: stageWidth / 2 - center.x * width,
    y: stageHeight / 2 - center.y * height,
    width,
    height,
    zoom,
    center,
  };
}

function boundedCenter(center, imageSize, viewportSize) {
  if (imageSize <= viewportSize) return 0.5;
  const half = viewportSize / (2 * imageSize);
  return clamp(center, half, 1 - half);
}

/** Fits the recorded target and click point together, leaving surrounding screenshot context. */
function autoCamera(hotspot, width, height, stageWidth, stageHeight, minimumZoom) {
  const rect = hotspot.targetRect;
  const left = Math.min(hotspot.point.x, rect?.x ?? hotspot.point.x);
  const top = Math.min(hotspot.point.y, rect?.y ?? hotspot.point.y);
  const right = Math.max(hotspot.point.x, rect ? rect.x + rect.width : hotspot.point.x);
  const bottom = Math.max(hotspot.point.y, rect ? rect.y + rect.height : hotspot.point.y);
  const contextWidth = Math.max(0.2, (right - left) * 1.5);
  const contextHeight = Math.max(0.2, (bottom - top) * 1.5);
  return {
    zoom: clamp(
      Math.min(stageWidth / (width * contextWidth), stageHeight / (height * contextHeight)),
      minimumZoom,
      4
    ),
    center: { x: (left + right) / 2, y: (top + bottom) / 2 },
  };
}

/** Holds the authoring camera while targets move; navigation or explicit camera edits refit it. */
export function createTourCameraSession(authoring) {
  let key = null;
  let reference = null;
  return {
    resolve(slide, viewport, autoZoom) {
      if (!authoring) return resolveTourCamera(slide, viewport, autoZoom);
      const nextKey = JSON.stringify([
        slide.id,
        slide.image?.assetId,
        slide.image?.editDocumentId,
        slide.image?.width,
        slide.image?.height,
        slide.camera,
        slide.fit,
        slide.requiresTargetReview,
        slide.hotspots.map((hotspot) => hotspot.id),
        autoZoom,
      ]);
      if (key !== nextKey) {
        key = nextKey;
        reference = slide;
      }
      return resolveTourCamera(reference, viewport, autoZoom);
    },
    reset() {
      key = null;
      reference = null;
    },
  };
}
