import { translate } from '../../../../platform/i18n/popup';
import { ExportFooterLayout } from './layout';
import type { PopupPackageDestination } from '../data-type/package-controls';

type ExportFooterActionsProps = {
  canExport: boolean;
  destination?: PopupPackageDestination | undefined;
  disabledTitle?: string | null;
  isExporting: boolean;
  isResultReady: boolean;
  onCancelExport: () => void;
  onOpenLibraryResult?: (() => void) | undefined;
  onResetExportView: () => void;
  onStartExport: () => void;
  openLibraryResultTitle?: string | undefined;
};

export function ExportFooterActions(props: ExportFooterActionsProps) {
  const exportTitle = props.disabledTitle ?? translate('popup.export.exportButton');

  return (
    <ExportFooterLayout
      canExport={props.canExport}
      destination={props.destination}
      exportTitle={exportTitle}
      isExporting={props.isExporting}
      isResultReady={props.isResultReady}
      onCancelExport={props.onCancelExport}
      onOpenLibraryResult={props.onOpenLibraryResult}
      onResetExportView={props.onResetExportView}
      onStartExport={props.onStartExport}
      openLibraryResultTitle={props.openLibraryResultTitle}
    />
  );
}
