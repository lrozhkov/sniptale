function projectImagePoint(box, point) {
  return { x: box.x + point.x * box.width, y: box.y + point.y * box.height };
}

/** Renders bitmap, masks and targets through one source-to-stage geometry without owning navigation. */
export function renderTourImage(
  slide,
  { stageWidth, stageHeight },
  { scene, element, labels, media, actionButton, hintController, onAction }
) {
  if (!slide.image) {
    scene.append(element('p', 'tour-empty', labels.empty));
    return null;
  }
  const scale =
    slide.fit === 'cover'
      ? Math.max(stageWidth / slide.image.width, stageHeight / slide.image.height)
      : Math.min(stageWidth / slide.image.width, stageHeight / slide.image.height);
  const imageBox = {
    width: slide.image.width * scale,
    height: slide.image.height * scale,
    x: (stageWidth - slide.image.width * scale) / 2,
    y: (stageHeight - slide.image.height * scale) / 2,
  };
  const zoom = slide.camera.mode === 'manual' ? slide.camera.zoom : 1;
  const center = slide.camera.mode === 'manual' ? slide.camera.center : { x: 0.5, y: 0.5 };
  imageBox.width *= zoom;
  imageBox.height *= zoom;
  imageBox.x = stageWidth / 2 - center.x * imageBox.width;
  imageBox.y = stageHeight / 2 - center.y * imageBox.height;
  const image = element('img', 'tour-image');
  image.src = media.get(slide.image.assetId);
  image.alt = slide.image.alt;
  Object.assign(image.style, {
    left: `${imageBox.x}px`,
    top: `${imageBox.y}px`,
    width: `${imageBox.width}px`,
    height: `${imageBox.height}px`,
  });
  scene.append(image);
  for (const mask of slide.masks) {
    const box = element('div', `tour-mask tour-mask-${mask.kind}`);
    const position = projectImagePoint(imageBox, mask.rect);
    Object.assign(box.style, {
      left: `${position.x}px`,
      top: `${position.y}px`,
      width: `${mask.rect.width * imageBox.width}px`,
      height: `${mask.rect.height * imageBox.height}px`,
      background: mask.kind === 'highlight' ? mask.color : 'transparent',
      opacity: String(mask.opacity),
    });
    if (mask.kind === 'spotlight') box.style.boxShadow = `0 0 0 100vmax ${mask.color}`;
    scene.append(box);
  }
  slide.hotspots.forEach((hotspot, number) => {
    const button = actionButton(
      String(number + 1),
      hotspot.action.kind === 'url' ? hotspot.action : { kind: 'none' },
      'tour-hotspot'
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
      if (hintController.activeIndex !== number) {
        hintController.select(number);
      } else if (hotspot.action.kind !== 'url') onAction(hotspot.action);
    });
    scene.append(button);
  });
  return imageBox;
}
