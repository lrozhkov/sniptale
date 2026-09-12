import { useEffect, useRef } from 'react';
const KEYDOWN_LISTENER_OPTIONS = { capture: true };
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const owner = target.closest('[contenteditable]');
  return (
    target.isContentEditable ||
    (owner !== null && owner.getAttribute('contenteditable') !== 'false') ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLInputElement &&
      ![
        'button',
        'checkbox',
        'color',
        'file',
        'hidden',
        'image',
        'radio',
        'range',
        'reset',
        'submit',
      ].includes(target.type))
  );
}
/** Registers Space for one active transport; the context owner releases it on deactivation. */
function registerPlaybackSpaceShortcut(togglePlayback: () => void): () => void {
  const restoreFocusPaint = () =>
    document.documentElement.removeAttribute('data-video-editor-focus');
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.code !== 'Space' || isEditableTarget(event.target)) {
      restoreFocusPaint();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    document.documentElement.setAttribute('data-video-editor-focus', 'playback');
    if (!event.repeat) togglePlayback();
  };
  window.addEventListener('keydown', onKeyDown, KEYDOWN_LISTENER_OPTIONS);
  window.addEventListener('pointerdown', restoreFocusPaint, true);
  window.addEventListener('focusin', restoreFocusPaint, true);
  return () => {
    window.removeEventListener('keydown', onKeyDown, KEYDOWN_LISTENER_OPTIONS);
    window.removeEventListener('pointerdown', restoreFocusPaint, true);
    window.removeEventListener('focusin', restoreFocusPaint, true);
    restoreFocusPaint();
  };
}

/** Keeps transport ownership stable across playback updates while invoking the latest action. */
export function usePlaybackSpaceShortcut(togglePlayback: () => void, enabled = true): void {
  const latestToggle = useRef(togglePlayback);
  latestToggle.current = togglePlayback;
  useEffect(() => {
    if (!enabled) return;
    return registerPlaybackSpaceShortcut(() => latestToggle.current());
  }, [enabled]);
}
