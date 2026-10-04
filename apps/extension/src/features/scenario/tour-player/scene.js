import { serializePaintToCss } from '@sniptale/foundation/paint';
import { resolveTourCamera, resolveTourFullViewCamera } from './camera.js';
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
function createSceneHints(root, input, policy, signal, getHints, boundary) {
  const scene = root.querySelector('[data-tour-scene]');
  return createTourHints(root, input.tour.style, {
    signal,
    keyboardScope: policy.keyboardScope,
    hideVoice: policy.hideVoice,
    navigation: policy.authoring?.navigation,
    boundary: policy.authoring ? null : boundary,
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
export function createTourScene(root, input, onAction, signal, options = {}, boundary) {
  const policy = scenePolicy(root, options);
  const { authoring } = policy;
  let { tour } = input;
  const { assets, labels } = input;
  const media = new Map(assets.map((asset) => [asset.id, asset.src]));
  const query = (name) => root.querySelector(`[data-tour-${name}]`);
  const viewport = query('viewport');
  const stage = query('stage');
  const scene = query('scene');

  const reducedMotion = () =>
    Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  let current = null;
  let ended = false;
  let fullView = false;
  let selectedObjectId = null;
  let lastFontSize = '';
  let stageWidth = 640;
  let stageHeight = 360;
  let hints = [];
  const updateFullView = createFullViewControl(root, labels, signal, authoring, () =>
    boundary?.fullView?.()
  );
  const refreshFullView = () =>
    updateFullView({
      slide: ended ? null : current,
      viewport: { stageWidth, stageHeight },
      autoZoom: tour.playback.autoZoom,
      fullView,
      state: stage.dataset.motion,
    });
  const motion = authoring ? null : createTourMotion(root, signal, refreshFullView);
  const { element, actionButton } = sceneElements(root.ownerDocument, onAction, policy);
  const hintController = createSceneHints(root, input, policy, signal, () => hints, boundary);
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
    hints = renderSceneContent(
      ended ? endSlide(tour, labels) : current,
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
        style: tour.style,
        fullView,
      },
      navigationController,
      selectedObjectId
    );
    refreshFullView();
  }
  function resize() {
    if (signal.aborted) return;
    const next = resizeTourViewport(root, viewport, stage, tour.stage.aspect, {
      width: stageWidth,
      height: stageHeight,
      fontSize: lastFontSize,
    });
    if (!next) return;
    lastFontSize = next.fontSize;
    stageWidth = next.width;
    stageHeight = next.height;
    render();
    motion?.reflow({ stageWidth, stageHeight });
  }
  applySceneStyle(root, stage, tour, media);
  return {
    update(next) {
      fullView = false;
      tour = next.tour;
      media.clear();
      for (const asset of next.assets) media.set(asset.id, asset.src);
      hintController.setDefaultAppearance(tour.style);
      applySceneStyle(root, stage, tour, media);
    },
    selectObject(id) {
      selectedObjectId = id;
      if (authoring && current?.kind === 'navigation') render();
      markTourSelection(scene, selectedObjectId);
      selectObjectHint(current, id, hintController);
    },
    toggleFullView() {
      if (
        authoring ||
        ended ||
        current?.kind !== 'image' ||
        ['loading', 'error'].includes(stage.dataset.motion)
      )
        return;
      motion?.cancel({ preserveMediaGate: true });
      fullView = !fullView;
      render();
    },
    resize,
    motion,
    openContents: navigationController.openContents,
    closeContents: navigationController.closeContents,
    show(slide, isEnd, hintEdge = 0) {
      if (signal.aborted) return;
      const previous = motion?.capture() ?? null;
      fullView = false;
      hintController.reset(current?.id === slide?.id && ended === isEnd);
      current = slide;
      ended = isEnd;
      navigationController.reset();
      render();
      if (hintEdge)
        hintController.select(hintEdge < 0 ? Math.max(0, hints.length - 1) : 0, hintEdge < 0);
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

/** Selection uses the same authored explanation order as scene rendering. */
function selectObjectHint(slide, id, hints) {
  const index =
    slide?.kind === 'image' ? slideExplanations(slide).findIndex((item) => item.id === id) : -1;
  if (index >= 0) hints.select(index);
}

/** Stable viewport projection only; scene state and motion remain with the caller. */
function resizeTourViewport(root, viewport, stage, aspect, previous) {
  const next = measureScene(root, viewport, aspect);
  if (
    next.width === previous.width &&
    next.height === previous.height &&
    next.fontSize === previous.fontSize &&
    stage.style.width
  )
    return null;
  root.style.setProperty('--tour-frame-width', `${next.width}px`);
  viewport.style.width = stage.style.width = `${next.width}px`;
  viewport.style.height = stage.style.height = `${next.height}px`;
  return next;
}

/** Image and navigation renderers share the scene owner and return its hint projection. */
function renderSceneContent(slide, viewport, context, navigation, selectedObjectId) {
  const { scene, hintController } = context;
  const focused = scene.getRootNode().activeElement;
  scene.replaceChildren();
  const rendered = renderSceneBody(slide, viewport, context, navigation, selectedObjectId);
  hintController.show(rendered.hints, { ...viewport, imageBox: rendered.imageBox });
  markTourSelection(scene, selectedObjectId, focused);
  return rendered.hints;
}

function renderSceneBody(slide, viewport, context, navigation, selectedObjectId) {
  if (slide?.kind === 'image')
    return {
      imageBox: renderTourImage(slide, viewport, context),
      hints: slide.image ? slideExplanations(slide) : [],
    };
  if (slide) {
    const rendered = navigation.render(
      slide,
      viewport.stageWidth,
      viewport.stageHeight,
      selectedObjectId
    );
    context.scene.append(rendered.panel);
    return { imageBox: null, hints: rendered.hints };
  }
  context.scene.append(context.element('p', 'tour-empty', context.labels.empty));
  return { imageBox: null, hints: [] };
}

/** Disposable button projects scene-owned full view; it never owns camera or playback state. */
function createFullViewControl(root, labels, signal, authoring, toggle) {
  if (authoring) return () => {};
  const button = root.ownerDocument.createElement('button');
  button.type = 'button';
  button.className = 'tour-button tour-icon-button';
  button.dataset.tourFullView = '';
  const svg = root.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('aria-hidden', 'true');
  const path = root.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M8 8h8v8H8z');
  svg.append(path);
  button.append(svg);
  button.addEventListener('click', toggle, { signal });
  root.querySelector('.tour-controls').append(button);
  signal.addEventListener('abort', () => button.remove(), { once: true });
  return ({ slide, viewport, autoZoom, fullView, state }) => {
    const authored = slide?.kind === 'image' ? resolveTourCamera(slide, viewport, autoZoom) : null;
    const full = authored ? resolveTourFullViewCamera(slide, viewport) : null;
    button.hidden =
      !authored ||
      !full ||
      ['x', 'y', 'width', 'height'].every((key) => Math.abs(authored[key] - full[key]) < 0.01);
    button.disabled = ['loading', 'error'].includes(state);
    button.setAttribute('aria-pressed', String(fullView));
    const label = fullView
      ? (labels.authoredView ?? 'Authored view')
      : (labels.fullView ?? 'Full slide');
    button.setAttribute('aria-label', label);
    button.title = label;
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

function applySceneStyle(root, stage, tour, media) {
  root.style.setProperty('--tour-accent', tour.style.accent);
  root.style.setProperty('--tour-text', tour.style.text);
  root.style.setProperty('--tour-surface', tour.style.surface);
  stage.style.background = tour.stage.paint
    ? serializePaintToCss(tour.stage.paint)
    : tour.stage.background;
  const source = tour.stage.image && media.get(tour.stage.image.assetId);
  if (source) {
    const underlay = stage.style.backgroundImage;
    stage.style.backgroundImage = `url("${source}")${underlay && underlay !== 'none' ? `, ${underlay}` : ''}`;
    stage.style.backgroundPosition = 'center';
    stage.style.backgroundRepeat = 'no-repeat';
    stage.style.backgroundSize =
      underlay && underlay !== 'none'
        ? `${tour.stage.imageFit ?? 'cover'}, auto`
        : (tour.stage.imageFit ?? 'cover');
  }
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
  if (focused?.matches('.tour-navigation-buttons [data-tour-object-id]')) {
    const buttons = [...scene.querySelectorAll('.tour-navigation-buttons [data-tour-object-id]')];
    const replacement =
      buttons.find((node) => node.dataset.tourObjectId === focused.dataset.tourObjectId) ??
      buttons.find((node) => node.dataset.tourObjectId === selectedObjectId);
    replacement?.focus({ preventScroll: true });
    return;
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
