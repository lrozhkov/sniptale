import type {
  PopupExportDerivedState,
  PopupExportPreferenceActions,
  PopupExportPreferenceValues,
  PopupExportSessionActions,
  PopupExportSessionCopyState,
  PopupExportSessionRefs,
  PopupExportSessionTransferState,
  PopupExportState as PopupExportViewState,
} from '../session/types';
export type { PopupExportSelection } from '../session/types';

type PopupExportRuntimePreferences = PopupExportPreferenceActions &
  PopupExportPreferenceValues & { hasLoadedPreferences: boolean };
type PopupExportRuntimeSession = PopupExportSessionActions &
  PopupExportSessionCopyState &
  PopupExportSessionRefs &
  PopupExportSessionTransferState;
type PopupExportRuntimeTabs = PopupExportViewState['tabs'];
type PopupExportRuntimeDerived = PopupExportDerivedState;

export type PopupExportRuntimeContract = PopupExportRuntimePreferences &
  PopupExportRuntimeSession &
  PopupExportRuntimeTabs &
  PopupExportRuntimeDerived;

export function createPopupExportRuntimeState(
  state: PopupExportViewState
): PopupExportRuntimeContract {
  return {
    ...state.preferences.actions,
    ...state.preferences.values,
    hasLoadedPreferences: state.preferences.hasLoadedPreferences,
    ...state.session.actions,
    ...state.session.copy,
    ...state.session.refs,
    ...state.session.transfer,
    ...state.tabs,
    ...state.derived,
  };
}
