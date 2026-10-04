const SVG = 'http://www.w3.org/2000/svg';
const FACES = {
  manual: {
    fill: 'none',
    d: 'M8 13V6a2 2 0 0 1 4 0v5-7a2 2 0 0 1 4 0v8-5a2 2 0 0 1 4 0v8c0 5-3 7-7 7-3 0-5-2-7-5l-3-4a2 2 0 0 1 3-2l2 2',
  },
  play: { fill: 'currentColor', d: 'M8 5v14l11-7z' },
  pause: { fill: 'currentColor', d: 'M7 5h4v14H7zm6 0h4v14h-4z' },
  retry: { fill: 'none', d: 'M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6' },
  contents: { fill: 'none', d: 'M3 4h18v16H3zM14 4v16M17 8h1M17 12h1M17 16h1' },
  previous: { fill: 'none', d: 'm15 18-6-6 6-6' },
  next: { fill: 'none', d: 'm9 18 6-6-6-6' },
};

/** Disposable transport DOM; elapsed time and navigation remain owned by the player. */
export function createTourTransport(root, labels, signal, onToggle, onSeek, onManual) {
  const document = root.ownerDocument;
  for (const name of ['contents', 'previous', 'next']) {
    const control = root.querySelector(`[data-tour-${name}]`);
    if (!control) continue;
    control.replaceChildren(createIcon(document, FACES[name]));
    control.classList.add('tour-icon-button');
    control.setAttribute('aria-label', labels[name]);
    control.title = labels[name];
  }
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'tour-button tour-icon-button';
  button.dataset.tourPlay = '';
  button.addEventListener('click', onToggle, { signal });
  const manual = document.createElement('button');
  manual.type = 'button';
  manual.className = 'tour-button tour-icon-button';
  manual.dataset.tourManual = '';
  manual.title = labels.manual ?? 'Manual navigation';
  manual.setAttribute('aria-label', manual.title);
  manual.append(createIcon(document, FACES.manual));
  manual.addEventListener('click', onManual, { signal });
  const label = document.createElement('span');
  label.className = 'tour-playback-label';
  const time = document.createElement('span');
  time.className = 'tour-time';
  time.dataset.tourTime = '';
  const range = document.createElement('input');
  range.type = 'range';
  range.min = '0';
  range.step = 'any';
  range.className = 'tour-scrub';
  range.dataset.tourSeek = '';
  range.setAttribute('aria-label', labels.seek);
  range.addEventListener('input', () => onSeek(Number(range.value)), { signal });
  const status = root.querySelector('[data-tour-status]');
  const playback = root.querySelector('[data-tour-playback]');
  playback.append(manual, button, time, range);
  signal.addEventListener('abort', () => playback.replaceChildren(), { once: true });
  return ({ elapsed, duration, playing, state, mode }) => {
    root.dataset.tourMode = mode;
    manual.setAttribute('aria-pressed', String(mode === 'manual'));
    manual.disabled = state === 'empty';
    const face = transportFace(state, playing);
    const text =
      state === 'error' || state === 'audio-error'
        ? labels.retry
        : playing
          ? labels.pause
          : labels.play;
    if (button.dataset.tourFace !== face) {
      button.dataset.tourFace = face;
      button.replaceChildren(createIcon(document, FACES[face]), label);
    }
    label.textContent = text;
    button.setAttribute('aria-label', text);
    button.title = text;
    button.disabled = state === 'empty';
    button.setAttribute('aria-pressed', String(playing));
    range.max = String(duration);
    range.value = String(elapsed);
    range.style.setProperty(
      '--tour-scrub-fill',
      `${duration > 0 ? Math.min(100, Math.max(0, (elapsed / duration) * 100)) : 0}%`
    );
    range.disabled = state === 'empty';
    const value = `${formatTime(elapsed)} / ${formatTime(duration)}`;
    range.setAttribute('aria-valuetext', value);
    time.textContent = value;
    status.textContent =
      state === 'blocked'
        ? (labels.audioBlocked ?? labels.play)
        : state === 'loading'
          ? labels.loading
          : state === 'audio-error'
            ? (labels.audioError ?? labels.mediaError)
            : state === 'error'
              ? labels.mediaError
              : state === 'choice'
                ? labels.choose
                : '';
    status.hidden = !status.textContent;
  };
}
/** One transport face per playback state; the icon carries meaning, the label stays accessible. */
function transportFace(state, playing) {
  if (state === 'error' || state === 'audio-error') return 'retry';
  return playing ? 'pause' : 'play';
}
function createIcon(document, face) {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', face.fill);
  svg.setAttribute('aria-hidden', 'true');
  if (face.fill === 'none') {
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
  }
  const path = document.createElementNS(SVG, 'path');
  path.setAttribute('d', face.d);
  svg.append(path);
  return svg;
}
function formatTime(milliseconds) {
  const seconds = Math.floor(milliseconds / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** Uses the transport icon and accessible vocabulary for explicit narration activation. */
export function createTourNarrationButton(document, label) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'tour-button tour-icon-button';
  button.setAttribute('aria-label', label);
  button.title = label;
  button.append(createIcon(document, FACES.play));
  return button;
}
