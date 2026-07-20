import { translate } from '../../../../../platform/i18n';
import type { PopupExportRuntimeContract } from '../state';

export function setStartExportProgress(state: PopupExportRuntimeContract) {
  state.setProgress({
    activeStepKey: null,
    phase: 'scanning',
    message: translate('popup.export.startProgressMessage'),
    current: 0,
    total: 0,
    errors: [],
  });
}
