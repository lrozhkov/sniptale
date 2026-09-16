import { renderTourCameraFrame } from './camera-frame.js';
import { resolveTourCamera, resolveTourEditingCamera } from './camera.js';
import { renderTourMask } from './image-mask.js';
import { bindTourObjectDrag } from './authoring.js';

function projectImagePoint(box, point) {
  return { x: box.x + point.x * box.width, y: box.y + point.y * box.height };
}

/** Renders bitmap, masks and targets through one source-to-stage geometry without owning navigation. */
export function renderTourImage(
  slide,
  { stageWidth, stageHeight },
  {
    scene,
    element,
    labels,
    media,
    actionButton,
    hintController,
    onAction,
    authoring,
    signal,
    autoZoom,
  }
) {
  if (!slide.image) {
    scene.append(element('p', 'tour-empty', labels.empty));
    return null;
  }
  const imageBox = authoring
    ? resolveTourEditingCamera(slide, { stageWidth, stageHeight })
    : resolveTourCamera(slide, { stageWidth, stageHeight }, autoZoom);
  if (!imageBox) return null;
  const plane = element('div', 'tour-image-plane');
  scene.append(plane);
  const image = element('img', 'tour-image');
  image.src = media.get(slide.image.assetId);
  image.alt = slide.image.alt;
  Object.assign(image.style, {
    left: `${imageBox.x}px`,
    top: `${imageBox.y}px`,
    width: `${imageBox.width}px`,
    height: `${imageBox.height}px`,
  });
  plane.append(image);
  for (const mask of slide.masks)
    plane.append(
      renderTourMask(mask, imageBox, slide.image.width, { element, labels, authoring, signal })
    );
  slide.hotspots.forEach((hotspot, number) => {
    const button = actionButton(
      '',
      hotspot.action.kind === 'url' ? hotspot.action : { kind: 'none' },
      'tour-hotspot',
      hotspot.id
    );
    const point = projectImagePoint(imageBox, hotspot.point);
    button.style.left = `${point.x}px`;
    button.style.top = `${point.y}px`;
    button.dataset.pulse = String(hotspot.pulse);
    button.hidden = point.x < 0 || point.y < 0 || point.x > stageWidth || point.y > stageHeight;
    button.title = hotspot.label;
    button.setAttribute('aria-label', hotspot.label || `${labels.point} ${number + 1}`);
    button.addEventListener('pointerenter', () => {
      hintController.select(number);
    });
    button.addEventListener('focus', () => {
      hintController.select(number);
    });
    button.addEventListener('click', () => {
      if (authoring) return;
      if (hintController.activeIndex !== number) {
        hintController.select(number);
      } else if (hotspot.action.kind !== 'url') onAction(hotspot.action);
    });
    if (authoring)
      bindTourObjectDrag(
        button,
        { id: hotspot.id, point: hotspot.point },
        imageBox,
        authoring,
        signal
      );
    scene.append(button);
  });
  if (authoring)
    for (const annotation of slide.annotations) {
      const anchor = annotation.anchor ?? { x: 0.5, y: 0.5 };
      const marker = actionButton(
        'i',
        { kind: 'none' },
        'tour-hotspot tour-annotation-anchor',
        annotation.id
      );
      const position = projectImagePoint(imageBox, anchor);
      marker.style.left = `${position.x}px`;
      marker.style.top = `${position.y}px`;
      marker.setAttribute('aria-label', labels.details);
      bindTourObjectDrag(marker, { id: annotation.id, point: anchor }, imageBox, authoring, signal);
      scene.append(marker);
    }
  if (authoring?.cameraFrame && slide.camera.mode === 'manual') {
    const frame = renderTourCameraFrame(slide, { stageWidth, stageHeight }, imageBox, {
      element,
      labels,
      authoring,
      signal,
    });
    if (frame) scene.append(frame);
  }
  return imageBox;
}
