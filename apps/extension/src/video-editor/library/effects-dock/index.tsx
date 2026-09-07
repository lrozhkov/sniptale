import { translate } from '../../../platform/i18n';
import { CatalogSection } from './catalog-section';
import { EffectImportControl } from './header';
import type { EffectLibraryOperationError } from './operations';
import type { VideoEditorEffectsLibraryDockProps } from './types';

const EFFECT_LIBRARY_DOCK_CLASS_NAME = 'relative flex h-full min-h-0 min-w-0';

export function VideoEditorEffectsLibraryDock(
  props: VideoEditorEffectsLibraryDockProps
): React.JSX.Element | null {
  const { disabled, operationError, run } = props.operations;
  if (!props.isOpen) return null;

  return (
    <aside data-ui="video-editor.effects-library.dock" className={EFFECT_LIBRARY_DOCK_CLASS_NAME}>
      <div className="flex h-full min-h-0 w-full flex-col">
        <div
          className="min-h-0 flex-1 space-y-3 overflow-y-auto p-2"
          aria-busy={disabled || props.isLoading}
        >
          {props.isLoading && (
            <p
              role="status"
              className="px-1 text-xs leading-5 text-[var(--sniptale-color-text-muted)]"
            >
              {translate('videoEditor.effectsLibrary.catalogLoading')}
            </p>
          )}
          {props.errorCode && (
            <p role="alert" className="px-1 text-xs leading-5 text-[var(--sniptale-color-danger)]">
              {translate('videoEditor.effectsLibrary.catalogLoadFailed')}
            </p>
          )}
          {operationError && (
            <p role="alert" className="px-1 text-xs leading-5 text-[var(--sniptale-color-danger)]">
              {formatOperationError(operationError)}
            </p>
          )}
          <CatalogSection {...props} disabled={disabled} run={run} />
        </div>
        <footer
          data-ui="video-editor.effects-library.footer"
          className="shrink-0 border-t border-[var(--sniptale-color-border-soft)] px-2 py-1"
        >
          <EffectImportControl disabled={disabled} onImport={props.onImportEffectFile} run={run} />
        </footer>
      </div>
    </aside>
  );
}

function formatOperationError(error: EffectLibraryOperationError): string {
  const message =
    error.kind === 'import'
      ? translate('videoEditor.effectsLibrary.importFailed')
      : error.kind === 'apply'
        ? translate('videoEditor.effectsLibrary.applyFailed')
        : error.kind === 'delete'
          ? translate('videoEditor.effectsLibrary.deleteFailed')
          : translate('videoEditor.effectsLibrary.updateFailed');
  return message;
}
