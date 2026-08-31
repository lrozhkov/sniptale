import { type PreviewFormat } from '../selection/utils';
import { footerActionGridClassName, footerSurfaceClassName } from './tokens';
import { ExportFooterCopyButtons } from './copy-buttons';
import { ExportFooterPrimaryActionButton } from './primary-action';
import { Library } from 'lucide-react';
import { PopupActionButton } from '../../../../ui/popup-shell/action-button';

type ExportFooterLayoutProps = {
  canCopyJson: boolean;
  canCopyMarkdown: boolean;
  canExport: boolean;
  copyJsonTitle: string;
  copyMarkdownTitle: string;
  copiedFormat: PreviewFormat | null;
  exportTitle: string;
  isExporting: boolean;
  isResultReady: boolean;
  onOpenLibraryResult?: (() => void) | undefined;
  onCancelExport: () => void;
  onCopyJson: () => void;
  onCopyMarkdown: () => void;
  onResetExportView: () => void;
  openLibraryResultTitle?: string | undefined;
  onStartExport: () => void;
};

export function ExportFooterLayout(props: ExportFooterLayoutProps) {
  return (
    <div className={footerSurfaceClassName}>
      <div
        className={footerActionGridClassName(
          props.isResultReady,
          Boolean(props.onOpenLibraryResult),
          props.isExporting
        )}
      >
        <ExportFooterPrimaryActionButton
          canExport={props.canExport}
          exportTitle={props.exportTitle}
          isExporting={props.isExporting}
          isResultReady={props.isResultReady}
          onCancelExport={props.onCancelExport}
          onResetExportView={props.onResetExportView}
          onStartExport={props.onStartExport}
        />
        {props.isResultReady || props.isExporting ? null : (
          <ExportFooterCopyButtons
            canCopyJson={props.canCopyJson}
            canCopyMarkdown={props.canCopyMarkdown}
            copyJsonTitle={props.copyJsonTitle}
            copyMarkdownTitle={props.copyMarkdownTitle}
            copiedFormat={props.copiedFormat}
            onCopyJson={props.onCopyJson}
            onCopyMarkdown={props.onCopyMarkdown}
          />
        )}
        {props.isResultReady && props.onOpenLibraryResult && props.openLibraryResultTitle ? (
          <PopupActionButton
            icon={Library}
            iconClassName="text-[var(--sniptale-color-text-primary)]"
            label={props.openLibraryResultTitle}
            centered
            tone="secondary"
            title={props.openLibraryResultTitle}
            onClick={props.onOpenLibraryResult}
          />
        ) : null}
      </div>
    </div>
  );
}
