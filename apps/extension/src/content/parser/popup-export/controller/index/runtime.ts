import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import { createPopupExportState, resetPopupExportState } from '../state';
import { createPopupExportRequestHandler } from '../request-handler';
import type { PopupExportRunner } from '../request-handler/types/runtime';
import type { PopupExportState } from '../types';

type PopupExportControllerRuntimeProps = {
  emitMessage: typeof import('../../helpers').emitPopupExportMessage;
  exportRunner: PopupExportRunner;
  parseTree: (contextLabel: string) => Promise<ParsedDOMTree>;
  persistArchive: typeof import('../../helpers').persistPopupExportArchive;
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
    emitMessage: props.emitMessage,
    exportRunner: props.exportRunner,
    parseTree: props.parseTree,
    persistArchive: props.persistArchive,
    state,
  });

  return {
    ...props,
    dispose: () => {
      if (state.isExportRunning) {
        props.exportRunner.cancel();
      }

      resetPopupExportState(state);
    },
    handleRequest,
    state,
  };
}
