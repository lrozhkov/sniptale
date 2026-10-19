import { getTourActionTitle } from '../project/tour-playback-plan';
import { resolveTourImageFrame } from './image-frame.js';
import { renderTourCameraFrame } from './camera-frame.js';
import {
  resolveTourCamera,
  resolveTourEditingCamera,
  resolveTourFullViewCamera,
} from './camera.js';
import { renderTourMask } from './image-mask.js';
import { bindTourImagePlacement, bindTourObjectDrag } from './authoring.js';
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

/** Window decoration and clipping share one passive DOM shell around the source plane. */
function renderTourImageWindow(slide, viewport, { scene, element, headers }) {
  const { stageWidth, stageHeight } = viewport;
  const frame = resolveTourImageFrame(slide, viewport);
  const clip = element('div', 'tour-image-viewport');
  if (frame.header) {
    const insets = [
      frame.content.y,
      stageWidth - frame.content.x - frame.content.width,
      stageHeight - frame.content.y - frame.content.height,
      frame.content.x,
    ]
      .map((value) => `${value}px`)
      .join(' ');
    clip.style.clipPath = `inset(${insets})`;
    const header = element('img', 'tour-window-header');
    header.alt = '';
    header.src = headers[`${slide.image.width}x${slide.image.height}`] ?? '';
    Object.assign(header.style, {
      left: `${frame.header.x}px`,
      top: `${frame.header.y}px`,
      width: `${frame.header.width}px`,
      height: `${frame.header.height}px`,
    });
    scene.append(header);
  }
  const plane = element('div', 'tour-image-plane');
  clip.append(plane);
  scene.append(clip);
  return { frame, plane, clip };
}

/** Renders bitmap, masks and targets through one source-to-stage geometry without owning navigation. */
export function renderTourImage(
  slide,
  viewport,
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
    headers = {},
  }
) {
  if (!slide.image) {
    if (!slide.actions.length || slide.actions.some((entry) => entry.type === 'hotspot'))
      scene.append(element('p', 'tour-empty', labels.empty));
    return null;
  }
  const imageBox = authoring
    ? resolveTourEditingCamera(slide, viewport)
    : fullView
      ? resolveTourFullViewCamera(slide, viewport)
      : resolveTourCamera(slide, viewport, autoZoom);
  if (!imageBox) return null;
  const { frame, plane, clip } = renderTourImageWindow(slide, viewport, {
    scene,
    element,
    headers,
  });
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
  if (authoring?.imageFrame) {
    bindTourImagePlacement(clip, plane, slide, imageBox, authoring, signal);
    return imageBox;
  }
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
    button.hidden =
      point.x < frame.content.x ||
      point.y < frame.content.y ||
      point.x > frame.content.x + frame.content.width ||
      point.y > frame.content.y + frame.content.height;
    const title = getTourActionTitle(hotspot, `${labels.point} ${number + 1}`);
    button.title = title;
    button.setAttribute('aria-label', title);
    if (authoring)
      button.addEventListener('focus', () => hintController.select(number), { signal });
    else hintController.bindTarget(button, number);
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
      if (authoring)
        visual.addEventListener('focus', () => hintController.select(number), { signal });
      else hintController.bindTarget(visual, number);
      if (hotspot.visual.kind === 'frame') {
        const effect = visual.querySelector('.tour-mask-effect');
        effect.style.background = 'transparent';
        effect.style.border = `${hotspot.visual.strokeWidth ?? 3}px solid ${hotspot.visual.color}`;
        effect.style.borderRadius = `${hotspot.visual.radius ?? 6}px`;
        effect.classList.add('tour-focus-frame');
      }
      if (!authoring) {
        visual.setAttribute('role', 'button');
        visual.setAttribute('aria-label', title);
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
    const frame = renderTourCameraFrame(slide, viewport, imageBox, {
      element,
      labels,
      authoring,
      signal,
    });
    if (frame) scene.append(frame);
  }
  return imageBox;
}
