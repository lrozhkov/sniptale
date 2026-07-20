import type { ActiveTabCapabilities } from '@sniptale/runtime-contracts/tab-capabilities/types';
import { usePopupExportToggles } from '../selection/toggles';
import { getPopupExportDerivedState } from './selectors';
import { usePopupExportSessionState } from './locals';
import type { PopupExportState } from './types';
import type { PopupExportTabSelectionState } from '../selection/tabs/types';

export function usePopupExportState(
  activeTabCapabilities: ActiveTabCapabilities,
  tabSelection: PopupExportTabSelectionState,
  pageAccessDisabledReason: string | null = null
): PopupExportState {
  const toggles = usePopupExportToggles();
  const session = usePopupExportSessionState();
  const derivedState = getPopupExportDerivedState({
    activeTabCapabilities,
    pageAccessDisabledReason,
    toggles,
    session,
    tabSelection,
  });

  return {
    derived: derivedState,
    preferences: toggles,
    session,
    tabs: tabSelection,
  };
}

export { getCanExport } from './selectors';
