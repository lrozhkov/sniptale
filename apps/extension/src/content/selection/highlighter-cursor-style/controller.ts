import { mountStyleInAccessibleDocuments } from '../../platform/frame';

const HIGHLIGHTER_CURSOR_STYLE_ID = 'sniptale-highlighter-cursor-style';

interface HighlighterCursorStyleController {
  dispose: () => void;
  mount: () => void;
  remove: () => void;
}

interface HighlighterCursorStyleControllerDeps {
  mountStyle?: typeof mountStyleInAccessibleDocuments;
}

type HighlighterCursorStyleState = {
  cleanup: (() => void) | null;
};

function createCursorStyleState(): HighlighterCursorStyleState {
  return {
    cleanup: null,
  };
}

function buildCursorStyleText(): string {
  const cursorUrl = [
    `url("data:image/svg+xml,`,
    `%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E`,
    `%3Cpath fill='%23ff671d' d='M5.5 3.21V20.8c0 .45.54.67.85.35`,
    `l4.86-4.86a.5.5 0 0 1 .35-.15h6.87c.48 0 .72-.58.38-.92L6.35 2.85a.5.5 0 0 0-.85.36Z'/%3E`,
    `%3C/svg%3E") 4 4, auto`,
  ].join('');

  return `
    *,
    *::before,
    *::after {
      cursor: ${cursorUrl} !important;
    }
    .sniptale-interactive-frame {
      cursor: pointer !important;
    }
    .sniptale-action-toolbar,
    .sniptale-action-toolbar * {
      cursor: pointer !important;
    }
    .sniptale-resize-handle[data-direction="nw"],
    .sniptale-resize-handle[data-direction="se"] {
      cursor: nwse-resize !important;
    }
    .sniptale-resize-handle[data-direction="ne"],
    .sniptale-resize-handle[data-direction="sw"] {
      cursor: nesw-resize !important;
    }
    .sniptale-resize-handle[data-direction="n"],
    .sniptale-resize-handle[data-direction="s"] {
      cursor: ns-resize !important;
    }
    .sniptale-resize-handle[data-direction="e"],
    .sniptale-resize-handle[data-direction="w"] {
      cursor: ew-resize !important;
    }
  `;
}

/**
 * Creates a reversible controller that owns the injected highlighter cursor style lifecycle.
 */
export function createHighlighterCursorStyleController(
  deps: HighlighterCursorStyleControllerDeps = {}
): HighlighterCursorStyleController {
  const mountStyle = deps.mountStyle ?? mountStyleInAccessibleDocuments;
  const state = createCursorStyleState();

  return {
    mount: () => {
      state.cleanup?.();
      state.cleanup = mountStyle({
        styleId: HIGHLIGHTER_CURSOR_STYLE_ID,
        textContent: buildCursorStyleText(),
      });
    },

    remove: () => {
      state.cleanup?.();
      state.cleanup = null;
    },

    dispose: () => {
      state.cleanup?.();
      state.cleanup = null;
    },
  };
}
