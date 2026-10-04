import { resolveTourCamera, resolveTourEditingCamera, tourCameraEnabled } from './camera.js';
import { tourEntranceTiming } from './timing.js';
const bounded = (value) => Math.max(0, Math.min(1, value));
const ease = (value) => value * value * (3 - 2 * value);
const between = (from, to, progress) => from + (to - from) * progress;

/** Visual snapshots only. The playback clock supplies every frame and owns elapsed time. */
export function createTourMotion(root, signal, changed = () => {}) {
  const scene = root.querySelector('[data-tour-scene]');
  const stage = root.querySelector('[data-tour-stage]');
  const hint = root.querySelector('[data-tour-hint]');
  let current = null;
  let highlightPhase = { kind: 'settled', elapsed: 0, reduced: false };
  const highlights = () => projectHighlightPhase(scene, highlightPhase);
  function frame(elapsed) {
    if (!current?.ready || signal.aborted) return;
    current.elapsed = elapsed;
    if (highlightPhase.kind !== 'exit')
      highlightPhase = { ...highlightPhase, kind: 'enter', elapsed };
    highlights();
    if (elapsed >= current.phases.total) {
      const wasSettled = stage.dataset.motion === 'settled';
      settleMotion(current, scene, hint, stage);
      if (!wasSettled) changed();
      return;
    }
    scene.inert = true;
    hint.inert = true;
    hint.style.visibility = 'hidden';
    if (current.previous) stage.append(current.previous.pixels);
    const wasRunning = stage.dataset.motion === 'running';
    stage.dataset.motion = 'running';
    applyMotionFrame(current, scene, stage, elapsed);
    if (!wasRunning) changed();
  }
  function cancel({ preserveMediaGate = false, preserveHighlight = false } = {}) {
    const gate =
      preserveMediaGate && ['loading', 'error'].includes(stage.dataset.motion)
        ? stage.dataset.motion
        : null;
    if (current) settleMotion(current, scene, hint, stage);
    current = null;
    if (!preserveHighlight) highlightPhase = { ...highlightPhase, kind: 'settled', elapsed: 0 };
    highlights();
    scene.inert = false;
    hint.inert = false;
    hint.style.visibility = '';
    stage.dataset.motion = gate ?? 'settled';
    if (gate) {
      scene.inert = true;
      hint.inert = true;
      hint.style.visibility = 'hidden';
    }
    changed();
  }
  signal.addEventListener('abort', cancel, { once: true });
  return {
    capture() {
      const travelling = current?.marker?.isConnected ? pointOf(current.marker) : null;
      cancel({ preserveHighlight: true });
      if (!root.dataset.slideId) return null;
      const points = scene.querySelectorAll('.tour-hotspot');
      const point = travelling ?? (points.length === 1 ? pointOf(points[0]) : null);
      const pixels = scene.cloneNode(true);
      pixels.removeAttribute('data-tour-scene');
      pixels.classList.add('tour-motion-previous');
      pixels.inert = true;
      pixels.setAttribute('aria-hidden', 'true');
      pixels.querySelectorAll('a').forEach((node) => node.removeAttribute('href'));
      return { pixels, point };
    },
    prepare(previous, slide, tour, viewport, reducedMotion) {
      cancel();
      if (signal.aborted) return;
      current = prepareMotion(scene, previous, slide, tour, viewport, reducedMotion);
      highlightPhase = { kind: 'enter', elapsed: 0, reduced: reducedMotion };
      highlights();
      current.ready = false;
      scene.inert = true;
      hint.inert = true;
      hint.style.visibility = 'hidden';
      scene.style.opacity = '0';
      if (previous) stage.append(previous.pixels);
      stage.dataset.motion = 'loading';
      changed();
    },
    ready() {
      if (current) current.ready = true;
      else cancel();
    },
    frame,
    exit(elapsed) {
      if (signal.aborted) return;
      highlightPhase = { ...highlightPhase, kind: 'exit', elapsed };
      highlights();
    },
    cancelExit() {
      highlightPhase = { ...highlightPhase, kind: 'settled', elapsed: 0 };
      highlights();
    },
    reflow(viewport) {
      if (signal.aborted) return;
      if (!current) return cancel({ preserveMediaGate: true, preserveHighlight: true });
      const { ready, elapsed, previous, context } = current;
      settleMotion(current, scene, hint, stage);
      resizeSnapshot(previous, current.viewport, viewport);
      current = prepareMotion(
        scene,
        previous,
        context.slide,
        context.tour,
        viewport,
        context.reducedMotion
      );
      current.ready = ready;
      current.elapsed = elapsed;
      if (ready) return frame(elapsed);
      scene.inert = true;
      hint.inert = true;
      hint.style.visibility = 'hidden';
      scene.style.opacity = '0';
      if (previous) stage.append(previous.pixels);
      stage.dataset.motion = 'loading';
      changed();
    },
    fail() {
      cancel();
      scene.inert = true;
      hint.inert = true;
      hint.style.visibility = 'hidden';
      stage.dataset.motion = 'error';
      changed();
    },
    cancel,
  };
}

