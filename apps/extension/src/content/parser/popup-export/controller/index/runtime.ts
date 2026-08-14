import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import { createPopupExportState, resetPopupExportState } from '../state';
import { createPopupExportRequestHandler } from '../request-handler/runtime';
import type { PopupExportRunner, PopupExportState } from '../types';

type PopupExportControllerRuntimeProps = {
  exportRunner: PopupExportRunner;
  parseTree: (contextLabel: string) => Promise<ParsedDOMTree>;
};

type PopupExportControllerRuntime = PopupExportControllerRuntimeProps & {
  handleRequest: ReturnType<typeof createPopupExportRequestHandler>;
  dispose: () => void;
  state: PopupExportState;
};

export function createPopupExportControllerRuntime(
  props: PopupExportControllerRuntimeProps
): PopupExportControllerRuntime {
  const state = createPopupExportState();
  const handleRequest = createPopupExportRequestHandler({
    exportRunner: props.exportRunner,
    parseTree: props.parseTree,
    state,
  });

  return {
    ...props,
    dispose: () => {
      state.activeAbortController?.abort(new Error('Popup export controller was disposed'));
      if (state.isExportRunning) {
        props.exportRunner.cancel();
      }

      resetPopupExportState(state);
    },
    handleRequest,
    state,
  };
}
