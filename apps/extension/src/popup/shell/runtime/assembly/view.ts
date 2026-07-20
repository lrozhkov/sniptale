import type { PopupRuntimeStateSlice } from '../state';
import type { PopupPageAccessRuntime } from '../page-access';
import type { PopupRuntimeViewState } from '../types/state';

export function assemblePopupViewState(
  state: PopupRuntimeStateSlice,
  pageAccess: PopupPageAccessRuntime
): PopupRuntimeViewState {
  return {
    navigation: {
      isReady: state.session.isReady,
      page: state.session.page,
      showFooter: state.derived.showFooter,
      setPage: state.session.setPage,
    },
    home: {
      quickActions: state.presets.quickActions,
      quickActionsReady: state.presets.quickActionsReady,
      displayMode: state.presets.displayMode,
      viewportPresets: state.presets.viewportPresets,
      homeError: state.session.homeError,
    },
    environment: {
      activeTabCapabilities: state.environment.activeTabCapabilities,
      galleryStatus: state.environment.galleryStatus,
      pageAccess,
    },
  };
}
