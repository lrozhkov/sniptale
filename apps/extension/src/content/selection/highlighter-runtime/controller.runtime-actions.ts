import { resetHighlighterHoverUi } from './runtime-state.helpers';
import type { HighlighterRuntimeState } from './state';
import type { HoverController } from './controller.types';

export function createHighlighterRuntimeActions(props: {
  disableRuntime: (state: HighlighterRuntimeState, hoverController: HoverController) => void;
  enableRuntime: (state: HighlighterRuntimeState, hoverController: HoverController) => void;
  hoverController: HoverController;
  logIframeCount: () => void;
  state: HighlighterRuntimeState;
}) {
  return {
    disableMode: () => {
      props.disableRuntime(props.state, props.hoverController);
    },
    dispose: () => {
      props.disableRuntime(props.state, props.hoverController);
      resetHighlighterHoverUi(props.hoverController);
    },
    enableMode: () => {
      props.enableRuntime(props.state, props.hoverController);
      props.logIframeCount();
    },
  };
}
