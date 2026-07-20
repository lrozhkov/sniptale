import { mountStyleInAccessibleDocuments } from '../../../../../platform/frame';
import type { AiPickDomState } from './state';

const AI_PICK_CURSOR_STYLE_ID = 'sniptale-ai-pick-cursor-style';
const cursorSvgUrl =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E" +
  "%3Cpath fill='%23c084fc' d='M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.87c.48 0 .72-.58" +
  ".38-.92L6.35 2.85a.5.5 0 0 0-.85.36Z'/%3E%3C/svg%3E";

export function applyAiPickCursorStyles(state: AiPickDomState): void {
  const textContent = `
    body,
    body * {
      cursor: url("${cursorSvgUrl}") 4 4, auto !important;
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
