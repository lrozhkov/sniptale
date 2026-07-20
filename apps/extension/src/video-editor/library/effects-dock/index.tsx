import { InspectorShellPanel } from '@sniptale/ui/inspector-shell';

import {
  BUILT_IN_VIDEO_ANNOTATION_PACKS,
  type VideoAnnotationPack,
  type VideoAnnotationTemplate,
} from '../../../features/video/project/annotation-engine';
import type { VideoAnnotationTemplateCreateInput } from '../../../features/video/project/annotation/template-input';
import { translate } from '../../../platform/i18n';
import { resolveLocalizedText } from '../../../platform/i18n/localized-text';
import { VIDEO_EDITOR_PANEL_STYLE } from '../../chrome/styles';
import { CatalogSection } from './catalog-section';
import type { EffectLibraryOperationError } from './operations';
import type { VideoEditorEffectsLibraryDockProps } from './types';

const EFFECT_LIBRARY_DOCK_CLASS_NAME = [
  'relative z-20 flex h-full w-[34rem] shrink-0',
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
            <NativeAnnotationSection disabled={disabled} onAdd={props.onAddAnnotation} />
          </div>
        </div>
      </InspectorShellPanel>
    </aside>
  );
}

function EffectsLibraryHeader(props: { onClose(): void }): React.JSX.Element {
  return (
    <header className="flex items-start justify-between gap-3">
      <div>
        <h2 className="text-base font-semibold">{translate('videoEditor.effectsLibrary.title')}</h2>
        <p className="text-xs text-[var(--sniptale-color-text-muted)]">
          {translate('videoEditor.effectsLibrary.description')}
        </p>
      </div>
      <button type="button" onClick={props.onClose} aria-label={translate('common.actions.close')}>
        ×
      </button>
    </header>
  );
}

function EffectImportControl(props: {
  disabled: boolean;
  onImport(file: File): Promise<void>;
  run(kind: 'import', action: () => Promise<unknown>): Promise<void>;
}): React.JSX.Element {
  return (
    <label className="inline-flex cursor-pointer items-center justify-center rounded-lg border px-3 py-2 text-sm">
      {translate('videoEditor.effectsLibrary.importPack')}
      <input
        className="sr-only"
        type="file"
        accept=".sniptale-bundle.zip,.sniptale-effect.json,application/zip,application/json"
        disabled={props.disabled}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (file) void props.run('import', () => props.onImport(file));
        }}
      />
    </label>
  );
}

function formatOperationError(error: EffectLibraryOperationError): string {
  const message =
    error.kind === 'import'
      ? translate('videoEditor.effectsLibrary.importFailedWithDetail')
      : error.kind === 'apply'
        ? translate('videoEditor.effectsLibrary.applyFailedWithDetail')
        : error.kind === 'delete'
          ? translate('videoEditor.effectsLibrary.deleteFailedWithDetail')
          : translate('videoEditor.effectsLibrary.updateFailedWithDetail');
  return message.replace('{detail}', error.code);
}

function NativeAnnotationSection(props: {
  disabled: boolean;
  onAdd(input: VideoAnnotationTemplateCreateInput): void;
}): React.JSX.Element {
  return (
    <section aria-labelledby="native-annotation-heading" className="space-y-2">
      <h3 id="native-annotation-heading" className="text-sm font-semibold">
        {translate('videoEditor.effectsLibrary.nativeAnnotationsTitle')}
      </h3>
      {BUILT_IN_VIDEO_ANNOTATION_PACKS.flatMap((pack) =>
        Object.values(pack.templates).flatMap((templates) =>
          templates.map((template) => (
            <button
              type="button"
              className="mr-2 rounded-lg border px-2 py-1 text-xs"
              disabled={props.disabled}
              key={`${pack.packId}:${template.id}`}
              onClick={() => props.onAdd(createAnnotationInput(pack, template))}
            >
              {resolveLocalizedText(template.label)}
            </button>
          ))
        )
      )}
    </section>
  );
}

function createAnnotationInput(
  pack: VideoAnnotationPack,
  template: VideoAnnotationTemplate
): VideoAnnotationTemplateCreateInput {
  return {
    pack,
    packLabel: pack.label,
    packTheme: pack.theme,
    template,
    templateRef: { packId: pack.packId, templateId: template.id },
  };
}
