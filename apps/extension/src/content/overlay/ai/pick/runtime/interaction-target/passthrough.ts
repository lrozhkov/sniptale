const AI_PICK_PASSTHROUGH_UI_SELECTOR = [
  '.sniptale-blocking-overlay',
  '.sniptale-editing-blocking-overlay',
  '.sniptale-frames-container',
  '.sniptale-highlight-container',
  '.sniptale-interactive-frame',
  '.sniptale-frame-container',
].join(', ');

export function isAiPickPassThroughUiElement(target: HTMLElement): boolean {
  return Boolean(target.closest(AI_PICK_PASSTHROUGH_UI_SELECTOR));
}
