import { createTourNavigation } from './navigation.js';
import { createTourHints } from './hints.js';

const data = globalThis.document.getElementById('tour-data');
const root = globalThis.document.getElementById('tour-player');
if (!data || !root) throw new Error('Missing tour player document');
const { tour, assets, labels } = JSON.parse(data.textContent);
const media = new Map(assets.map((asset) => [asset.id, asset.src]));
const query = (name) => root.querySelector(`[data-tour-${name}]`);
const viewport = query('viewport');
const stage = query('stage');
const scene = query('scene');
const title = query('title');
const counter = query('counter');
const previous = query('previous');
const next = query('next');
const contents = query('contents');
const navigation = query('navigation');
let index = 0;
let ended = false;
let hints = [];
let stageWidth = 640;
let stageHeight = 360;
let imageBox = null;
const history = [];
const hintController = createTourHints(root, tour.style.textAppearance, {
  onClose: () => navigationController.closeDetails(),
  focusTrigger: (activeIndex) => {
    const trigger =
      scene.querySelectorAll('.tour-hotspot')[activeIndex] ??
      scene.querySelector('.tour-details') ??
      contents;
    trigger.focus();
  },
});
const navigationController = createTourNavigation({
  root,
  labels,
  media,
  element,
  actionButton,
  hintController,
  redraw: render,
});

