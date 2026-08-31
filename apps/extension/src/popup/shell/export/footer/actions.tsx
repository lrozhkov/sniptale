import { translate } from '../../../../platform/i18n/popup';
import { ExportFooterLayout } from './layout';
import { type PreviewFormat } from '../selection/utils';

type ExportFooterActionsProps = {
  canCopyJson: boolean;
  canCopyMarkdown: boolean;
  canExport: boolean;
  copyJsonTitle: string;
  copyMarkdownTitle: string;
  copiedFormat: PreviewFormat | null;
  disabledTitle?: string | null;
  isExporting: boolean;
  isResultReady: boolean;
  onCancelExport: () => void;
  onCopyJson: () => void;
  onCopyMarkdown: () => void;
  onOpenLibraryResult?: (() => void) | undefined;
  onResetExportView: () => void;
  onStartExport: () => void;
  openLibraryResultTitle?: string | undefined;
};

export function ExportFooterActions(props: ExportFooterActionsProps) {
  const exportTitle = props.disabledTitle ?? translate('popup.export.exportButton');

  return (
    <ExportFooterLayout
      canCopyJson={props.canCopyJson}
      canCopyMarkdown={props.canCopyMarkdown}
      canExport={props.canExport}
      copyJsonTitle={props.copyJsonTitle}
      copyMarkdownTitle={props.copyMarkdownTitle}
      copiedFormat={props.copiedFormat}
      exportTitle={exportTitle}
      isExporting={props.isExporting}
      isResultReady={props.isResultReady}
      onCancelExport={props.onCancelExport}
      onCopyJson={props.onCopyJson}
      onCopyMarkdown={props.onCopyMarkdown}
      onOpenLibraryResult={props.onOpenLibraryResult}
      onResetExportView={props.onResetExportView}
      onStartExport={props.onStartExport}
      openLibraryResultTitle={props.openLibraryResultTitle}
    />
  );
}
