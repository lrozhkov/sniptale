import { createLazyContentDefaultOwner } from '../../application/default-owner';
import { registerContentMode } from '../../application/mode-session';
import { createHighlighterController } from './controller';

const highlighterControllerOwner = createLazyContentDefaultOwner(createHighlighterController);

export function invalidateFrameCache(): void {
  highlighterControllerOwner.getOwner().invalidateFrameCache();
}

export function enableHighlighterMode(): void {
  highlighterControllerOwner.getOwner().enableMode();
}

export function disableHighlighterMode(): void {
  highlighterControllerOwner.getOwnerIfCreated()?.disableMode();
}

export function registerFrameCallbacks(
  addFrame: (element: HTMLElement) => void,
  removeFrame: (frameId: string) => void,
  clearFrames: () => void,
  hasFrameForElement?: (element: HTMLElement) => boolean
): void {
  highlighterControllerOwner
    .getOwner()
    .registerFrameCallbacks(addFrame, removeFrame, clearFrames, hasFrameForElement);
}

export function clearAllHighlights(): void {
  highlighterControllerOwner.getOwner().clearAllHighlights();
}

export function isHighlighterEnabled(): boolean {
  return highlighterControllerOwner.getOwnerIfCreated()?.isEnabled() ?? false;
}

export function isHighlighterPausedState(): boolean {
  return highlighterControllerOwner.getOwnerIfCreated()?.isPausedState() ?? false;
}

export function pauseHighlighter(): void {
  highlighterControllerOwner.getOwner().pause();
}

export function resumeHighlighter(): void {
  highlighterControllerOwner.getOwner().resume();
}

export function setFrameEditing(): void {
  highlighterControllerOwner.getOwner().setFrameEditing();
}

export function clearFrameEditing(): void {
  highlighterControllerOwner.getOwner().clearFrameEditing();
}

export function setFrameTooltipVisible(): void {
  highlighterControllerOwner.getOwner().setFrameTooltipVisible();
}

export function clearFrameTooltipVisible(): void {
  highlighterControllerOwner.getOwner().clearFrameTooltipVisible();
}

registerContentMode('highlighter', disableHighlighterMode);
