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
import type { PopupPagePackageSelection } from '../../../../composition/persistence/popup-export-preferences';
import { getPopupPagePackageSelection } from '../session/selectors';

type PopupExportRuntimePreferences = PopupExportPreferenceActions &
  PopupExportPreferenceValues & {
    hasLoadedPreferences: boolean;
    includeWebCopy: boolean;
    saveSelection: PopupPagePackageSelection;
  };
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
    includeWebCopy: state.preferences.includeWebCopy,
    saveSelection: getPopupPagePackageSelection(state.preferences.save),
    ...state.session.actions,
    ...state.session.copy,
    ...state.session.refs,
    ...state.session.transfer,
    ...state.tabs,
    ...state.derived,
  };
}
