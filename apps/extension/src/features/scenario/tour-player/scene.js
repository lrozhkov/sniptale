import { createTourMotion } from './motion.js';
import { renderTourImage } from './image-scene.js';
import { createTourNavigation } from './navigation.js';
import { createTourHints } from './hints.js';

/** Owns current scene geometry and explanation state, independent from playback history. */
export function createTourScene(root, input, onAction, signal, authoring) {
  let { tour } = input;
  const { assets, labels } = input;
  const media = new Map(assets.map((asset) => [asset.id, asset.src]));
  const query = (name) => root.querySelector(`[data-tour-${name}]`);
  const viewport = query('viewport');
  const stage = query('stage');
  const scene = query('scene');
  const motion = authoring ? null : createTourMotion(root, signal);
  const reducedMotion = () =>
    Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  let current = null;
  let ended = false;
  let selectedObjectId = null;
  let lastFontSize = '';
  let stageWidth = 640;
  let stageHeight = 360;
  const { element, actionButton } = sceneElements(root.ownerDocument, onAction, authoring);
  const hintController = createTourHints(root, tour.style.textAppearance, {
    signal,
    keyboardScope: authoring ? root : null,
    onClose: () => {},
    labels,
    focusTrigger: (activeIndex) => {
      const trigger =
        scene.querySelectorAll('.tour-hotspot')[activeIndex] ??
        scene.querySelector('.tour-details') ??
        query('contents');
      trigger.focus();
    },
  });
  const navigationController = createTourNavigation({
    root,
    labels,
    media,
    element,
    actionButton,
    redraw: render,
  });

  function render() {
    if (signal.aborted) return;
    const focused = root.getRootNode().activeElement;
    scene.replaceChildren();
    let imageBox = null;
    let hints = [];
    const slide = ended ? endSlide(tour, labels) : current;
    if (slide?.kind === 'image') {
      imageBox = renderTourImage(
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
          autoZoom: tour.playback.autoZoom,
        }
      );
      hints = slide.image ? [...slide.hotspots, ...slide.annotations] : [];
    } else if (slide) {
      const rendered = navigationController.render(slide, stageWidth, stageHeight);
      scene.append(rendered.panel);
      hints = rendered.hints;
    } else scene.append(element('p', 'tour-empty', labels.empty));
    hintController.show(hints, { stageWidth, stageHeight, imageBox });
    markTourSelection(scene, selectedObjectId, focused);
  }
  function resize() {
    if (signal.aborted) return;
    const {
      width: nextWidth,
      height: nextHeight,
      fontSize,
    } = measureScene(root, viewport, tour.stage.aspect);
    if (
      nextWidth === stageWidth &&
      nextHeight === stageHeight &&
      fontSize === lastFontSize &&
      stage.style.width
    )
      return;
    lastFontSize = fontSize;
    motion?.cancel({ preserveMediaGate: true });
    stageWidth = nextWidth;
    stageHeight = nextHeight;
    stage.style.width = `${stageWidth}px`;
    stage.style.height = `${stageHeight}px`;
    render();
  }
  applySceneStyle(root, stage, tour);
  return {
    update(next) {
      tour = next.tour;
      media.clear();
      for (const asset of next.assets) media.set(asset.id, asset.src);
      hintController.setDefaultAppearance(tour.style.textAppearance);
      applySceneStyle(root, stage, tour);
    },
    selectObject(id) {
      selectedObjectId = id;
      markTourSelection(scene, selectedObjectId);
      const hintIndex =
        current?.kind === 'image'
          ? [...current.hotspots, ...current.annotations].findIndex((item) => item.id === id)
          : -1;
      if (hintIndex >= 0) hintController.select(hintIndex);
    },
    resize,
    motion,
    openContents: navigationController.openContents,
    show(slide, isEnd) {
      if (signal.aborted) return;
      const previous = motion?.capture() ?? null;
      hintController.reset(current?.id === slide?.id && ended === isEnd);
      current = slide;
      ended = isEnd;
      navigationController.reset();
      render();
      motion?.prepare(
        previous,
        ended ? null : slide,
        tour,
        { stageWidth, stageHeight },
        reducedMotion()
      );
    },
  };
}

function endSlide(tour, labels) {
  const end = tour.endScreen;
  return {
    kind: 'navigation',
    title: end.title,
    description: end.description,
    background: { color: tour.stage.background, image: null },
    buttons: [
      ...(end.button
        ? [{ label: end.button.label, action: { kind: 'url', url: end.button.url } }]
        : []),
      ...(end.restart ? [{ label: labels.restart, action: { kind: 'restart' } }] : []),
    ],
  };
}

function sceneElements(document, onAction, authoring) {
  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function actionButton(label, action, className, objectId = null) {
    const node = element(!authoring && action.kind === 'url' ? 'a' : 'button', className, label);
    if (!authoring && action.kind === 'url') {
      node.href = action.url;
      node.target = '_blank';
      node.rel = 'noopener noreferrer';
    } else {
      node.type = 'button';
      node.addEventListener('click', () =>
        authoring ? authoring.onSelectObject(objectId) : onAction(action)
      );
    }
    if (objectId) node.dataset.tourObjectId = objectId;
    node.title = label;
    return node;
  }
  return { element, actionButton };
}

function applySceneStyle(root, stage, tour) {
  root.style.setProperty('--tour-accent', tour.style.accent);
  root.style.setProperty('--tour-text', tour.style.text);
  root.style.setProperty('--tour-surface', tour.style.surface);
  stage.style.background = tour.stage.background;
}

/** Viewport geometry and font metrics jointly determine scene and explanation layout. */
function measureScene(root, viewport, aspect) {
  const [width, height] = aspect.split(':').map(Number);
  const availableWidth = viewport.clientWidth || 640;
  const availableHeight = viewport.clientHeight || 360;
  const stageWidth = Math.min(availableWidth, (availableHeight * width) / height);
  return {
    width: stageWidth,
    height: (stageWidth * height) / width,
    fontSize: globalThis.getComputedStyle(root).fontSize,
  };
}

function markTourSelection(scene, selectedObjectId, focused) {
  for (const node of scene.querySelectorAll('[data-tour-object-id]'))
    node.dataset.selected = String(node.dataset.tourObjectId === selectedObjectId);
  if (focused?.classList.contains('tour-camera-frame')) {
    scene.querySelector('.tour-camera-frame')?.focus({ preventScroll: true });
    return;
  }
  if (!focused?.classList.contains('tour-resize-handle')) return;
  const objectId = focused.parentElement?.dataset.tourObjectId;
  const handle = [
    ...scene.querySelectorAll('.tour-mask[data-selected=true] .tour-resize-handle'),
  ].find(
    (node) =>
      node.dataset.edge === focused.dataset.edge &&
      node.parentElement.dataset.tourObjectId === objectId
  );
  handle?.focus({ preventScroll: true });
}
