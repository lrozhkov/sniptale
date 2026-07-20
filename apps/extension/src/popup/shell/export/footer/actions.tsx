import { translate } from '../../../../platform/i18n';
import { ExportFooterLayout } from './layout';
import { type PreviewFormat } from '../selection/utils';

type ExportFooterActionsProps = {
  canCopyJson: boolean;
  canCopyMarkdown: boolean;
  canExport: boolean;
  canSaveWebSnapshot?: boolean | undefined;
  copyJsonTitle: string;
  copyMarkdownTitle: string;
  copiedFormat: PreviewFormat | null;
  disabledTitle?: string | null;
  isExporting: boolean;
  isSavingWebSnapshot?: boolean | undefined;
  isResultReady: boolean;
  onCancelExport: () => void;
  onCopyJson: () => void;
  onCopyMarkdown: () => void;
  onOpenWebSnapshotResult?: (() => void) | undefined;
  onResetExportView: () => void;
  onSaveWebSnapshot?: (() => void) | undefined;
  onStartExport: () => void;
  openWebSnapshotResultMode?: 'gallery' | 'open' | undefined;
  openWebSnapshotResultTitle?: string | undefined;
  saveWebSnapshotTitle?: string | undefined;
};

export function ExportFooterActions(props: ExportFooterActionsProps) {
  const exportTitle = props.disabledTitle ?? translate('popup.export.exportButton');

  return (
    <ExportFooterLayout
      canCopyJson={props.canCopyJson}
      canCopyMarkdown={props.canCopyMarkdown}
      canExport={props.canExport}
      canSaveWebSnapshot={props.canSaveWebSnapshot}
      copyJsonTitle={props.copyJsonTitle}
      copyMarkdownTitle={props.copyMarkdownTitle}
      copiedFormat={props.copiedFormat}
      exportTitle={exportTitle}
      isExporting={props.isExporting}
      isSavingWebSnapshot={props.isSavingWebSnapshot}
      isResultReady={props.isResultReady}
      onCancelExport={props.onCancelExport}
      onCopyJson={props.onCopyJson}
      onCopyMarkdown={props.onCopyMarkdown}
      onOpenWebSnapshotResult={props.onOpenWebSnapshotResult}
      onResetExportView={props.onResetExportView}
      onSaveWebSnapshot={props.onSaveWebSnapshot}
      onStartExport={props.onStartExport}
      openWebSnapshotResultMode={props.openWebSnapshotResultMode}
      openWebSnapshotResultTitle={props.openWebSnapshotResultTitle}
      saveWebSnapshotTitle={props.saveWebSnapshotTitle}
    />
  );
}
