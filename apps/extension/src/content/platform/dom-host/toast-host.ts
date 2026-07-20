import {
  configureToastHostAdapter,
  type ToastHostAdapter,
} from '@sniptale/ui/product-feedback/toast-service';

import { appendToContentOverlayRoot, queryContentUiElement } from './ui';

function isContentToastHostHidden(): boolean {
  const appElement = queryContentUiElement('.sniptale-app');
  if (appElement?.getAttribute('data-hidden') === 'true') {
    return true;
  }

  const showButton = queryContentUiElement('.sniptale-show-toolbar-button');
  return showButton?.getAttribute('data-hidden') === 'true';
}

const contentToastHostAdapter: ToastHostAdapter = {
  appendHost: appendToContentOverlayRoot,
  isHidden: isContentToastHostHidden,
};

export function installContentToastHostAdapter(): () => void {
  configureToastHostAdapter(contentToastHostAdapter);
  return () => configureToastHostAdapter(null);
}
