import { useEffect, useRef } from 'react';
import type { PopupExportController } from '../controller';

export type PopupExportLaunch = { tabId: number; startExport: boolean; sourceDocumentId?: string };

function canStartExportFromLaunch(
  launch: PopupExportLaunch | undefined,
  state: PopupExportController['state']
): launch is PopupExportLaunch & { sourceDocumentId: string } {
  return (
    launch?.startExport === true &&
    typeof launch.sourceDocumentId === 'string' &&
    state.derived.canExport &&
    state.tabs.activeSourceMode === 'tabs' &&
    state.tabs.selectedTabIdsInOrder.length === 1 &&
    state.tabs.selectedTabIdsInOrder[0] === launch.tabId
  );
}

export function useAutoExportLaunch(args: {
  controller: PopupExportController;
  isActive: boolean;
  launch?: PopupExportLaunch;
}): void {
  const launchedRef = useRef(false);
  useEffect(() => {
    const launch = args.launch;
    if (
      launchedRef.current ||
      !args.isActive ||
      !canStartExportFromLaunch(launch, args.controller.state)
    ) {
      return;
    }
    launchedRef.current = true;
    void args.controller.actions.handleStartExport(undefined, {
      sourceDocumentId: launch.sourceDocumentId,
    });
  }, [args.controller, args.isActive, args.launch]);
}
