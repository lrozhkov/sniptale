import { createLazyContentDefaultOwner } from '../../application/default-owner';
import { createHighlighterCursorStyleController } from '../highlighter-cursor-style/controller';

const highlighterCursorStyleControllerOwner = createLazyContentDefaultOwner(
  createHighlighterCursorStyleController
);

export function mountHighlighterCursorStyle() {
  highlighterCursorStyleControllerOwner.getOwner().mount();
}

export function removeHighlighterCursorStyle() {
  highlighterCursorStyleControllerOwner.getOwnerIfCreated()?.remove();
}
