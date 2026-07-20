import { createLogger } from '@sniptale/platform/observability/logger';
import {
  dispatchContentModeDisabled,
  dispatchExitFrameEditing,
} from '../../platform/page-context/mode-events';

const logger = createLogger({ namespace: 'ContentHighlighter:Runtime' });

function isCalloutEscapeTarget(event: KeyboardEvent): boolean {
  const active = document.activeElement as HTMLElement | null;
  if (active?.closest?.('.sniptale-callout')) {
    return true;
  }

  const eventPath =
    typeof event.composedPath === 'function' ? event.composedPath() : [event.target];
  return eventPath.some((target) => {
    return target instanceof Element && Boolean(target.closest('.sniptale-callout'));
  });
}

export function createHighlighterRuntimeEscapeKeyHandler(props: {
  disableHighlighterMode: () => void;
  isAnyFrameEditing: () => boolean;
}) {
  return (event: KeyboardEvent) => {
    if (event.key !== 'Escape') {
      return;
    }

    if (isCalloutEscapeTarget(event)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (props.isAnyFrameEditing()) {
      dispatchExitFrameEditing();
      logger.debug('Escaped from frame editing mode');
      return;
    }

    props.disableHighlighterMode();
    dispatchContentModeDisabled({ mode: 'highlighter' });
  };
}
