import { type PreviewFormat } from '../selection/utils';
import { footerActionGridClassName, footerSurfaceClassName } from './tokens';
import { ExportFooterCopyButtons } from './copy-buttons';
import { ExportFooterPrimaryActionButton } from './primary-action';
import { ExportFooterSnapshotButton } from './snapshot-button';

type ExportFooterLayoutProps = {
  canCopyJson: boolean;
  canCopyMarkdown: boolean;
  canExport: boolean;
  canSaveWebSnapshot?: boolean | undefined;
  copyJsonTitle: string;
  copyMarkdownTitle: string;
  copiedFormat: PreviewFormat | null;
  exportTitle: string;
  isExporting: boolean;
  isSavingWebSnapshot?: boolean | undefined;
  isResultReady: boolean;
  onOpenWebSnapshotResult?: (() => void) | undefined;
  onCancelExport: () => void;
  onCopyJson: () => void;
  onCopyMarkdown: () => void;
  onResetExportView: () => void;
  onSaveWebSnapshot?: (() => void) | undefined;
  openWebSnapshotResultMode?: 'gallery' | 'open' | undefined;
  openWebSnapshotResultTitle?: string | undefined;
  onStartExport: () => void;
  saveWebSnapshotTitle?: string | undefined;
};

export function ExportFooterLayout(props: ExportFooterLayoutProps) {
  const snapshotActionDisabled =
    props.onOpenWebSnapshotResult === undefined && !props.canSaveWebSnapshot;

  return (
    <div className={footerSurfaceClassName}>
      <div className={footerActionGridClassName}>
        <ExportFooterPrimaryActionButton
          canExport={props.canExport}
          exportTitle={props.exportTitle}
          isExporting={props.isExporting}
          isResultReady={props.isResultReady}
          onCancelExport={props.onCancelExport}
          onResetExportView={props.onResetExportView}
          onStartExport={props.onStartExport}
        />
        <ExportFooterCopyButtons
          canCopyJson={props.canCopyJson}
          canCopyMarkdown={props.canCopyMarkdown}
          copyJsonTitle={props.copyJsonTitle}
          copyMarkdownTitle={props.copyMarkdownTitle}
          copiedFormat={props.copiedFormat}
          onCopyJson={props.onCopyJson}
          onCopyMarkdown={props.onCopyMarkdown}
        />
        <ExportFooterSnapshotButton
          disabled={snapshotActionDisabled}
          isSaving={props.isSavingWebSnapshot === true}
          mode={props.openWebSnapshotResultMode ?? 'save'}
          onClick={props.onOpenWebSnapshotResult ?? props.onSaveWebSnapshot ?? (() => {})}
          title={props.openWebSnapshotResultTitle ?? props.saveWebSnapshotTitle ?? ''}
        />
      </div>
    </div>
  );
}
