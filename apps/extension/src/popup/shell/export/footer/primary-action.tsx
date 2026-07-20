import { Check, Download, X } from 'lucide-react';

import { translate } from '../../../../platform/i18n';
import { PopupActionButton } from '../../../../ui/popup-shell/action-button';
import { footerPrimaryButtonIconClassName, footerPrimaryIdleButtonIconClassName } from './tokens';

export function ExportFooterPrimaryActionButton(props: {
  canExport: boolean;
  exportTitle: string;
  isExporting: boolean;
  isResultReady: boolean;
  onCancelExport: () => void;
  onResetExportView: () => void;
  onStartExport: () => void;
}) {
  if (props.isExporting) {
    return (
      <PopupActionButton
        icon={X}
        label={translate('popup.export.cancelExportButton')}
        iconClassName={footerPrimaryButtonIconClassName}
        tone="primary"
        dataUi="popup.export.export-button"
        title={translate('popup.export.cancelExportButton')}
        onClick={props.onCancelExport}
      />
    );
  }

  if (props.isResultReady) {
    return (
      <PopupActionButton
        icon={Check}
        label={translate('popup.export.doneButton')}
        iconClassName={footerPrimaryButtonIconClassName}
        tone="primary"
        dataUi="popup.export.export-button"
        title={translate('popup.export.doneButton')}
        onClick={props.onResetExportView}
      />
    );
  }

  return (
    <PopupActionButton
      icon={Download}
      label={translate('popup.export.exportButton')}
      iconClassName={footerPrimaryIdleButtonIconClassName}
      tone="primary"
      dataUi="popup.export.export-button"
      disabled={!props.canExport}
      title={props.exportTitle}
      onClick={props.onStartExport}
    />
  );
}
