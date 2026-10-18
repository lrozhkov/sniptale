import { buildTourPlaybackPlan } from '../project/tour-playback-plan';
import { createTourScene } from './scene.js';
import { createTourPlayback } from './playback.js';
import { createTourChrome } from './chrome.js';

/** One entry position owns navigation; scenes and clocks only project that position. */
export function createTourPlayer(root, input, options = {}) {
  const authored = Boolean(options.authoring);
  let plan = buildTourPlaybackPlan(input.tour);
  const project = (tour) =>
    authored ? tour : { ...tour, slides: plan.entries.map((entry) => entry.slide) };
  let tour = project(input.tour);
  const { labels } = input;
  const lifetime = new AbortController();
  delete root.dataset.slideId;
  const scene = root.querySelector('[data-tour-scene]');
  const updatePosition = createTourPosition(root, labels);
  let index = Math.max(
    0,
    authored
      ? tour.slides.findIndex((slide) => slide.id === options.initialSlideId)
      : plan.entries.findIndex((entry) =>
          options.initialActionId
            ? entry.actionId === options.initialActionId
            : entry.sourceSlideId === options.initialSlideId
        )
  );
  let ended = false;
  const { go, manualGo, projectedIndex, canMove } = createTourNavigation({
    signal: lifetime.signal,
    current: () => (ended ? tour.slides.length : index),
    limit: () => (tour.slides.length ? tour.slides.length - Number(!tour.endScreen.enabled) : -1),
    playback: () => playback,
    commit,
  });
  const authoringNavigation = options.authoring?.navigation;
  const view = createTourScene(root, { ...input, tour }, act, lifetime.signal, options, {
    canMove,
    refreshNarration: () => playback?.refreshAudioControls(),
    move: (direction) => manualGo(projectedIndex() + direction, { gesture: true }),
    fullView: () => {
      playback?.interact();
      view.toggleFullView();
    },
    position: (hintIndex) => ({
      index:
        (authored
          ? (plan.entries.find(
              (entry) => entry.actionId === tour.slides[index]?.actions?.[hintIndex]?.object.id
            )?.ordinal ?? 1)
          : (plan.entries[index]?.ordinal ?? 1)) - 1,
      count: plan.actionCount,
    }),
  });
  const chrome = authored ? null : createTourChrome(root, lifetime.signal);
  const playback = authored
    ? null
    : createTourPlayback(
        root,
        { ...input, tour },
        {
          signal: lifetime.signal,
          motion: view.motion,
          navigate: (target, restart = false, immediate = false) =>
            immediate ? commit(target, { restart }) : go(target, { restart }),
          chrome,
        }
      );
  function act(action) {
    if (authored || (options.preview && action.kind === 'url')) return;
    const target =
      action.kind === 'action'
        ? tour.slides.findIndex(
            (slide) =>
              slide.kind === 'image' &&
              slide.actions.some((entry) => entry.object.id === action.actionId)
          )
        : actionSlideIndex(action, tour.slides, projectedIndex());
    if (target !== null) manualGo(target, { gesture: true, restart: action.kind === 'restart' });
    else if (action.kind === 'url') playback?.pause();
    else playback?.interact('point');
  }
  function commit(target, { restart = false } = {}) {
    if (restart) playback?.restartVisit();
    ended = target === tour.slides.length && tour.endScreen.enabled;
    index = Math.min(target, Math.max(0, tour.slides.length - 1));
    render();
  }
  function back() {
    manualGo(ended ? tour.slides.length - 1 : index - 1, { gesture: true });
  }
  function render() {
    if (lifetime.signal.aborted) return;
    const slide = tour.slides[index];
    updatePosition(tour, index, ended, authored ? null : plan);
    navigationInput.updateControls();
    view.show(slide, ended);
    playback?.show(tour, index, ended, input.assets);
    root.dataset.slideId = ended
      ? 'end'
      : authored
        ? (slide?.id ?? '')
        : (plan.entries[index]?.sourceSlideId ?? '');
    root.dataset.actionId = ended || authored ? '' : (plan.entries[index]?.actionId ?? '');
  }
  const navigationInput = mountTourNavigationInput(root, options, lifetime.signal, {
    move: manualGo,
    back,
    index: projectedIndex,
    slides: () => tour.slides,
    space: (next) => (playback?.mode === 'manual' ? next() : playback?.pause()),
    openContents: (select) => {
      playback?.interact();
      view.openContents(
        tour.slides,
        ended ? 'end' : index,
        (target) => {
          if (target !== (ended ? tour.slides.length : index)) select(target);
        },
        tour.endScreen,
        authored ? null : plan
      );
    },
  });
  observeViewport(root, view.resize, lifetime.signal);
  view.resize();
  render();
  return {
    update(nextInput) {
      if (lifetime.signal.aborted) return;
      playback?.interact();
      const key = authored ? tour.slides[index]?.id : plan.entries[index]?.key;
      input = nextInput;
      plan = buildTourPlaybackPlan(input.tour);
      tour = project(input.tour);
      index = Math.max(
        0,
        authored
          ? tour.slides.findIndex((slide) => slide.id === key)
          : plan.entries.findIndex((entry) => entry.key === key)
      );
      if (!tour.endScreen.enabled || !tour.slides.length) ended = false;
      view.update({ ...input, tour });
      view.resize();
      render();
    },
    selectObject(id) {
      if (!authored && id) {
        const target = plan.entries.findIndex((entry) => entry.actionId === id);
        if (target >= 0 && target !== index) manualGo(target);
      } else {
        view.selectObject(id);
        root.dataset.actionId = tour.slides[index]?.actions?.some((entry) => entry.object.id === id)
          ? id
          : '';
      }
      navigationInput.updateControls();
    },
    selectEnd() {
      if (lifetime.signal.aborted) return;
      if (authored) {
        ended = true;
        render();
      } else manualGo(tour.slides.length);
    },
    select(slideId) {
      if (lifetime.signal.aborted) return;
      const target = authored
        ? tour.slides.findIndex((slide) => slide.id === slideId)
        : plan.entries.findIndex((entry) => entry.sourceSlideId === slideId);
      if (target >= 0 && (target !== index || ended)) {
        if (authoringNavigation) go(target);
        else manualGo(target);
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

/** Only the current admitted destination can commit after an exit animation. */
function createTourNavigation({ signal, current, limit, playback, commit }) {
  let pending = null;
  const accepts = (target) => !signal.aborted && target >= 0 && target <= limit();
  const projectedIndex = () => pending?.target ?? current();
  function go(target, command = {}) {
    if (!accepts(target)) return;
    const request = { target };
    pending = request;
    const complete = () => {
      if (pending !== request || signal.aborted) return;
      pending = null;
      commit(target, command);
    };
    if (playback())
      playback().depart({
        complete,
        cancel: () => {
          if (pending === request) pending = null;
        },
      });
    else complete();
  }
  return {
    go,
    projectedIndex,
    canMove: (direction) => accepts(projectedIndex() + direction),
    manualGo(target, command = {}) {
      if (!accepts(target)) return;
      playback()?.interact(command.gesture ? 'navigation' : undefined);
      go(target, command);
    },
  };
}

/** Viewer counters count actions only; authoring retains its slide position. */
function createTourPosition(root, labels) {
  const query = (name) => root.querySelector(`[data-tour-${name}]`);
  const title = query('title');
  const counter = query('counter');
  const previous = query('previous');
  const next = query('next');
  return (tour, index, ended, plan) => {
    const slide = tour.slides[index];
    title.textContent = ended
      ? tour.endScreen.title
      : slide?.title ||
        (plan?.entries[index]?.ordinal ? `${labels.point} ${plan.entries[index].ordinal}` : '');
    counter.textContent = ended
      ? labels.finished
      : plan
        ? plan.entries[index]?.ordinal
          ? `${plan.entries[index].ordinal} / ${plan.actionCount}`
          : ''
        : `${tour.slides.length ? index + 1 : 0} / ${tour.slides.length}`;
    counter.hidden = !counter.textContent;
    query('contents').hidden = !tour.slides.length;
    query('playback').hidden = !tour.slides.length;
    previous.hidden = next.hidden = !tour.slides.length;
    if (!tour.slides.length) title.textContent = labels.empty;
    previous.disabled = !ended && index === 0;
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
      if (options.preview && !event.composedPath().includes(root)) return;
      if (event.key === ' ' && !event.composedPath().includes(root)) {
        const standalone =
          root.getRootNode() === document &&
          document.querySelectorAll('[data-tour-mode]').length === 1 &&
          (event.target === document || event.target === document.body);
        if (!standalone) return;
      }
      handleTourKeyboard(event, navigation.open || Boolean(options.authoring), actions);
    },
    { signal }
  );
}

/** Mounted navigation input routes editor selection and playback commands through their owners. */
function mountTourNavigationInput(root, options, signal, actions) {
  const authoring = options.authoring?.navigation;
  const query = (name) => root.querySelector(`[data-tour-${name}]`);
  function manualGo(target) {
    if (authoring) {
      const slide = actions.slides()[target];
      if (slide) authoring.selectSlide(slide.id);
      return;
    }
    actions.move(target, { gesture: true });
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
