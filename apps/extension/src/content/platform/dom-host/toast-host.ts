import {
  configureToastHostAdapter,
  type ToastHostAdapter,
} from '@sniptale/ui/product-feedback/toast-service';

import { appendToContentOverlayRoot, queryContentUiElement } from './ui';
import { getContentUiScaleSnapshot, subscribeContentUiScale } from './ui-scale';

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
  getHostStyle: (index) => {
    const uiScale = getContentUiScaleSnapshot();
    return {
      right: `${20 * uiScale}px`,
      top: `${(60 + index * 64) * uiScale}px`,
    };
  },
  isHidden: isContentToastHostHidden,
  subscribePositionChanges: subscribeContentUiScale,
};

export function installContentToastHostAdapter(): () => void {
  configureToastHostAdapter(contentToastHostAdapter);
  return () => configureToastHostAdapter(null);
}
