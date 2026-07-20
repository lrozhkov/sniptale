import type { resolveHighlighterRuntimeDeps } from './controller.helpers';
import { createHighlighterRuntimeActions } from './controller.helpers';
import type { HoverController } from './controller.types';
import type { HighlighterRuntimeState } from './state';

type HighlighterRuntimeDeps = Pick<
  ReturnType<typeof resolveHighlighterRuntimeDeps>,
  'disableRuntime' | 'enableRuntime' | 'logIframeCount'
>;

export function createHighlighterControllerRuntimeActionGroup(props: {
  hoverController: HoverController;
  runtimeDeps: HighlighterRuntimeDeps;
  state: HighlighterRuntimeState;
}) {
  return createHighlighterRuntimeActions({
    disableRuntime: props.runtimeDeps.disableRuntime,
    enableRuntime: props.runtimeDeps.enableRuntime,
    hoverController: props.hoverController,
    logIframeCount: props.runtimeDeps.logIframeCount,
    state: props.state,
  });
}
