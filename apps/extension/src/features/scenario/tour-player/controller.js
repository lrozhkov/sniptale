import { createTourScene } from './scene.js';

/** Owns one mounted player and releases every document listener and resize observer. */
export function createTourPlayer(root, input, options = {}) {
  let { tour } = input;
  const { labels } = input;
  const lifetime = new AbortController();
  const query = (name) => root.querySelector(`[data-tour-${name}]`);
  const viewport = query('viewport');
  const scene = query('scene');
  const title = query('title');
  const counter = query('counter');
  const previous = query('previous');
  const next = query('next');
  const contents = query('contents');
  const navigation = query('navigation');
  let index = 0;
  let ended = false;
  const history = [];
  const view = createTourScene(root, input, act, lifetime.signal, options.authoring);
  function act(action) {
    if (options.authoring) return;
    if (action.kind === 'next') go(index + 1);
    else if (action.kind === 'previous') go(index - 1);
    else if (action.kind === 'restart') {
      history.length = 0;
      go(0, false);
    } else if (action.kind === 'end') go(tour.slides.length);
    else if (action.kind === 'slide')
      go(tour.slides.findIndex((slide) => slide.id === action.slideId));
  }
  function go(target, recordHistory = true) {
    if (
      lifetime.signal.aborted ||
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
    render();
  }
  function back() {
    const target = history.pop();
    go(target ?? Math.max(0, index - 1), false);
  }
  function render() {
    if (lifetime.signal.aborted) return;
    const slide = tour.slides[index];
    title.textContent = ended ? tour.endScreen.title : (slide?.title ?? '');
    counter.textContent = ended
      ? labels.finished
      : `${tour.slides.length ? index + 1 : 0} / ${tour.slides.length}`;
    previous.disabled = !ended && index === 0 && history.length === 0;
    next.disabled =
      ended || !tour.slides.length || (index === tour.slides.length - 1 && !tour.endScreen.enabled);
    view.show(slide, ended);
    root.dataset.slideId = ended ? 'end' : (slide?.id ?? '');
  }
  previous.addEventListener('click', back, { signal: lifetime.signal });
  next.addEventListener('click', () => go(index + 1), { signal: lifetime.signal });
  contents.addEventListener(
    'click',
    () => {
      view.openContents(tour.slides, index, go);
    },
    { signal: lifetime.signal }
  );
  root.ownerDocument.addEventListener(
    'keydown',
    (event) =>
      handleTourKeyboard(event, navigation.open || Boolean(options.authoring), {
        ArrowRight: () => go(index + 1),
        ArrowLeft: back,
        Home: () => go(0),
        End: () => go(tour.slides.length - 1),
      }),
    { signal: lifetime.signal }
  );
  const observer = globalThis.ResizeObserver ? new globalThis.ResizeObserver(view.resize) : null;
  if (observer) observer.observe(viewport);
  else globalThis.addEventListener('resize', view.resize, { signal: lifetime.signal });
  render();
  view.resize();
  return {
    update(nextInput) {
      if (lifetime.signal.aborted) return;
      const previousId = tour.slides[index]?.id;
      tour = nextInput.tour;
      index = Math.max(
        0,
        tour.slides.findIndex((slide) => slide.id === previousId)
      );
      if (!tour.endScreen.enabled) ended = false;
      view.update(nextInput);
      render();
      view.resize();
    },
    selectObject: view.selectObject,
    selectEnd() {
      if (lifetime.signal.aborted) return;
      if (options.authoring) {
        ended = true;
        render();
      } else go(tour.slides.length, false);
    },
    select(slideId) {
      if (lifetime.signal.aborted) return;
      const target = tour.slides.findIndex((slide) => slide.id === slideId);
      if (target >= 0 && (target !== index || ended)) go(target, false);
    },
    dispose() {
      if (lifetime.signal.aborted) return;
      lifetime.abort();
      observer?.disconnect();
      if (navigation.open) navigation.close();
      scene.replaceChildren();
    },
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
  const action = Object.hasOwn(actions, event.key) ? actions[event.key] : null;
  if (!action) return;
  event.preventDefault();
  action();
}