function element(tag, className, text) {
  const node = globalThis.document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function actionButton(label, action, className) {
  const node = element(action.kind === 'url' ? 'a' : 'button', className, label);
  if (action.kind === 'url') {
    node.href = action.url;
    node.target = '_blank';
    node.rel = 'noopener noreferrer';
  } else {
    node.type = 'button';
    node.addEventListener('click', () => act(action));
  }
  node.title = label;
  return node;
}
function act(action) {
  if (action.kind === 'next') go(index + 1);
  else if (action.kind === 'previous') back();
  else if (action.kind === 'restart') go(0);
  else if (action.kind === 'end') go(tour.slides.length);
  else if (action.kind === 'slide')
    go(tour.slides.findIndex((slide) => slide.id === action.slideId));
}
function go(target, recordHistory = true) {
  if (
    target < 0 ||
    target > tour.slides.length ||
    (target === tour.slides.length && !tour.endScreen.enabled)
  )
    return;
  if (recordHistory && (target !== index || ended)) {
    history.push(index);
    if (history.length > 1000) history.shift();
  }
  ended = target === tour.slides.length && tour.endScreen.enabled;
  index = Math.min(target, Math.max(0, tour.slides.length - 1));
  hintController.reset();
  navigationController.reset(ended);
  render();
}
function back() {
  const target = history.pop();
  go(target ?? Math.max(0, index - 1), false);
}
function projection(point) {
  return { x: imageBox.x + point.x * imageBox.width, y: imageBox.y + point.y * imageBox.height };
}
function renderImage(slide) {
  if (!slide.image) {
    scene.append(element('p', 'tour-empty', labels.empty));
    return;
  }
  const scale =
    slide.fit === 'cover'
      ? Math.max(stageWidth / slide.image.width, stageHeight / slide.image.height)
      : Math.min(stageWidth / slide.image.width, stageHeight / slide.image.height);
  imageBox = {
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
    const position = projection(mask.rect);
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
  hints = [...slide.hotspots, ...slide.annotations];
  slide.hotspots.forEach((hotspot, number) => {
    const button = actionButton(
      String(number + 1),
      hotspot.action.kind === 'url' ? hotspot.action : { kind: 'none' },
      'tour-hotspot'
    );
    const point = projection(hotspot.point);
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
      } else if (hotspot.action.kind !== 'url') act(hotspot.action);
    });
    scene.append(button);
  });
}
function renderNavigation(slide) {
  const rendered = navigationController.render(slide, stageWidth, stageHeight);
  scene.append(rendered.panel);
  hints = rendered.hints;
}
function render() {
  scene.replaceChildren();
  imageBox = null;
  hints = [];
  const slide = tour.slides[index];
  title.textContent = ended ? tour.endScreen.title : (slide?.title ?? '');
  counter.textContent = ended
    ? labels.finished
    : `${tour.slides.length ? index + 1 : 0} / ${tour.slides.length}`;
  previous.disabled = !ended && index === 0 && history.length === 0;
  next.disabled =
    ended || !tour.slides.length || (index === tour.slides.length - 1 && !tour.endScreen.enabled);
  if (ended) {
    const end = tour.endScreen;
    renderNavigation({
      title: end.title,
      description: end.description,
      background: { color: tour.stage.background, image: null },
      buttons: [
        ...(end.button
          ? [{ label: end.button.label, action: { kind: 'url', url: end.button.url } }]
          : []),
        ...(end.restart ? [{ label: labels.restart, action: { kind: 'restart' } }] : []),
      ],
    });
  } else if (slide?.kind === 'image') renderImage(slide);
  else if (slide) renderNavigation(slide);
  else scene.append(element('p', 'tour-empty', labels.empty));
  hintController.show(hints, { stageWidth, stageHeight, imageBox });
  root.dataset.slideId = ended ? 'end' : (slide?.id ?? '');
}
function resize() {
  const [width, height] = tour.stage.aspect.split(':').map(Number);
  const availableWidth = viewport.clientWidth || 640;
  const availableHeight = viewport.clientHeight || 360;
  stageWidth = Math.min(availableWidth, (availableHeight * width) / height);
  stageHeight = (stageWidth * height) / width;
  stage.style.width = `${stageWidth}px`;
  stage.style.height = `${stageHeight}px`;
  render();
}
previous.addEventListener('click', back);
next.addEventListener('click', () => go(index + 1));
contents.addEventListener('click', () => {
  let page = Math.floor(index / 12);
  const draw = () => {
    navigation.replaceChildren();
    const close = actionButton(labels.close, { kind: 'none' }, 'tour-button');
    close.addEventListener('click', () => navigation.close());
    navigation.append(close);
    const list = element('div', 'tour-contents-list');
    for (const [offset, slide] of tour.slides.slice(page * 12, page * 12 + 12).entries()) {
      const number = page * 12 + offset;
      const button = actionButton(`${number + 1}. ${slide.title}`, { kind: 'none' }, 'tour-button');
      button.title = slide.title;
      button.addEventListener('click', () => {
        go(number);
        navigation.close();
      });
      list.append(button);
    }
    navigation.append(list);
    const before = actionButton(labels.previous, { kind: 'none' }, 'tour-button');
    const after = actionButton(labels.next, { kind: 'none' }, 'tour-button');
    before.disabled = page === 0;
    after.disabled = (page + 1) * 12 >= tour.slides.length;
    before.addEventListener('click', () => {
      page -= 1;
      draw();
    });
    after.addEventListener('click', () => {
      page += 1;
      draw();
    });
    navigation.append(before, after);
  };
  draw();
  navigation.showModal();
});
globalThis.document.addEventListener('keydown', (event) => {
  if (
    event.defaultPrevented ||
    (event.target instanceof globalThis.Element &&
      event.target.closest('input,textarea,select,[contenteditable]')) ||
    navigation.open
  )
    return;
  if (event.key === 'ArrowRight') {
    event.preventDefault();
    go(index + 1);
  }
  if (event.key === 'ArrowLeft') {
    event.preventDefault();
    back();
  }
  if (event.key === 'Home') {
    event.preventDefault();
    go(0);
  }
  if (event.key === 'End') {
    event.preventDefault();
    go(tour.slides.length - 1);
  }
});
root.style.setProperty('--tour-accent', tour.style.accent);
root.style.setProperty('--tour-text', tour.style.text);
root.style.setProperty('--tour-surface', tour.style.surface);
stage.style.background = tour.stage.background;
if (globalThis.ResizeObserver) new globalThis.ResizeObserver(resize).observe(viewport);
else globalThis.addEventListener('resize', resize);
resize();
