import { getTourSlideObjects } from '@sniptale/runtime-contracts/scenario/types/tour';
import { createTourScene } from './scene.js';
import { createTourPlayback } from './playback.js';
import { createTourChrome } from './chrome.js';

/** Owns one mounted player and releases every document listener and resize observer. */
export function createTourPlayer(root, input, options = {}) {
  let { tour } = input;
  const { labels } = input;
  const lifetime = new AbortController();
  delete root.dataset.slideId;
  const query = (name) => root.querySelector(`[data-tour-${name}]`);
  const scene = query('scene');
  const updatePosition = createTourPosition(root, labels);
  let index = Math.max(
    0,
    tour.slides.findIndex((slide) => slide.id === options.initialSlideId)
  );
  let ended = false;
  const history = [];
  const authoringNavigation = options.authoring?.navigation;
  const view = createTourScene(root, input, act, lifetime.signal, options, {
    canMove: (direction) =>
      index + direction >= 0 &&
      index + direction < tour.slides.length + Number(tour.endScreen.enabled),
    move: (direction) => {
      playback?.interact();
      go(index + direction, true, direction);
    },
    fullView: () => {
      playback?.interact();
      view.toggleFullView();
    },
    position: (hintIndex) => explanationPosition(tour, index, hintIndex),
  });
  const chrome = options.authoring ? null : createTourChrome(root, lifetime.signal);
  const playback = options.authoring
    ? null
    : createTourPlayback(root, input, {
        signal: lifetime.signal,
        motion: view.motion,
        navigate: (target, restart = false) => {
          if (restart) history.length = 0;
          go(target, !restart);
        },
        chrome,
      });
  function act(action) {
    // Editor preview never executes authored URL actions.
    if (options.authoring || (options.preview && action.kind === 'url')) return;
    if (action.kind !== 'none') playback?.interact();
    if (action.kind === 'restart') history.length = 0;
    const target = actionSlideIndex(action, tour.slides, index);
    if (target !== null) go(target, action.kind !== 'restart');
  }
  function go(target, recordHistory = true, hintEdge = 0) {
    if (
      lifetime.signal.aborted ||
      target < 0 ||
      target > tour.slides.length ||
      (target === tour.slides.length && !tour.endScreen.enabled)
    )
      return;
    if (recordHistory && (target !== index || ended)) {
      history.push(ended ? 'end' : index);
      if (history.length > 1000) history.shift();
    }
    ended = target === tour.slides.length && tour.endScreen.enabled;
    index = Math.min(target, Math.max(0, tour.slides.length - 1));
    render(hintEdge);
  }
  function back() {
    navigationInput.manualGo(previousTourTarget(history, tour, index), false);
  }
  function render(hintEdge = 0) {
    if (lifetime.signal.aborted) return;
    const slide = tour.slides[index];
    updatePosition(tour, index, ended, history.length);
    navigationInput.updateControls();
    view.show(slide, ended, hintEdge);
    playback?.show(tour, index, ended, input.assets);
    root.dataset.slideId = ended ? 'end' : (slide?.id ?? '');
  }
  const navigationInput = mountTourNavigationInput(root, options, lifetime.signal, {
    move: go,
    back,
    index: () => index,
    slides: () => tour.slides,
    interact: () => playback?.interact(),
    space: (next) => {
      if (playback?.mode === 'manual') next();
      else playback?.pause();
    },
    openContents: (select) => {
      playback?.pause();
      view.openContents(tour.slides, ended ? 'end' : index, select, tour.endScreen);
    },
  });
  observeViewport(root, view.resize, lifetime.signal);
  view.resize();
  render();
  return {
    update(nextInput) {
      if (lifetime.signal.aborted) return;
      const previousId = tour.slides[index]?.id;
      input = nextInput;
      tour = nextInput.tour;
      index = Math.max(
        0,
        tour.slides.findIndex((slide) => slide.id === previousId)
      );
      if (!tour.endScreen.enabled) ended = false;
      view.update(nextInput);
      view.resize();
      render();
    },
    selectObject(id) {
      view.selectObject(id);
      navigationInput.updateControls();
    },
    selectEnd() {
      if (lifetime.signal.aborted) return;
      if (options.authoring) {
        ended = true;
        render();
      } else navigationInput.manualGo(tour.slides.length, false);
    },
    select(slideId) {
      if (lifetime.signal.aborted) return;
      const target = tour.slides.findIndex((slide) => slide.id === slideId);
      if (target >= 0 && (target !== index || ended)) {
        if (authoringNavigation) go(target, false);
        else navigationInput.manualGo(target, false);
      }
    },
    dispose() {
      if (lifetime.signal.aborted) return;
      lifetime.abort();
      view.closeContents();
      scene.replaceChildren();
    },
  };
}

/** Resolve transient end history against the current document after live updates. */
function previousTourTarget(history, tour, index) {
  let target = history.pop();
  while (target === 'end' && !tour.endScreen.enabled) target = history.pop();
  return target === 'end' ? tour.slides.length : (target ?? Math.max(0, index - 1));
}

