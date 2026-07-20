import { translate } from '../../../../../../platform/i18n';
import { showToast } from '@sniptale/ui/product-feedback/toast-service';

export function showAiParseErrors(errors: string[]) {
  if (errors.length === 0) {
    return;
  }

  showToast(`${translate('content.toolbar.aiParseErrorsPrefix')} ${errors.join('; ')}`, 'warning');
}

export function showAiNoChangesInfo() {
  showToast(translate('content.toolbar.aiNoChanges'), 'info');
}

export function showAiApplyToast(appliedCount: number, notFoundCount: number) {
  if (notFoundCount > 0) {
    showToast(
      [
        translate('content.toolbar.aiAppliedWithMissingPrefix'),
        appliedCount,
        translate('content.toolbar.aiAppliedWithMissingMiddle'),
        notFoundCount,
      ].join(''),
      'warning'
    );
    return;
  }

  showToast(
    [
      translate('content.toolbar.aiAppliedSuccessPrefix'),
      appliedCount,
      translate('content.toolbar.aiAppliedSuccessSuffix'),
    ].join(''),
    'success'
  );
}
