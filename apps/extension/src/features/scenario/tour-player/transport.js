const SVG = 'http://www.w3.org/2000/svg';
const FACES = {
  play: { fill: 'currentColor', d: 'M8 5v14l11-7z' },
  pause: { fill: 'currentColor', d: 'M7 5h4v14H7zm6 0h4v14h-4z' },
  retry: { fill: 'none', d: 'M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6' },
};

/** Disposable transport DOM; elapsed time and navigation remain owned by the player. */
export function createTourTransport(root, labels, signal, onToggle, onSeek) {
  const document = root.ownerDocument;
  const panel = document.createElement('div');
  panel.className = 'tour-playback';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'tour-button tour-icon-button';
  button.dataset.tourPlay = '';
  button.addEventListener('click', onToggle, { signal });
  const label = document.createElement('span');
  label.className = 'tour-playback-label';
  const time = document.createElement('span');
  time.className = 'tour-time';
  time.dataset.tourTime = '';
  const range = document.createElement('input');
  range.type = 'range';
  range.min = '0';
  range.step = '100';
  range.className = 'tour-scrub';
  range.dataset.tourSeek = '';
  range.setAttribute('aria-label', labels.seek);
  range.addEventListener('input', () => onSeek(Number(range.value)), { signal });
  const status = document.createElement('span');
  status.className = 'tour-playback-status';
  status.setAttribute('role', 'status');
  panel.append(button, time, range, status);
  root.querySelector('.tour-transport').prepend(panel);
  signal.addEventListener('abort', () => panel.remove(), { once: true });
  return ({ elapsed, duration, playing, state }) => {
    const face = transportFace(state, playing);
    const text = state === 'error' ? labels.retry : playing ? labels.pause : labels.play;
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
    range.disabled = state === 'empty';
    const value = `${formatTime(elapsed)} / ${formatTime(duration)}`;
    range.setAttribute('aria-valuetext', value);
    time.textContent = value;
    status.textContent =
      state === 'blocked'
        ? (labels.audioBlocked ?? labels.play)
        : state === 'loading'
          ? labels.loading
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
  if (state === 'error') return 'retry';
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
