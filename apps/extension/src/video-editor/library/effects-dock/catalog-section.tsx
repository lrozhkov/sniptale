import type { EffectBundleCatalogEntry } from '../../../features/video/project/effect-bundle/catalog';
import type { VideoProjectEffectTarget } from '../../../features/video/project/effect-instance/types';
import { writeVideoEditorEffectDocumentDragPayload } from '../../contracts/effect-document-drag';
import { getCurrentLocale, translate } from '../../../platform/i18n';
import type { EffectLibraryOperations } from './operations';
import type { VideoEditorEffectsLibraryDockProps } from './types';

export function CatalogSection(
  props: VideoEditorEffectsLibraryDockProps & {
    disabled: boolean;
  } & Pick<EffectLibraryOperations, 'run'>
): React.JSX.Element {
  return (
    <section aria-labelledby="effect-v1-catalog-heading" className="space-y-2">
      <h3 id="effect-v1-catalog-heading" className="text-sm font-semibold">
        {translate('videoEditor.effectsLibrary.effectV1Label')}
      </h3>
      {!props.isLoading && props.catalogs.length === 0 && (
        <p className="text-xs text-[var(--sniptale-color-text-muted)]">
          {translate('videoEditor.effectsLibrary.noImportedPacks')}
        </p>
      )}
      {props.catalogs.map((item) =>
        item.status === 'ready' ? (
          <CatalogEntry key={item.catalog.packId} catalog={item.catalog} {...props} />
        ) : (
          <InvalidCatalogEntry key={item.packId} packId={item.packId} {...props} />
        )
      )}
    </section>
  );
}

function InvalidCatalogEntry(
  props: Pick<VideoEditorEffectsLibraryDockProps, 'onDeleteEffectBundle'> & {
    disabled: boolean;
    packId: string;
  } & Pick<EffectLibraryOperations, 'run'>
): React.JSX.Element {
  return (
    <article className="space-y-2 rounded-xl border p-3" data-state="invalid">
      <h4 className="text-sm font-medium">{translate('videoEditor.effectsLibrary.invalidPack')}</h4>
      <p className="break-all text-xs text-[var(--sniptale-color-text-muted)]">{props.packId}</p>
      <p className="text-xs text-[var(--sniptale-color-danger)]">
        {translate('videoEditor.effectsLibrary.invalidPackDescription')}
      </p>
      <button
        type="button"
        disabled={props.disabled}
        onClick={() => void props.run('delete', () => props.onDeleteEffectBundle(props.packId))}
      >
        {translate('videoEditor.effectsLibrary.deletePack')}
      </button>
    </article>
  );
}

function CatalogEntry(
  props: VideoEditorEffectsLibraryDockProps & {
    catalog: EffectBundleCatalogEntry;
    disabled: boolean;
  } & Pick<EffectLibraryOperations, 'run'>
): React.JSX.Element {
  const { catalog } = props;
  return (
    <article className="space-y-2 rounded-xl border p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-medium">{readLocalized(catalog.label)}</h4>
          <p className="text-xs text-[var(--sniptale-color-text-muted)]">
            {catalog.packId} · {catalog.version}
          </p>
        </div>
        <CatalogActions {...props} />
      </div>
      {catalog.enabled &&
        catalog.documents.map((document) => (
          <CatalogDocument key={document.id} document={document} {...props} />
        ))}
    </article>
  );
}

function CatalogActions(props: Parameters<typeof CatalogEntry>[0]): React.JSX.Element {
  return (
    <div className="flex gap-1">
      <button
        type="button"
        disabled={props.disabled}
        onClick={() =>
          void props.run('update', () =>
            props.onSetEffectBundleEnabled(props.catalog.packId, !props.catalog.enabled)
          )
        }
      >
        {props.catalog.enabled
          ? translate('videoEditor.effectsLibrary.disablePack')
          : translate('videoEditor.effectsLibrary.enablePack')}
      </button>
      <button
        type="button"
        disabled={props.disabled}
        onClick={() =>
          void props.run('delete', () => props.onDeleteEffectBundle(props.catalog.packId))
        }
      >
        {translate('videoEditor.effectsLibrary.deletePack')}
      </button>
    </div>
  );
}

function CatalogDocument(
  props: Parameters<typeof CatalogEntry>[0] & {
    document: EffectBundleCatalogEntry['documents'][number];
  }
): React.JSX.Element {
  const target = resolveDocumentTarget(props.document.kind, props);
  return (
    <div
      className="flex items-center justify-between gap-2 rounded-lg bg-black/10 p-2"
      draggable={!props.disabled}
      onDragStart={(event) =>
        writeVideoEditorEffectDocumentDragPayload(event.dataTransfer, {
          documentId: props.document.id,
          kind: props.document.kind,
          packId: props.catalog.packId,
        })
      }
    >
      <div>
        <p className="text-sm">{props.document.id}</p>
        <p className="text-xs text-[var(--sniptale-color-text-muted)]">{props.document.kind}</p>
      </div>
      <button
        type="button"
        disabled={props.disabled || !target}
        onClick={() =>
          target &&
          void props.run('apply', () =>
            props.onApplyEffect({
              catalog: props.catalog,
              documentId: props.document.id,
              startTime: props.currentTime,
              target,
            })
          )
        }
      >
        {target
          ? translate('videoEditor.effectsLibrary.applyButton')
          : translate('videoEditor.effectsLibrary.incompatibleButton')}
      </button>
    </div>
  );
}

function resolveDocumentTarget(
  kind: EffectBundleCatalogEntry['documents'][number]['kind'],
  props: Pick<VideoEditorEffectsLibraryDockProps, 'selectedClipId' | 'selectedTransitionId'>
): VideoProjectEffectTarget | null {
  if (kind === 'standalone') return { kind: 'scene' };
  if (kind === 'targetEffect') {
    return props.selectedClipId ? { clipId: props.selectedClipId, kind: 'clip' } : null;
  }
  return props.selectedTransitionId
    ? { kind: 'transition', transitionId: props.selectedTransitionId }
    : null;
}

function readLocalized(value: { en: string; ru: string }): string {
  return getCurrentLocale() === 'ru' ? value.ru : value.en;
}
