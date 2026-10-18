import { renderTourCameraFrame } from './camera-frame.js';
import {
  resolveTourCamera,
  resolveTourEditingCamera,
  resolveTourFullViewCamera,
} from './camera.js';
import { renderTourMask } from './image-mask.js';
import { bindTourObjectDrag } from './authoring.js';
import {
  getTourSlideObjects,
  getTourHotspots,
  tourHotspotMask,
  resolveTourMask,
  resolveTourHighlightAnimation,
  resolveTourMarkerAppearance,
} from '@sniptale/runtime-contracts/scenario/types/tour';

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
    maskDefaults,
    style,
    fullView = false,
  }
) {
  if (!slide.image) {
    if (!slide.actions.length || slide.actions.some((entry) => entry.type === 'hotspot'))
      scene.append(element('p', 'tour-empty', labels.empty));
    return null;
  }
  const imageBox = authoring
    ? resolveTourEditingCamera(slide, { stageWidth, stageHeight })
    : fullView
      ? resolveTourFullViewCamera(slide, { stageWidth, stageHeight })
      : resolveTourCamera(slide, { stageWidth, stageHeight }, autoZoom);
  if (!imageBox) return null;
  const plane = element('div', 'tour-image-plane');
  scene.append(plane);
  const image = element('img', 'tour-image');
  const source = media.get(slide.image.assetId);
  if (source) image.src = source;
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
      renderTourMask(resolveTourMask(mask, maskDefaults), imageBox, slide.image.width, {
        element,
        labels,
        authoring: undefined,
        signal,
        animation: resolveTourHighlightAnimation(mask, maskDefaults),
      })
    );
  const explanations = getTourSlideObjects(slide).flatMap((entry) =>
    entry.type === 'mask' ? [] : [entry.object.id]
  );
  getTourHotspots(slide).forEach((hotspot) => {
    const number = explanations.indexOf(hotspot.id);
    const button = actionButton('', { kind: 'none' }, 'tour-hotspot', hotspot.id);
    const point = projectImagePoint(imageBox, hotspot.point);
    button.style.left = `${point.x}px`;
    button.style.top = `${point.y}px`;
    const marker = resolveTourMarkerAppearance(style, hotspot);
    button.style.setProperty('--tour-marker-color', marker.color ?? 'transparent');
    button.style.setProperty('--tour-marker-pulse-color', marker.pulseColor ?? style.accent);
    if (hotspot.markerAppearance || style.markerAppearance)
      button.style.setProperty('--tour-marker-size', `${marker.size}px`);
    button.dataset.pulse = String(hotspot.visual.kind === 'point' && hotspot.visual.pulse);
    button.hidden = point.x < 0 || point.y < 0 || point.x > stageWidth || point.y > stageHeight;
    button.title = hotspot.label;
    button.setAttribute('aria-label', hotspot.label || `${labels.point} ${number + 1}`);
    button.addEventListener('focus', () => hintController.select(number));
    button.addEventListener('click', () => {
      if (!authoring) onAction({ kind: 'next' });
    });
    const region = tourHotspotMask(hotspot);
    if (region) {
      const visual = renderTourMask(region, imageBox, slide.image.width, {
        element,
        labels,
        authoring,
        signal,
        animation: hotspot.visual.animation,
      });
      visual.dataset.tourObjectId = hotspot.id;
      visual.addEventListener('focus', () => hintController.select(number));
      if (hotspot.visual.kind === 'frame') {
        const effect = visual.querySelector('.tour-mask-effect');
        effect.style.background = 'transparent';
        effect.style.border = `${hotspot.visual.strokeWidth ?? 3}px solid ${hotspot.visual.color}`;
        effect.style.borderRadius = `${hotspot.visual.radius ?? 6}px`;
        effect.classList.add('tour-focus-frame');
      }
      if (!authoring) {
        visual.setAttribute('role', 'button');
        visual.setAttribute('aria-label', hotspot.label || `${labels.point} ${number + 1}`);
        visual.tabIndex = 0;
        visual.style.pointerEvents = 'auto';
        visual.addEventListener('click', () => onAction({ kind: 'next' }));
        visual.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            visual.click();
          }
        });
      }
      plane.append(visual);
      return;
    }
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
