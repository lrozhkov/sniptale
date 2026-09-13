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
    camera,
  }
) {
  if (!slide.image) {
    scene.append(element('p', 'tour-empty', labels.empty));
    return null;
  }
  const imageBox = camera.resolve(slide, { stageWidth, stageHeight }, autoZoom);
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
  for (const mask of slide.masks) {
    const box = element(authoring ? 'button' : 'div', `tour-mask tour-mask-${mask.kind}`);
    const position = projectImagePoint(imageBox, mask.rect);
    Object.assign(box.style, {
      left: `${position.x}px`,
      top: `${position.y}px`,
      width: `${mask.rect.width * imageBox.width}px`,
      height: `${mask.rect.height * imageBox.height}px`,
      background: mask.kind === 'highlight' || mask.kind === 'redact' ? mask.color : 'transparent',
      opacity: String(mask.opacity),
    });
    if (mask.kind === 'spotlight') box.style.boxShadow = `0 0 0 100vmax ${mask.color}`;
    if (authoring) {
      box.type = 'button';
      box.setAttribute('aria-label', labels.details);
      box.style.pointerEvents = 'auto';
      box.addEventListener('click', () => authoring.onSelectObject(mask.id));
      bindTourObjectDrag(
        box,
        { id: mask.id, point: mask.rect, maxX: 1 - mask.rect.width, maxY: 1 - mask.rect.height },
        imageBox,
        authoring,
        signal
      );
    }
    plane.append(box);
  }
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
  return imageBox;
}
