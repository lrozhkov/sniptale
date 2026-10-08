const editorSelector = '[data-ui="gallery.videoReview.dialog"]';
const layers = '[role="dialog"],[role="alertdialog"],[role="menu"],[role="listbox"],dialog[open]';
const hidden = '[hidden],[aria-hidden="true"],[inert]';

/** Resolve only this editor's focused surface; nested layers retain their own commands. */
export function reviewKeyboardTarget(event: Pick<KeyboardEvent, 'target'>): HTMLElement | null {
  const target = event.target instanceof HTMLElement ? event.target : document.activeElement;
  if (!(target instanceof HTMLElement) || target.closest(hidden)) return null;
  const editor = target.closest(editorSelector);
  if (!editor) return null;
  if (
    Array.from(editor.querySelectorAll(layers)).some(
      (layer) => !layer.closest(hidden) && getComputedStyle(layer).display !== 'none'
    )
  )
    return null;
  return target;
}

/** Native editing and composite widgets own their keys before editor commands. */
export function reviewOwnsKeys(target: HTMLElement): boolean {
  return !!target.closest(
    [
      'input,textarea,select,[contenteditable]:not([contenteditable="false"])',
      '[role="textbox"],[role="combobox"],[role="spinbutton"],[role="separator"]',
      '[role="slider"]:not([data-ui="gallery.videoReview.timePlane"])',
      '[role="listbox"],[role="option"],[role="tablist"],[role="menu"],[role="menuitem"]',
      '[role="radiogroup"],[role="tree"]',
    ].join(',')
  );
}

/** Playback owns Space on commands and sliders; editing and open widgets keep it. */
export function reviewOwnsPlaybackKeys(target: HTMLElement): boolean {
  if (
    target.closest(
      '[data-ui="gallery.videoReview.previewInspector"],[data-ui="gallery.videoReview.previewSettings"]'
    )
  )
    return true;
  if (target.closest('[aria-haspopup][aria-expanded="true"],[role="checkbox"],[role="radio"]'))
    return true;
  return reviewOwnsKeys(target) && !target.closest('input[type="range"],[role="slider"]');
}

/** Button navigation stays local; Space transport is handled separately. */
export function reviewOwnsNavigation(target: HTMLElement): boolean {
  return (
    reviewOwnsKeys(target) ||
    !!target.closest('button,summary,a[href],[role="button"],[role="checkbox"],[role="switch"]')
  );
}

/** F6 cycles workspace regions without altering selection, playback or project history. */
export function focusReviewRegion(target: HTMLElement, backwards: boolean): boolean {
  if (document.fullscreenElement) return false;
  const editor = target.closest(editorSelector);
  if (!editor) return false;
  const regions = ['previewFrame', 'timeline', 'inspector'].flatMap((name) => {
    const region = editor.querySelector<HTMLElement>(`[data-ui="gallery.videoReview.${name}"]`);
    return region && !region.closest(hidden) ? [region] : [];
  });
  if (!regions.length) return false;
  const current = regions.findIndex((region) => region.contains(target));
  const index =
    current < 0
      ? backwards
        ? regions.length - 1
        : 0
      : (current + (backwards ? -1 : 1) + regions.length) % regions.length;
  const next = regions[index];
  if (!next) return false;
  const control = next.querySelector<HTMLElement>(
    next.dataset['ui'] === 'gallery.videoReview.timeline'
      ? '[data-ui="gallery.videoReview.timePlane"]'
      : 'button:not(:disabled),summary,input:not(:disabled),[tabindex="0"]'
  );
  const destination = control ?? next;
  if (!control) destination.tabIndex = -1;
  destination.focus();
  return true;
}
