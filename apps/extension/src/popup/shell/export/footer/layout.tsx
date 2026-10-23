import { footerActionGridClassName, footerSurfaceClassName } from './tokens';
import { ExportFooterPrimaryActionButton } from './primary-action';
import { Library } from 'lucide-react';
import { PopupActionButton } from '../../../../ui/popup-shell/action-button';
import type { PopupPackageDestination } from '../data-type/package-controls';

type ExportFooterLayoutProps = {
  canExport: boolean;
  destination?: PopupPackageDestination | undefined;
  exportTitle: string;
  isExporting: boolean;
  isResultReady: boolean;
  onOpenLibraryResult?: (() => void) | undefined;
  onCancelExport: () => void;
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
          destination={props.destination}
          exportTitle={props.exportTitle}
          isExporting={props.isExporting}
          isResultReady={props.isResultReady}
          onCancelExport={props.onCancelExport}
          onResetExportView={props.onResetExportView}
          onStartExport={props.onStartExport}
        />
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
