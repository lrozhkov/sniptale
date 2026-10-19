import { mountStyleInAccessibleDocuments } from '../../../../../platform/frame';
import type { AiPickDomState } from './state';

const AI_PICK_CURSOR_STYLE_ID = 'sniptale-ai-pick-cursor-style';

export function applyAiPickCursorStyles(state: AiPickDomState): void {
  const textContent = `
    body,
    body * {
      cursor: default !important;
    }
    body {
      user-select: none !important;
      -webkit-user-select: none !important;
    }
    .sniptale-toolbar,
    .sniptale-toolbar *,
    .sniptale-modal,
    .sniptale-modal * {
      cursor: pointer !important;
    }
  `;

  state.cleanupCursorStyles?.();
  state.cleanupCursorStyles = mountStyleInAccessibleDocuments({
    styleId: AI_PICK_CURSOR_STYLE_ID,
    textContent,
  });

  state.cursorStyleElement = document.getElementById(
    AI_PICK_CURSOR_STYLE_ID
  ) as HTMLStyleElement | null;
}