/** Effect alpha multiplies immutable rendered base alpha, including baked-redaction zero. */
function projectHighlightPhase(scene, phase) {
  for (const effect of scene.querySelectorAll('[data-tour-highlight]')) {
    const base = Number(effect.dataset.baseOpacity);
    const duration = Number(phase.kind === 'exit' ? effect.dataset.exitMs : effect.dataset.enterMs);
    const progress = duration > 0 ? ease(bounded(phase.elapsed / duration)) : 1;
    const factor =
      phase.reduced || phase.kind === 'settled'
        ? 1
        : phase.kind === 'exit'
          ? duration > 0
            ? 1 - progress
            : 1
          : progress;
    effect.style.opacity = String(base * factor);
  }
}

function pointOf(node) {
  if (!node || node.hidden) return null;
  return { x: parseFloat(node.style.left), y: parseFloat(node.style.top) };
}
function prepareMotion(scene, previous, slide, tour, viewport, reducedMotion) {
  const phases = tourEntranceTiming(tour, slide, reducedMotion);
  const image = slide?.kind === 'image' && slide.image ? slide : null;
  const final = image ? resolveTourCamera(image, viewport, tour.playback.autoZoom) : null;
  const base = tourCameraEnabled(image, tour.playback.autoZoom)
    ? resolveTourEditingCamera(image, viewport)
    : final;
  const targets = scene.querySelectorAll('.tour-hotspot');
  const target = targets.length === 1 && !targets[0].hidden ? targets[0] : null;
  const marker = target ? target.cloneNode(true) : null;
  if (marker) {
    if (previous?.point)
      previous.pixels.querySelectorAll('.tour-hotspot').forEach((node) => node.remove());
    marker.classList.add('tour-motion-hotspot');
    marker.removeAttribute('href');
    marker.tabIndex = -1;
    marker.inert = true;
    marker.setAttribute('aria-hidden', 'true');
  }
  return {
    context: { slide, tour, reducedMotion },
    elapsed: 0,
    previous,
    phases,
    kind: tour.transition.kind,
    viewport,
    plane: scene.querySelector('.tour-image-plane'),
    base,
    final,
    target,
    targets,
    marker,
    image,
  };
}
/** Frozen outgoing pixels retain their geometry while the live scene is rebuilt. */
function resizeSnapshot(previous, from, to) {
  if (!previous) return;
  const scale = previous.scale ?? 1;
  previous.pixels.style.width = `${from.stageWidth / scale}px`;
  previous.pixels.style.height = `${from.stageHeight / scale}px`;
  previous.pixels.style.transformOrigin = 'top left';
  const ratio = to.stageWidth / from.stageWidth;
  previous.scale = scale * ratio;
  previous.pixels.style.transform = `scale(${previous.scale})`;
  if (previous.point) previous.point = { x: previous.point.x * ratio, y: previous.point.y * ratio };
}
function applyMotionFrame(state, scene, stage, elapsed) {
  const switching = state.phases.switchMs ? bounded(elapsed / state.phases.switchMs) : 1;
  const travelling =
    elapsed < state.phases.switchMs
      ? 0
      : state.phases.travelMs
        ? ease(bounded((elapsed - state.phases.switchMs) / state.phases.travelMs))
        : 1;
  scene.style.opacity = state.previous ? '1' : String(switching);
  if (state.previous) state.previous.pixels.style.opacity = String(1 - switching);
  if (state.kind === 'slide') {
    scene.style.transform = `translateX(${(1 - switching) * state.viewport.stageWidth * 0.08}px)`;
    if (state.previous) {
      const offset = -switching * state.viewport.stageWidth * 0.08;
      state.previous.pixels.style.transform = `translateX(${offset}px) scale(${state.previous.scale ?? 1})`;
    }
  }
  let box = state.final;
  if (state.plane && state.base && state.final) {
    const progress = state.phases.cameraMs
      ? ease(bounded((elapsed - state.phases.cameraStartMs) / state.phases.cameraMs))
      : 1;
    box = {
      x: between(state.base.x, state.final.x, progress),
      y: between(state.base.y, state.final.y, progress),
      width: between(state.base.width, state.final.width, progress),
      height: between(state.base.height, state.final.height, progress),
    };
    const scale = box.width / state.final.width;
    const offsetX = box.x - state.final.x * scale;
    const offsetY = box.y - state.final.y * scale;
    state.plane.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
  }
  if (!state.target)
    state.targets.forEach((node) => {
      node.style.visibility = 'hidden';
    });
  if (state.target && state.marker) {
    state.target.style.visibility = 'hidden';
    const point = state.image?.hotspots[0]?.point;
    const destination =
      box && point
        ? { x: box.x + point.x * box.width, y: box.y + point.y * box.height }
        : pointOf(state.target);
    const origin = state.previous?.point ?? destination;
    state.marker.style.left = `${between(origin.x, destination.x, travelling)}px`;
    state.marker.style.top = `${between(origin.y, destination.y, travelling)}px`;
    state.marker.style.opacity = state.previous?.point ? '1' : String(travelling);
    stage.append(state.marker);
  }
}
function settleMotion(state, scene, hint, stage) {
  state.previous?.pixels.remove();
  state.marker?.remove();
  state.targets.forEach((node) => {
    node.style.visibility = '';
  });
  if (state.plane) state.plane.style.transform = '';
  scene.style.opacity = '';
  scene.style.transform = '';
  scene.inert = false;
  hint.inert = false;
  hint.style.visibility = '';
  stage.dataset.motion = 'settled';
}