/** Binds navigation DOM once; selection and history remain controller-owned. */
function createTourPosition(root, labels) {
  const query = (name) => root.querySelector(`[data-tour-${name}]`);
  const title = query('title');
  const counter = query('counter');
  const previous = query('previous');
  const next = query('next');
  return (tour, index, ended, historyLength) => {
    const slide = tour.slides[index];
    title.textContent = ended ? tour.endScreen.title : (slide?.title ?? '');
    counter.textContent = ended
      ? labels.finished
      : `${tour.slides.length ? index + 1 : 0} / ${tour.slides.length}`;
    previous.disabled = !ended && index === 0 && historyLength === 0;
    next.disabled =
      ended || !tour.slides.length || (index === tour.slides.length - 1 && !tour.endScreen.enabled);
  };
}

/** Keyboard admission leaves text fields and modal navigation in control of their own keys. */
function handleTourKeyboard(event, navigationOpen, actions) {
  if (
    event.defaultPrevented ||
    navigationOpen ||
    (event.target instanceof globalThis.Element &&
      event.target.closest('input,textarea,select,[contenteditable]'))
  )
    return;
  if (
    event.key === ' ' &&
    (event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.isComposing ||
      isTourNativeControl(event))
  )
    return;
  const action = Object.hasOwn(actions, event.key) ? actions[event.key] : null;
  if (!action) return;
  event.preventDefault();
  if (event.key !== ' ' || !event.repeat) action();
}

/** Viewport observation shares the mounted player abort lifetime. */
function observeViewport(viewport, resize, signal) {
  const observer = globalThis.ResizeObserver ? new globalThis.ResizeObserver(resize) : null;
  if (observer) {
    observer.observe(viewport);
    const toolbar = viewport.querySelector('.tour-toolbar');
    if (toolbar) observer.observe(toolbar);
    signal.addEventListener('abort', () => observer.disconnect(), { once: true });
  } else globalThis.addEventListener('resize', resize, { signal: signal });
}

function isTourNativeControl(event) {
  return event
    .composedPath()
    .some(
      (node) =>
        node instanceof globalThis.Element &&
        node.matches(
          'input,textarea,select,button,a,[contenteditable],' +
            '[role="button"],[role="slider"],[role="combobox"],' +
            '[role="menuitem"],[role="listbox"],[role="switch"]'
        )
    );
}

function bindTourKeyboard(root, navigation, options, signal, actions) {
  if (options.authoring) return;
  const document = root.ownerDocument;
  if (!root.hasAttribute('tabindex')) root.tabIndex = -1;
  root.addEventListener(
    'pointerdown',
    (event) => {
      if (!isTourNativeControl(event)) root.focus({ preventScroll: true });
    },
    { signal }
  );
  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key === ' ' && !event.composedPath().includes(root)) {
        const standalone =
          root.getRootNode() === document &&
          document.querySelectorAll('[data-tour-mode]').length === 1 &&
          (event.target === document || event.target === document.body);
        if (!standalone) return;
      }
      handleTourKeyboard(
        event,
        navigation.open || Boolean(options.authoring) || (options.preview && event.key !== ' '),
        actions
      );
    },
    { signal }
  );
}

/** Mounted navigation input routes editor selection and playback commands through their owners. */
function mountTourNavigationInput(root, options, signal, actions) {
  const authoring = options.authoring?.navigation;
  const query = (name) => root.querySelector(`[data-tour-${name}]`);
  function manualGo(target, recordHistory = true) {
    if (authoring) {
      const slide = actions.slides()[target];
      if (slide) authoring.selectSlide(slide.id);
      return;
    }
    actions.interact();
    actions.move(target, recordHistory);
  }
  query('previous').addEventListener(
    'click',
    () => {
      if (authoring) authoring.move(-1);
      else actions.back();
    },
    { signal }
  );
  function next() {
    if (query('next').disabled) return;
    if (authoring) authoring.move(1);
    else manualGo(actions.index() + 1);
  }
  query('next').addEventListener('click', next, { signal });
  query('contents').addEventListener('click', () => actions.openContents(manualGo), { signal });
  bindTourKeyboard(root, query('navigation'), options, signal, {
    ArrowRight: next,
    ' ': () => actions.space(next),
    ArrowLeft: actions.back,
    Home: () => manualGo(0),
    End: () => manualGo(actions.slides().length - 1),
  });
  return {
    manualGo,
    updateControls() {
      if (!authoring) return;
      query('previous').disabled = !authoring.canMove(-1);
      query('next').disabled = !authoring.canMove(1);
    },
  };
}

/** Empty and navigation slides remain explicit stops in the authored sequence. */
function explanationPosition(tour, slideIndex, hintIndex) {
  const counts = tour.slides.map((slide) =>
    slide.kind === 'image' && slide.image
      ? Math.max(1, getTourSlideObjects(slide).filter((entry) => entry.type !== 'mask').length)
      : 1
  );
  return {
    index: counts.slice(0, slideIndex).reduce((sum, count) => sum + count, 0) + hintIndex,
    count: counts.reduce((sum, count) => sum + count, Number(tour.endScreen.enabled)),
  };
}

/** Resolves authored slide destinations without owning history or playback effects. */
function actionSlideIndex(action, slides, index) {
  switch (action.kind) {
    case 'next':
      return index + 1;
    case 'previous':
      return index - 1;
    case 'restart':
      return 0;
    case 'end':
      return slides.length;
    case 'slide':
      return slides.findIndex((slide) => slide.id === action.slideId);
    default:
      return null;
  }
}
