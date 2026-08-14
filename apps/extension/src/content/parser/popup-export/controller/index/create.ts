import { createExportManagerService } from '../../../export-manager/service';
import { parsePageSnapshotAfterIframePreflight } from '../../../dom-tree-parser/snapshot';
import type { PopupExportController, PopupExportControllerDeps } from '../types';
import { createPopupExportControllerRuntime } from './runtime';

export function createPopupExportController(
  deps: PopupExportControllerDeps = {}
): PopupExportController {
  const runtime = createPopupExportControllerRuntime({
    exportRunner: deps.exportRunner ?? createExportManagerService(),
    parseTree: deps.parseTree ?? parsePageSnapshotAfterIframePreflight,
  });
  const handleRequest: PopupExportController['handleRequest'] = runtime.handleRequest;

  return {
    handleRequest,
    dispose: runtime.dispose,
  };
}
