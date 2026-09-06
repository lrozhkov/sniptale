import { FloatingChromePanel } from '@sniptale/ui/floating-chrome';

import { translate } from '../../../platform/i18n';
import { getUserFacingErrorDetail } from '../../../platform/i18n/user-facing-error';
import { CatalogSection } from './catalog-section';
import { EffectImportControl, EffectsLibraryHeader } from './header';
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
      <FloatingChromePanel
        className="h-full w-full overflow-hidden"
        dataUi="video-editor.effects-library.panel"
      >
        <div className="flex h-full min-h-0 flex-col">
          <EffectsLibraryHeader
            onClose={props.onClose}
            action={props.headerAction}
            title={props.headerTitle}
          />
          <div className="shrink-0 border-b border-[var(--sniptale-color-border-soft)] px-2 py-1">
            <EffectImportControl
              disabled={disabled}
              onImport={props.onImportEffectFile}
              run={run}
            />
          </div>

          {props.errorCode && (
            <p role="alert" className="text-xs text-[var(--sniptale-color-danger)]">
              {translate('videoEditor.effectsLibrary.catalogLoadErrorWithDetail').replace(
                '{detail}',
                props.errorCode
              )}
            </p>
          )}
          {operationError && (
            <p role="alert" className="text-xs text-[var(--sniptale-color-danger)]">
              {formatOperationError(operationError)}
            </p>
          )}

          <div
            className="min-h-0 flex-1 space-y-3 overflow-y-auto p-2"
            aria-busy={disabled || props.isLoading}
          >
            <CatalogSection {...props} disabled={disabled} run={run} />
          </div>
        </div>
      </FloatingChromePanel>
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
  return `${message} ${getUserFacingErrorDetail('unexpected')}`;
}
