import { InspectorShellPanel } from '@sniptale/ui/inspector-shell';

import { translate } from '../../../platform/i18n';
import { getUserFacingErrorDetail } from '../../../platform/i18n/user-facing-error';
import { VIDEO_EDITOR_PANEL_STYLE } from '../../chrome/styles';
import { CatalogSection } from './catalog-section';
import { EffectImportControl, EffectsLibraryHeader } from './header';
import type { EffectLibraryOperationError } from './operations';
import type { VideoEditorEffectsLibraryDockProps } from './types';

const EFFECT_LIBRARY_DOCK_CLASS_NAME = [
  'relative z-20 flex h-full w-[28rem] max-w-[calc(100vw-1.5rem)] shrink-0',
  'max-[980px]:absolute max-[980px]:bottom-3 max-[980px]:left-3 max-[980px]:top-[4.75rem]',
].join(' ');

export function VideoEditorEffectsLibraryDock(
  props: VideoEditorEffectsLibraryDockProps
): React.JSX.Element | null {
  const { disabled, operationError, run } = props.operations;
  if (!props.isOpen) return null;

  return (
    <aside data-ui="video-editor.effects-library.dock" className={EFFECT_LIBRARY_DOCK_CLASS_NAME}>
      <InspectorShellPanel
        style={VIDEO_EDITOR_PANEL_STYLE}
        dataUi="video-editor.effects-library.panel"
      >
        <div className="flex h-full min-h-0 flex-col gap-3 p-3">
          <EffectsLibraryHeader onClose={props.onClose} />
          <EffectImportControl disabled={disabled} onImport={props.onImportEffectFile} run={run} />

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
            className="min-h-0 flex-1 space-y-4 overflow-y-auto"
            aria-busy={disabled || props.isLoading}
          >
            <CatalogSection {...props} disabled={disabled} run={run} />
          </div>
        </div>
      </InspectorShellPanel>
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
