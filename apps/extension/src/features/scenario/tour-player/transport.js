/** Disposable transport DOM; elapsed time and navigation remain owned by the player. */
export function createTourTransport(root, labels, signal, onToggle, onSeek) {
  const document = root.ownerDocument;
  const panel = document.createElement('div');
  panel.className = 'tour-playback';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'tour-button';
  button.dataset.tourPlay = '';
  button.addEventListener('click', onToggle, { signal });
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
    button.textContent = state === 'error' ? labels.retry : playing ? labels.pause : labels.play;
    button.title = button.textContent;
    button.disabled = state === 'empty';
    button.setAttribute('aria-pressed', String(playing));
    range.max = String(duration);
    range.value = String(elapsed);
    range.disabled = state === 'empty';
    const text = `${formatTime(elapsed)} / ${formatTime(duration)}`;
    range.setAttribute('aria-valuetext', text);
    time.textContent = text;
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
function formatTime(milliseconds) {
  const seconds = Math.floor(milliseconds / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
