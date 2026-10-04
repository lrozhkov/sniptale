import {
  configureToastHostAdapter,
  type ToastHostAdapter,
} from '@sniptale/ui/product-feedback/toast-service';

const HISTORY_SELECTOR = '[data-ui="editor.floating.tool-rail.history"]';
const WORKSPACE_SELECTOR = '[data-ui="editor.floating-workspace"]';

function getEditorToastHostStyle(index: number): Partial<CSSStyleDeclaration> {
  const history = document.querySelector<HTMLElement>(HISTORY_SELECTOR);
  if (!history) {
    return { bottom: 'auto', left: 'auto', right: '20px', top: `${60 + index * 64}px` };
  }
  const rect = history.getBoundingClientRect();
  if (rect.top > window.innerHeight / 2) {
    return {
      bottom: `${Math.round(window.innerHeight - rect.top + 12 + index * 64)}px`,
      left: `${Math.round(rect.left)}px`,
      right: 'auto',
      top: 'auto',
    };
  }
  return {
    bottom: 'auto',
    left: `${Math.round(rect.left)}px`,
    right: 'auto',
    top: `${Math.round(rect.bottom + 12 + index * 64)}px`,
  };
}

const editorToastHostAdapter: ToastHostAdapter = {
  appendHost: (container) => (document.body ?? document.documentElement).appendChild(container),
  getHostStyle: getEditorToastHostStyle,
  isHidden: () => false,
  subscribePositionChanges: (listener) => {
    window.addEventListener('resize', listener);
    const workspace = document.querySelector<HTMLElement>(WORKSPACE_SELECTOR);
    const observer = workspace ? new MutationObserver(listener) : null;
    if (workspace) {
      observer?.observe(workspace, {
        attributes: true,
        attributeFilter: ['style'],
        childList: true,
      });
    }
    return () => {
      window.removeEventListener('resize', listener);
      observer?.disconnect();
    };
  },
};

export function installEditorToastHostAdapter(): () => void {
  configureToastHostAdapter(editorToastHostAdapter);
  return () => configureToastHostAdapter(null);
}
