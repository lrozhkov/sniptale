import { createExportManagerService } from '../../../export-manager/service';
import { parsePageSnapshotAfterIframePreflight } from '../../../dom-tree-parser/snapshot';
import { emitPopupExportMessage, persistPopupExportArchive } from '../../helpers';
import type { PopupExportController, PopupExportControllerDeps } from '../types';
import { createPopupExportControllerRuntime } from './runtime';

export function createPopupExportController(
  deps: PopupExportControllerDeps = {}
): PopupExportController {
  const runtime = createPopupExportControllerRuntime({
    emitMessage: deps.emitMessage ?? emitPopupExportMessage,
    exportRunner: deps.exportRunner ?? createExportManagerService(),
    parseTree: deps.parseTree ?? parsePageSnapshotAfterIframePreflight,
    persistArchive: deps.persistArchive ?? persistPopupExportArchive,
  });
  const handleRequest: PopupExportController['handleRequest'] = runtime.handleRequest;

  return {
    handleRequest,
    dispose: runtime.dispose,
  };
}
