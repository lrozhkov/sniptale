import { createTourMotion } from './motion.js';
import { renderTourImage } from './image-scene.js';
import { createTourNavigation } from './navigation.js';
import { createTourHints } from './hints.js';
import { getTourSlideObjects } from '@sniptale/runtime-contracts/scenario/types/tour';

/** Explanation hints follow the authored mixed-object order; masks stay purely visual. */
function slideExplanations(slide) {
  return getTourSlideObjects(slide)
    .filter((entry) => entry.type !== 'mask')
    .map((entry) => entry.object);
}

/** Mount policy decides interaction affordances once; rendering stays policy-free. */
function scenePolicy(root, options) {
  const authoring = options.authoring ?? null;
  const preview = Boolean(options.preview);
  return {
    authoring,
    // Editor preview never creates an executable link; denied actions stay plain buttons.
    linkedUrls: !authoring && !preview,
    keyboardScope: authoring || preview ? root : null,
    hideVoice: Boolean(authoring),
  };
}

/** Hint interaction wiring follows the mount policy; explanation order stays scene-owned. */
function createSceneHints(root, input, policy, signal, getHints) {
  const scene = root.querySelector('[data-tour-scene]');
  return createTourHints(root, input.tour.style, {
    signal,
    keyboardScope: policy.keyboardScope,
    hideVoice: policy.hideVoice,
    onClose: () => {},
    labels: input.labels,
    focusTrigger: (activeIndex) => {
      const object = getHints()[activeIndex];
      const trigger =
        (object ? scene.querySelector(`[data-tour-object-id="${object.id}"]`) : null) ??
        scene.querySelector('.tour-details') ??
        root.querySelector('[data-tour-contents]');
      trigger.focus();
    },
  });
}

/** Owns current scene geometry and explanation state, independent from playback history. */
export function createTourScene(root, input, onAction, signal, options = {}) {
  const policy = scenePolicy(root, options);
  const { authoring } = policy;
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
  let hints = [];
  const { element, actionButton } = sceneElements(root.ownerDocument, onAction, policy);
  const hintController = createSceneHints(root, input, policy, signal, () => hints);
  const navigationController = createTourNavigation({
    root,
    labels,
    media,
    element,
    actionButton,
    redraw: render,
    authoring,
  });

  function render() {
    if (signal.aborted) return;
    const focused = root.getRootNode().activeElement;
    scene.replaceChildren();
    let imageBox = null;
    hints = [];
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
          maskDefaults: tour.style.maskDefaults,
        }
      );
      hints = slide.image ? slideExplanations(slide) : [];
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
    root.style.setProperty('--tour-frame-width', `${stageWidth}px`);
    viewport.style.width = `${stageWidth}px`;
    viewport.style.height = `${stageHeight}px`;
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
      hintController.setDefaultAppearance(tour.style);
      applySceneStyle(root, stage, tour);
    },
    selectObject(id) {
      selectedObjectId = id;
      markTourSelection(scene, selectedObjectId);
      const hintIndex =
        current?.kind === 'image'
          ? slideExplanations(current).findIndex((item) => item.id === id)
          : -1;
      if (hintIndex >= 0) hintController.select(hintIndex);
    },
    resize,
    motion,
    openContents: navigationController.openContents,
    closeContents: navigationController.closeContents,
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

function sceneElements(document, onAction, policy) {
  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function actionButton(label, action, className, objectId = null) {
    const linked = policy.linkedUrls && action.kind === 'url';
    const node = element(linked ? 'a' : 'button', className, label);
    if (linked) {
      node.href = action.url;
      node.target = '_blank';
      node.rel = 'noopener noreferrer';
    } else {
      node.type = 'button';
      node.addEventListener('click', () =>
        policy.authoring ? policy.authoring.onSelectObject(objectId) : onAction(action)
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
  const spacing = globalThis.getComputedStyle(viewport);
  const horizontal = (parseFloat(spacing.marginLeft) || 0) + (parseFloat(spacing.marginRight) || 0);
  const vertical = (parseFloat(spacing.marginTop) || 0) + (parseFloat(spacing.marginBottom) || 0);
  const toolbarHeight = root.querySelector('.tour-toolbar')?.offsetHeight || 0;
  const availableWidth = Math.max(
    1,
    (root.clientWidth || viewport.clientWidth || 640) - horizontal
  );
  const availableHeight = Math.max(
    1,
    (root.clientHeight || viewport.clientHeight || 360) - toolbarHeight - vertical
  );
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
  const selectedMask = scene.querySelector(
    '.tour-mask[data-selected=true]:not(.tour-camera-frame)'
  );
  const imagePlane = scene.querySelector('.tour-image-plane');
  if (imagePlane) {
    imagePlane.style.zIndex = selectedMask ? '4' : '';
    imagePlane.style.pointerEvents = selectedMask ? 'none' : '';
  }
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
