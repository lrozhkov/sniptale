import type { ActiveTabCapabilities } from '@sniptale/runtime-contracts/tab-capabilities/types';
import type { PopupPageAccessRuntime } from '../runtime/page-access';
import { usePopupExportRuntime, type PopupExportRuntimeActions } from './runtime';
import { createPopupExportRuntimeState } from './runtime/state';
import { usePopupExportState } from './session';
import type { PopupExportState } from './session/types';
import { usePopupExportTabSelection } from './selection/tabs/state';

type UsePopupExportControllerParams = {
  activeTabCapabilities: ActiveTabCapabilities;
  isActive: boolean;
  pageAccess: PopupPageAccessRuntime;
};

export type PopupExportController = {
  actions: PopupExportRuntimeActions;
  state: PopupExportState;
};

export function usePopupExportController({
  activeTabCapabilities,
  isActive,
  pageAccess,
}: UsePopupExportControllerParams) {
  const tabSelection = usePopupExportTabSelection({
    activeTabCapabilities,
    isActive,
    pageAccessStatus: pageAccess.status,
  });
  const state = usePopupExportState(activeTabCapabilities, tabSelection, pageAccess.disabledReason);
  const actions = usePopupExportRuntime({
    state: createPopupExportRuntimeState(state),
    isActive,
  });

  return {
    actions,
    state,
  };
}
