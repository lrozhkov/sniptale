import { Check, Download, FileArchive, FileCode, Library, X } from 'lucide-react';

import { translate } from '../../../../platform/i18n/popup';
import { PopupActionButton } from '../../../../ui/popup-shell/action-button';
import { footerPrimaryButtonIconClassName, footerPrimaryIdleButtonIconClassName } from './tokens';
import type { PopupPackageDestination } from '../data-type/package-controls';

export function ExportFooterPrimaryActionButton(props: {
  canExport: boolean;
  destination?: PopupPackageDestination | undefined;
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
        iconClassName="text-current"
        tone="danger"
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

  const action =
    props.destination === 'save'
      ? { icon: Library, label: translate('popup.export.saveToLibraryButton') }
      : props.destination === 'html'
        ? { icon: FileCode, label: translate('popup.export.packageDestinationHtml') }
        : props.destination === 'export'
          ? { icon: FileArchive, label: translate('popup.export.packageDestinationDownload') }
          : { icon: Download, label: translate('popup.export.exportButton') };

  return (
    <PopupActionButton
      icon={action.icon}
      label={action.label}
      iconClassName={footerPrimaryIdleButtonIconClassName}
      tone="primary"
      dataUi="popup.export.export-button"
      disabled={!props.canExport}
      title={props.canExport ? action.label : props.exportTitle}
      onClick={props.onStartExport}
    />
  );
}
